#!/usr/bin/python3
"""Interface privilegiada mínima: aceita JSON no stdin, nunca comandos shell."""
import json
import fcntl
import stat
import os
import re
import subprocess
import sys
import hashlib
import secrets
import pwd
import io
import tarfile
import tempfile
import time
import shutil
from datetime import datetime, timezone
from pathlib import Path
# Testes importam este arquivo diretamente por spec; em produção os módulos são root-owned no libexec.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_maintenance import (PROJECT_NAME, BACKUP_ROOT as PROJECT_BACKUPS, ProjectError,
    inspect_project, permissions_change, restore_code, backup_code, backup_list, private_backup_root)

DATA = Path('/var/lib/alsistemas')
PROJECTS = Path('/var/www/projetos')
SITES_AVAILABLE = Path('/etc/nginx/sites-available')
SITES_ENABLED = Path('/etc/nginx/sites-enabled')
BACKUPS = Path('/var/backups/alsistemas-vps')
MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
MAX_SNAPSHOT_FILES = 1500
MAX_SNAPSHOTS_PER_PROJECT = 5
NAME = re.compile(r'^[a-z][a-z0-9-]{1,39}$', re.ASCII)
DOMAIN = re.compile(r'^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$', re.ASCII)
RESERVED = {'alsistemas', 'iguatamaonline'}
MANAGED_MARKERS = ('# AL-SISTEMAS-MANAGED-SITE', '# Gerenciado pelo AL Sistemas; não altera sites existentes.')

class TaskError(Exception):
    pass


def valid_name(value):
    if not isinstance(value, str) or not NAME.fullmatch(value) or value in RESERVED or '--' in value:
        raise TaskError('Nome inválido ou reservado (2-40 caracteres, minúsculas e hífen).')
    return value


def valid_domain(value):
    if value is None or value == '':
        return None
    if not isinstance(value, str) or not DOMAIN.fullmatch(value) or value.endswith('.local'):
        raise TaskError('Domínio inválido; informe um FQDN público em minúsculas.')
    return value


def ensure_safe_root(root):
    if not root.is_dir() or root.is_symlink():
        raise TaskError('Raiz de projetos ausente ou não confiável.')
    if root.resolve(strict=True) != root:
        raise TaskError('Caminho de projetos não canônico.')
    # Diretório oficial não pode ser controlado por usuários comuns.
    if root == PROJECTS:
        st = root.stat()
        if st.st_uid != 0 or st.st_mode & 0o022:
            raise TaskError('Raiz oficial de projetos deve pertencer ao root e não ser gravável pelo grupo/outros.')


def domain_in_use(domain, available, extra=None):
    dirs = [available]
    if extra:
        dirs.extend(extra)
    for directory in dirs:
        if not directory.exists():
            continue
        for f in directory.iterdir():
            try:
                if not f.is_file() or f.stat().st_size > 200_000:
                    continue
                text = f.read_text(encoding='utf-8', errors='replace')
                for match in re.finditer(r'(?m)^\s*server_name\s+([^;]+);', text):
                    if domain in match.group(1).split():
                        return True
            except (OSError, UnicodeError):
                continue
    return False


def nginx_config(name, domain, site_type, root=PROJECTS):
    public = root / name / 'public'
    if site_type == 'php':
        location = '''location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
    location ~ /\\. { deny all; }'''
    else:
        location = '''location / { try_files $uri $uri/ =404; }
    location ~ /\\. { deny all; }'''
    return f'''# AL-SISTEMAS-MANAGED-SITE
# Gerenciado pelo AL Sistemas; não altera sites existentes.
server {{
    listen 80;
    server_name {domain};
    root {public};
    index {'index.php index.html' if site_type == 'php' else 'index.html'};
    access_log /var/log/nginx/als-{name}-access.log;
    error_log /var/log/nginx/als-{name}-error.log warn;
    client_max_body_size 10m;
    {location}
}}
'''


def create_project(task, root=PROJECTS, available=SITES_AVAILABLE, enabled=SITES_ENABLED, runner=subprocess.run):
    if set(task) - {'action', 'name', 'type', 'domain'}:
        raise TaskError('Campos desconhecidos na tarefa.')
    name = valid_name(task.get('name'))
    site_type = task.get('type')
    if site_type not in ('static', 'php'):
        raise TaskError('Tipo não permitido. Apenas static e php nesta versão.')
    domain = valid_domain(task.get('domain'))
    ensure_safe_root(root)
    target = root / name
    if target.exists() or target.is_symlink():
        raise TaskError('Projeto já existe; nenhuma alteração realizada.')
    if domain:
        if not available.is_dir() or not enabled.is_dir():
            raise TaskError('Diretórios de configuração Nginx indisponíveis.')
        config_path = available / f'als-{name}.conf'
        enabled_path = enabled / f'als-{name}.conf'
        if config_path.exists() or config_path.is_symlink() or enabled_path.exists() or enabled_path.is_symlink():
            raise TaskError('Configuração Nginx já existe; nenhuma alteração realizada.')
        if domain_in_use(domain, available, [enabled, Path('/etc/nginx/conf.d')]):
            raise TaskError('Domínio já encontrado em uma configuração Nginx; operação recusada.')
        if site_type == 'php' and not Path('/run/php/php8.3-fpm.sock').exists():
            raise TaskError('PHP-FPM 8.3 indisponível; instale-o antes de cadastrar site PHP.')
    # Exclusividade: mkdir sem exist_ok, impedindo sobrescrita por corridas.
    target.mkdir(mode=0o755)
    public = target / 'public'
    created_config = False
    created_link = False
    try:
        public.mkdir(mode=0o755)
        index = public / ('index.php' if site_type == 'php' else 'index.html')
        if site_type == 'php':
            index.write_text('<?php echo "Projeto criado pelo AL Sistemas.";\n', encoding='utf-8')
        else:
            index.write_text('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Projeto novo</title><h1>Projeto criado pelo AL Sistemas</h1></html>\n', encoding='utf-8')
        index.chmod(0o644)
        # Metadados somente de origem, nunca executáveis e nunca usados como autorização root.
        info = target / '.alsistemas.json'
        info.write_text(json.dumps({'managedBy': 'AL Sistemas', 'type': site_type, 'domain': domain}, ensure_ascii=False) + '\n', encoding='utf-8')
        info.chmod(0o644)
        if domain:
            fd = os.open(config_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                out.write(nginx_config(name, domain, site_type, root))
            created_config = True
            enabled_path.symlink_to(config_path)
            created_link = True
            check = nginx_validation_result(runner)
            if check.returncode:
                raise TaskError('nginx -t reprovou a configuração; alterações revertidas.')
            reload = runner(['/bin/systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=15)
            if reload.returncode:
                raise TaskError('Falha ao recarregar Nginx; alterações revertidas.')
    except Exception:
        if created_link:
            enabled_path.unlink(missing_ok=True)
        if created_config:
            config_path.unlink(missing_ok=True)
        # Uma falha depois de recarregar pode ter aplicado a config em memória.
        if created_link or created_config:
            try:
                nginx_validation_result(runner)
                runner(['/bin/systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=15)
            except Exception:
                pass
        # remove apenas os arquivos que esta operação criou; nunca toca outro projeto.
        if public.exists() and not public.is_symlink():
            for item in public.iterdir():
                if item.is_file() and not item.is_symlink():
                    item.unlink()
            public.rmdir()
        info = target / '.alsistemas.json'
        if info.is_file() and not info.is_symlink():
            info.unlink()
        target.rmdir()
        raise
    return {'ok': True, 'name': name, 'type': site_type, 'domain': domain,
            'nginxConfigured': bool(domain), 'path': str(target)}



def managed_site_config(name, available, root):
    """Só configurações root-owned geradas por AL Sistemas podem ser gerenciadas."""
    config = available / f'als-{name}.conf'
    if config.is_symlink() or not config.is_file():
        raise TaskError('Configuração gerenciada inexistente ou não confiável.')
    st = config.stat()
    if st.st_uid != 0 and str(available) == str(SITES_AVAILABLE):
        raise TaskError('Configuração Nginx não pertence ao root.')
    if not stat.S_ISREG(st.st_mode) or st.st_size > 32_768 or st.st_mode & 0o022:
        raise TaskError('Permissões ou tamanho da configuração Nginx inseguros.')
    text = config.read_text(encoding='utf-8')
    if not text.startswith(MANAGED_MARKERS):
        raise TaskError('O arquivo não é reconhecido como configuração gerenciada pelo AL Sistemas.')
    expected_root = str(root / name / 'public')
    if not re.search(r'(?m)^\s*root\s+' + re.escape(expected_root) + r';\s*$', text):
        raise TaskError('A raiz declarada no Nginx não coincide com o projeto.')
    if not (root / name).is_dir() or (root / name).is_symlink():
        raise TaskError('Diretório do projeto ausente ou não confiável.')
    found = re.findall(r'(?m)^\s*server_name\s+([^;]+);', text)
    if len(found) != 1 or len(found[0].split()) != 1:
        raise TaskError('Configuração Nginx com domínios ambíguos.')
    domain = valid_domain(found[0].strip())
    if not domain:
        raise TaskError('Configuração Nginx sem domínio válido.')
    return config, domain


def set_site_state(task, root=PROJECTS, available=SITES_AVAILABLE, enabled=SITES_ENABLED,
                   runner=subprocess.run):
    """Ativa/desativa *somente* um link simbólico do próprio painel; nunca remove site."""
    if set(task) - {'action', 'name', 'enabled'} or type(task.get('enabled')) is not bool:
        raise TaskError('Parâmetros de ativação inválidos.')
    name = valid_name(task.get('name'))
    ensure_safe_root(root)
    if not available.is_dir() or not enabled.is_dir() or enabled.is_symlink():
        raise TaskError('Diretórios Nginx indisponíveis ou não confiáveis.')
    config, domain = managed_site_config(name, available, root)
    link = enabled / f'als-{name}.conf'
    if link.is_symlink():
        if os.readlink(link) != str(config):
            raise TaskError('Link Nginx aponta para outra configuração; recusado.')
        current = True
    elif link.exists():
        raise TaskError('Existe arquivo de terceiros no destino; recusado.')
    else:
        current = False
    desired = task['enabled']
    if current == desired:
        return {'ok': True, 'name': name, 'domain': domain, 'enabled': current, 'unchanged': True}
    if desired and domain_in_use(domain, enabled, [Path('/etc/nginx/conf.d')]):
        raise TaskError('Domínio já está ativo em outra configuração; recusado.')
    if desired:
        link.symlink_to(config)
    else:
        link.unlink()
    try:
        check = nginx_validation_result(runner)
        if check.returncode:
            raise TaskError('Nginx rejeitou a alteração; estado anterior restaurado.')
        reload = runner(['/bin/systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=15)
        if reload.returncode:
            raise TaskError('Falha ao recarregar Nginx; estado anterior restaurado.')
    except Exception:
        if desired:
            link.unlink(missing_ok=True)
        else:
            link.symlink_to(config)
        # Se houve reload parcial, restaurar configuração ativa também.
        try:
            nginx_validation_result(runner)
            runner(['/bin/systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=15)
        except Exception:
            pass
        raise
    return {'ok': True, 'name': name, 'domain': domain, 'enabled': desired, 'unchanged': False}



def nginx_validation_result(runner=subprocess.run):
    """Roda nginx -t fora do namespace read-only do processo web.

    Somente a unidade root-owned fixa pode ser iniciada; a requisição não
    controla caminho, comando, argumentos ou conteúdo da unidade.
    """
    return runner(['/usr/bin/systemctl', 'start', 'alsistemas-nginx-check.service'],
                  capture_output=True, text=True, timeout=25)


def validate_nginx(task, runner=subprocess.run):
    """Diagnóstico limitado: nunca altera ou recarrega configurações."""
    if set(task) != {'action'}:
        raise TaskError('Parâmetros não permitidos no diagnóstico.')
    check = nginx_validation_result(runner)
    return {'ok': True, 'valid': check.returncode == 0,
            'diagnostic': 'Configuração Nginx válida no ambiente do servidor.' if check.returncode == 0 else
            'Verificação no servidor falhou. Consulte sudo nginx -t e journalctl -u alsistemas-nginx-check.service pelo SSH.'}


def check_backup_root(folder):
    if not folder.is_dir() or folder.is_symlink() or folder.resolve(strict=True) != folder:
        raise TaskError('Diretório de backups ausente ou não confiável.')
    st = folder.stat()
    if st.st_mode & 0o077:
        raise TaskError('Backups devem ficar em diretório privado (0700).')
    if folder == BACKUPS and st.st_uid != 0:
        raise TaskError('Backups devem pertencer ao root.')


def snapshot_source(name, root):
    ensure_safe_root(root)
    folder = root / name
    if folder.is_symlink() or not folder.is_dir():
        raise TaskError('Projeto não encontrado ou é link simbólico.')
    st = folder.stat()
    if st.st_mode & 0o022 or (root == PROJECTS and st.st_uid != 0):
        raise TaskError('Permissões do projeto não são seguras para backup privilegiado.')
    marker = folder / '.alsistemas.json'
    if marker.is_symlink() or not marker.is_file():
        raise TaskError('Projeto externo: backups exigem criação pelo AL Sistemas.')
    mst = marker.stat()
    if mst.st_size > 4096 or mst.st_mode & 0o022 or (root == PROJECTS and mst.st_uid != 0):
        raise TaskError('Metadados do projeto não são confiáveis.')
    try:
        data = json.loads(marker.read_text(encoding='utf-8'))
    except (ValueError, UnicodeError):
        raise TaskError('Metadados do projeto inválidos.')
    if data.get('managedBy') != 'AL Sistemas' or data.get('type') not in ('php', 'static'):
        raise TaskError('Projeto não é elegível ao backup público.')
    public = folder / 'public'
    if public.is_symlink() or not public.is_dir() or public.stat().st_mode & 0o022:
        raise TaskError('Diretório público é inseguro ou está ausente.')
    return public


class HashingReader:
    """Calcula hash dos mesmos bytes efetivamente enviados ao arquivo TAR."""
    def __init__(self, stream):
        self.stream = stream
        self.hash = hashlib.sha256()

    def read(self, size=-1):
        data = self.stream.read(size)
        self.hash.update(data)
        return data


def add_public_tree(tar, public):
    stats = {'files': 0, 'bytes': 0}
    hashes = []
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    def recurse(dirfd, prefix, level):
        if level > 12:
            raise TaskError('Profundidade do projeto excede o limite de backup.')
        for filename in sorted(os.listdir(dirfd)):
            if filename in ('.', '..') or len(filename.encode('utf-8')) > 180 or any(ord(c) < 32 for c in filename):
                raise TaskError('Nome de arquivo inseguro no projeto.')
            st = os.stat(filename, dir_fd=dirfd, follow_symlinks=False)
            rel = f'{prefix}/{filename}'
            if stat.S_ISLNK(st.st_mode):
                raise TaskError('Backup recusado: links simbólicos no público exigem revisão.')
            if stat.S_ISDIR(st.st_mode):
                if st.st_mode & 0o022:
                    raise TaskError('Pasta pública gravável por grupo/outros: backup recusado.')
                childfd = os.open(filename, flags, dir_fd=dirfd)
                try:
                    info = tarfile.TarInfo(rel + '/')
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    info.mtime = int(st.st_mtime)
                    tar.addfile(info)
                    recurse(childfd, rel, level + 1)
                finally:
                    os.close(childfd)
            elif stat.S_ISREG(st.st_mode):
                if st.st_nlink != 1:
                    raise TaskError('Backup recusado: arquivo com múltiplos hardlinks.')
                if st.st_size > MAX_SNAPSHOT_BYTES or stats['bytes'] + st.st_size > MAX_SNAPSHOT_BYTES:
                    raise TaskError('Backup excede 64 MiB de conteúdo público.')
                if stats['files'] >= MAX_SNAPSHOT_FILES:
                    raise TaskError('Backup excede 1500 arquivos.')
                fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dirfd)
                try:
                    opened = os.fstat(fd)
                    if not stat.S_ISREG(opened.st_mode) or opened.st_ino != st.st_ino or opened.st_dev != st.st_dev:
                        raise TaskError('Arquivo mudou durante a inspeção; backup cancelado.')
                    if opened.st_size != st.st_size:
                        raise TaskError('Arquivo alterado durante o backup; tente novamente.')
                    with os.fdopen(fd, 'rb', closefd=False) as source:
                        wrapped = HashingReader(source)
                        info = tarfile.TarInfo(rel)
                        info.size = st.st_size
                        info.mode = 0o600
                        info.mtime = int(st.st_mtime)
                        tar.addfile(info, wrapped)
                        hashes.append({'file': rel, 'bytes': st.st_size, 'sha256': wrapped.hash.hexdigest()})
                        stats['files'] += 1
                        stats['bytes'] += st.st_size
                finally:
                    os.close(fd)
            else:
                raise TaskError('Backup recusado: arquivo especial no diretório público.')
    fd = os.open(public, flags)
    try:
        recurse(fd, 'public', 0)
    finally:
        os.close(fd)
    return stats, hashes


def backup_project(task, root=PROJECTS, backup_root=BACKUPS, gpg='/usr/bin/gpg'):
    """Backup criptografado do public/. Sem exportar credenciais, bancos ou configurações."""
    if set(task) != {'action', 'name', 'passphrase'}:
        raise TaskError('Parâmetros de backup inválidos.')
    name = valid_name(task.get('name'))
    passphrase = task.get('passphrase')
    if not isinstance(passphrase, str) or not 16 <= len(passphrase) <= 128 or any(ord(c) < 32 for c in passphrase):
        raise TaskError('Frase secreta de backup deve ter entre 16 e 128 caracteres, sem controles.')
    public = snapshot_source(name, root)
    check_backup_root(backup_root)
    if shutil.disk_usage(backup_root).free < 128 * 1024 * 1024:
        raise TaskError('Espaço livre insuficiente para backup com margem de segurança.')
    existing = list(backup_root.glob(f'{name}-*.tar.gpg.json'))
    if len(existing) >= MAX_SNAPSHOTS_PER_PROJECT:
        raise TaskError('Limite de cinco backups por projeto atingido; arquive os anteriores fora da VPS antes de criar outros.')
    if not Path(gpg).is_file():
        raise TaskError('GPG indisponível. Reexecute o instalador.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    basename = f'{name}-{stamp}-{secrets.token_hex(4)}.tar.gpg'
    destination = backup_root / basename
    descriptor, temp_path = tempfile.mkstemp(prefix='.als-backup-', suffix='.part', dir=backup_root)
    os.close(descriptor)
    os.unlink(temp_path)
    gnupghome = backup_root / '.gnupg'
    if gnupghome.is_symlink():
        raise TaskError('Diretório privado do GPG é link simbólico; recusado.')
    gnupghome.mkdir(mode=0o700, exist_ok=True)
    if gnupghome.stat().st_mode & 0o077:
        raise TaskError('Diretório privado do GPG tem permissões inseguras.')
    rfd, wfd = os.pipe()
    process = None
    try:
        process = subprocess.Popen([gpg, '--homedir', str(gnupghome), '--batch', '--no-tty', '--pinentry-mode', 'loopback',
                    '--symmetric', '--cipher-algo', 'AES256', '--s2k-mode', '3',
                    '--s2k-digest-algo', 'SHA256', '--s2k-count', '65011712',
                    '--passphrase-fd', str(rfd), '--output', temp_path, '-'],
                    pass_fds=(rfd,), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
        os.close(rfd)
        rfd = -1
        os.write(wfd, passphrase.encode('utf-8') + b'\n')
        os.close(wfd)
        wfd = -1
        with tarfile.open(fileobj=process.stdin, mode='w|', format=tarfile.PAX_FORMAT) as tar:
            stats, hashes = add_public_tree(tar, public)
            manifest = {'format': 1, 'project': name, 'scope': 'public-only',
                        'createdAt': datetime.now(timezone.utc).isoformat(), 'entries': hashes}
            raw = json.dumps(manifest, ensure_ascii=False).encode('utf-8')
            entry = tarfile.TarInfo('alsistemas-manifest.json')
            entry.size = len(raw)
            entry.mode = 0o600
            tar.addfile(entry, io.BytesIO(raw))
        process.stdin.close()
        if process.wait(timeout=90) != 0:
            raise TaskError('GPG não conseguiu concluir a criptografia.')
        os.chmod(temp_path, 0o600)
        encrypted_size = Path(temp_path).stat().st_size
        if not encrypted_size:
            raise TaskError('Arquivo criptografado ficou vazio.')
        with open(temp_path, 'rb') as source:
            sha = hashlib.file_digest(source, 'sha256').hexdigest()
        # link() não substitui arquivos anteriores (diferente de os.replace).
        os.link(temp_path, destination)
        os.unlink(temp_path)
        meta = {'name': name, 'archive': basename, 'sha256': sha, 'bytes': encrypted_size,
                'sourceBytes': stats['bytes'], 'files': stats['files'], 'createdAt': manifest['createdAt'],
                'encrypted': True, 'scope': 'public-only'}
        meta_path = backup_root / (basename + '.json')
        try:
            fd = os.open(meta_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                json.dump(meta, out, ensure_ascii=False)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        return {'ok': True, 'backup': meta}
    except Exception:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        raise
    finally:
        if rfd >= 0:
            os.close(rfd)
        if wfd >= 0:
            os.close(wfd)
        Path(temp_path).unlink(missing_ok=True)


def list_backups(task, backup_root=BACKUPS):
    if set(task) != {'action'}:
        raise TaskError('Parâmetros não permitidos na listagem.')
    check_backup_root(backup_root)
    entries = []
    for meta_path in sorted(backup_root.glob('*.tar.gpg.json'), reverse=True)[:100]:
        if meta_path.is_symlink() or not meta_path.is_file():
            continue
        st = meta_path.stat()
        if st.st_mode & 0o077 or (backup_root == BACKUPS and st.st_uid != 0) or st.st_size > 4096:
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            if meta.get('archive') + '.json' != meta_path.name or meta.get('encrypted') is not True:
                continue
            encrypted = backup_root / meta['archive']
            if encrypted.is_symlink() or not encrypted.is_file():
                continue
            fst = encrypted.stat()
            if fst.st_mode & 0o077 or fst.st_size != meta['bytes']:
                continue
            entries.append(meta)
        except (OSError, KeyError, TypeError, ValueError):
            continue
    return {'ok': True, 'backups': entries[:50]}


def ensure_project_worker_idle():
    status = subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet',
                             'alsistemas-project-updater.service'], capture_output=True, timeout=6)
    if status.returncode == 0 or Path('/run/alsistemas-vps/project-request.json').exists():
        raise TaskError('Atualização do IguatamaOnline em andamento; tente depois.')


def execute_task(task, root=PROJECTS, available=SITES_AVAILABLE, enabled=SITES_ENABLED,
                 runner=subprocess.run):
    if not isinstance(task, dict):
        raise TaskError('Formato da tarefa inválido.')
    action = task.get('action')
    if action == 'create_project':
        return create_project(task, root, available, enabled, runner)
    if action == 'set_site_state':
        return set_site_state(task, root, available, enabled, runner)
    if action == 'validate_nginx':
        return validate_nginx(task, runner)
    if action == 'backup_project':
        return backup_project(task, root)
    if action == 'list_backups':
        return list_backups(task)
    if action == 'inspect_external_project':
        if set(task) != {'action', 'name'} or task['name'] != PROJECT_NAME:
            raise TaskError('Projeto não autorizado.')
        result = inspect_project()
        result['backups'] = backup_list()
        result['permissionsGrantActive'] = (PROJECT_BACKUPS / 'permissions-original.json').exists()
        return result
    if action == 'backup_external_code':
        if set(task) != {'action', 'name'} or task['name'] != PROJECT_NAME:
            raise TaskError('Projeto não autorizado para backup de código.')
        ensure_project_worker_idle()
        return backup_code()
    if action == 'project_permissions':
        if set(task) != {'action', 'name', 'mode'}:
            raise TaskError('Parâmetros de correção inválidos.')
        ensure_project_worker_idle()
        return permissions_change(task)
    if action == 'restore_project_code':
        if set(task) != {'action', 'name', 'backup'} or task['name'] != PROJECT_NAME:
            raise TaskError('Parâmetros de restauração inválidos.')
        ensure_project_worker_idle()
        return restore_code(task['backup'])
    if action == 'start_project_update':
        keys = {'action', 'name', 'mode', 'repo'} if task.get('mode') == 'github' else {'action', 'name', 'mode', 'upload', 'sha256'}
        if set(task) != keys or task.get('name') != PROJECT_NAME:
            raise TaskError('Tarefa de projeto não autorizada.')
        if task['mode'] == 'github':
            repo = task['repo']
            if not isinstance(repo, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,60}/[A-Za-z0-9_.-]{1,80}', repo) or '..' in repo:
                raise TaskError('Repositório não autorizado.')
        elif task['mode'] == 'file':
            if not isinstance(task['upload'], str) or not re.fullmatch(r'upload-[0-9a-f]{24}\.zip', task['upload']):
                raise TaskError('Nome do upload inválido.')
            if not isinstance(task['sha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', task['sha256']):
                raise TaskError('Hash de upload inválido.')
        else:
            raise TaskError('Modo de atualização inválido.')
        request_file = Path('/run/alsistemas-vps/project-request.json')
        existing = DATA / 'project-update-status.json'
        if request_file.exists() or request_file.is_symlink():
            raise TaskError('Já existe uma atualização de projeto pendente.')
        active = subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', 'alsistemas-project-updater.service'],
                                capture_output=True, timeout=6)
        if active.returncode == 0:
            raise TaskError('Outro trabalho de atualização está em andamento.')
        # Bloqueia ZIP novo enquanto o acesso PHP temporário estiver ativo.
        if (PROJECT_BACKUPS / 'permissions-original.json').exists():
            raise TaskError('Restaure as permissões originais antes de atualizar o código.')
        inspect_project()
        token = secrets.token_hex(12)
        request = {'id': token, 'name': PROJECT_NAME, 'mode': task['mode']}
        staged = None
        if task['mode'] == 'github':
            request['repo'] = task['repo']
        else:
            source = DATA / task['upload']
            if source.is_symlink():
                raise TaskError('Arquivo recebido não é regular.')
            fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                st = os.fstat(fd)
                owner = pwd.getpwnam('alsistemas').pw_uid
                if not stat.S_ISREG(st.st_mode) or st.st_uid != owner or st.st_nlink != 1 or not (512 <= st.st_size <= 32 * 1024 * 1024):
                    raise TaskError('ZIP recebido não é seguro.')
                private_backup_root(PROJECT_BACKUPS)
                staged = PROJECT_BACKUPS / ('project-upload-' + token + '.zip')
                sha = hashlib.sha256()
                with os.fdopen(os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as output:
                    while True:
                        chunk = os.read(fd, 131072)
                        if not chunk: break
                        sha.update(chunk)
                        output.write(chunk)
                    output.flush(); os.fsync(output.fileno())
                if sha.hexdigest() != task['sha256']:
                    raise TaskError('Hash divergente do upload.')
                request['archive'] = staged.name
                request['sha256'] = task['sha256']
            except Exception:
                if staged: staged.unlink(missing_ok=True)
                raise
            finally:
                os.close(fd)
                source.unlink(missing_ok=True)
        try:
            with os.fdopen(os.open(request_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as output:
                json.dump(request, output)
                output.flush(); os.fsync(output.fileno())
            temp = DATA / ('.project-status-' + token + '.tmp')
            status = {'operationId': token, 'project': PROJECT_NAME, 'stage': 'queued',
                      'message': 'Atualização enfileirada, aguardando serviço root',
                      'updatedAt': datetime.now(timezone.utc).isoformat()}
            with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as output:
                json.dump(status, output, ensure_ascii=False)
                account = pwd.getpwnam('alsistemas')
                os.fchown(output.fileno(), account.pw_uid, account.pw_gid)
            os.replace(temp, existing)
            result = subprocess.run(['/usr/bin/systemctl', 'start', '--no-block',
                                     'alsistemas-project-updater.service'], capture_output=True, timeout=12)
            if result.returncode:
                raise TaskError('Serviço de atualização do projeto não iniciou.')
        except Exception:
            request_file.unlink(missing_ok=True)
            if staged: staged.unlink(missing_ok=True)
            raise
        return {'ok': True, 'operationId': token, 'started': True}
    if action == 'install_package':
        if set(task) != {'action', 'package'}:
            raise TaskError('Parâmetros de instalação inválidos.')
        approved = {'php-curl','php-mbstring','php-xml','php-mysql','php-zip','php-gd','php-intl','composer'}
        package = task.get('package')
        if not isinstance(package, str) or package not in approved:
            raise TaskError('Pacote não autorizado.')
        running = subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet',
                                  'alsistemas-package-installer.service'], capture_output=True, timeout=5)
        if running.returncode == 0:
            raise TaskError('Outra instalação já está em andamento.')
        request = Path('/run/alsistemas-vps/package-request.json')
        if request.exists() or request.is_symlink():
            raise TaskError('Já existe uma solicitação pendente; verifique o serviço de pacotes.')
        fd = os.open(request, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as out:
                json.dump({'package': package}, out)
                out.flush(); os.fsync(out.fileno())
            proc = subprocess.run(['/usr/bin/systemctl', 'start', '--no-block',
                                   'alsistemas-package-installer.service'], capture_output=True, timeout=12)
            if proc.returncode != 0:
                raise TaskError('Não foi possível iniciar o instalador APT.')
        except Exception:
            request.unlink(missing_ok=True)
            raise
        return {'ok': True, 'started': True, 'package': package,
                'message': 'Instalação autorizada. Consulte o progresso no módulo Dependências.'}
    if action == 'start_update':
        if set(task) not in ({'action'}, {'action', 'upload', 'sha256'}):
            raise TaskError('Parâmetros inesperados na atualização.')
        request_file = Path('/etc/alsistemas-vps/update-request.json')
        backup_dir = Path('/var/backups/alsistemas')
        # Nunca iniciar outra instalação se a primeira estiver ativa ou agendada.
        running = subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet',
                                  'alsistemas-updater.service'], capture_output=True, timeout=10)
        if running.returncode == 0 or request_file.exists():
            raise TaskError('Uma atualização já está em andamento.')
        token = secrets.token_hex(12)
        request = {'id': token, 'mode': 'github'}
        staged = None
        if 'upload' in task:
            upload = task['upload']
            expected_hash = task['sha256']
            if not isinstance(upload, str) or not re.fullmatch(r'upload-[0-9a-f]{24}\.zip', upload):
                raise TaskError('Nome do upload inválido.')
            if not isinstance(expected_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
                raise TaskError('SHA-256 inválido.')
            source = DATA / upload
            if source.is_symlink(): raise TaskError('Upload é link simbólico.')
            fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                st = os.fstat(fd)
                owner = pwd.getpwnam('alsistemas').pw_uid
                if not stat.S_ISREG(st.st_mode) or st.st_uid != owner or st.st_nlink != 1 or st.st_size > 32 * 1024 * 1024 or st.st_size < 512:
                    raise TaskError('Upload não é um arquivo regular válido.')
                staged = backup_dir / f'upload-{token}.zip'
                # Destino exclusivo e root-only, fora do alcance do processo web.
                with os.fdopen(os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as out:
                    digest = hashlib.sha256()
                    while True:
                        chunk = os.read(fd, 131072)
                        if not chunk: break
                        digest.update(chunk)
                        out.write(chunk)
                    out.flush(); os.fsync(out.fileno())
                if digest.hexdigest() != expected_hash:
                    raise TaskError('SHA-256 do upload divergente.')
            except Exception:
                if staged: staged.unlink(missing_ok=True)
                raise
            finally:
                os.close(fd)
                source.unlink(missing_ok=True)
            request = {'id': token, 'mode': 'file', 'archive': staged.name, 'sha256': expected_hash}
        try:
            request_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with os.fdopen(os.open(request_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as out:
                json.dump(request, out)
                out.flush(); os.fsync(out.fileno())
            import datetime
            status_file = DATA / 'update-status.json'
            temp_status = DATA / f'.update-status-{token}.tmp'
            data = {'id': token, 'mode': request['mode'], 'stage': 'queued',
                    'message': 'Atualização autorizada; aguardando o serviço iniciar',
                    'time': datetime.datetime.now(datetime.timezone.utc).isoformat()}
            with os.fdopen(os.open(temp_status, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as out:
                json.dump(data, out)
                os.fchown(out.fileno(), pwd.getpwnam('alsistemas').pw_uid, pwd.getpwnam('alsistemas').pw_gid)
            os.replace(temp_status, status_file)
            proc = subprocess.run(['/usr/bin/systemctl', 'start', '--no-block',
                                   'alsistemas-updater.service'], capture_output=True, timeout=12)
            if proc.returncode != 0: raise TaskError('Não foi possível iniciar o serviço de atualização.')
        except Exception:
            request_file.unlink(missing_ok=True)
            if staged: staged.unlink(missing_ok=True)
            try:
                status_file.unlink(missing_ok=True)
            except OSError: pass
            raise
        return {'ok': True, 'started': True, 'operationId': token,
                'message': 'Atualização iniciada. Acompanhe as etapas no painel.'}
    raise TaskError('Ação não autorizada.')


def main():
    if os.geteuid() != 0:
        raise TaskError('O helper deve executar somente como root pelo sudoers restrito.')
    raw = sys.stdin.buffer.read(4097)
    if len(raw) > 4096:
        raise TaskError('Tarefa grande demais.')
    try:
        task = json.loads(raw)
    except ValueError:
        raise TaskError('JSON inválido.')
    # Mutex comum a todas as alterações Nginx feitas por este painel.
    lock_dir = Path('/run/alsistemas-vps')
    if lock_dir.is_symlink() or not lock_dir.is_dir() or lock_dir.stat().st_uid != 0 or (lock_dir.stat().st_mode & 0o077):
        raise TaskError('Diretório de bloqueio administrativo inseguro ou ausente.')
    lock_fd = os.open(lock_dir / 'tasks.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(lock_fd, 'r+', encoding='utf-8') as lock:
            os.fchmod(lock.fileno(), 0o600)
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            result = execute_task(task)
    finally:
        pass
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (TaskError, ProjectError, OSError, subprocess.TimeoutExpired) as err:
        print(json.dumps({'ok': False, 'error': str(err)[:300]}, ensure_ascii=False))
        sys.exit(1)
