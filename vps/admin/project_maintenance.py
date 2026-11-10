"""Manutenção limitada ao IguatamaOnline. Sem comandos arbitrários nem escrita em outros sites."""
import grp
import hashlib
import json
import os
import pwd
import re
import shutil
import stat
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT_NAME = 'iguatamaonline'
PROJECT_ROOT = Path('/var/www/projetos/iguatamaonline')
BACKUP_ROOT = Path('/var/backups/alsistemas-vps/iguatamaonline')
CRITICAL = ('VERSION', 'app/updater.php', 'public/admin.php')
MAX_ARCHIVE = 32 * 1024 * 1024
MAX_FILES = 1200
MAX_UNCOMPRESSED = 96 * 1024 * 1024
ACTIVE_STAGES = ('queued', 'downloading', 'validating', 'backup', 'installing', 'verifying', 'rolling_back')

class ProjectError(Exception):
    pass


def verify_project(name=PROJECT_NAME, root=PROJECT_ROOT):
    if name != PROJECT_NAME:
        raise ProjectError('Manutenção privilegiada disponível apenas para iguatamaonline.')
    if root.is_symlink() or not root.is_dir() or root.resolve(strict=True) != root:
        raise ProjectError('Instalação de produção ausente, simbólica ou não canônica.')
    if root.parent.is_symlink() or root.parent.resolve(strict=True) != root.parent:
        raise ProjectError('Diretório de projetos não confiável.')
    for folder in (root.parent, root):
        mode = folder.stat().st_mode
        if mode & 0o022:
            raise ProjectError('Diretório gravável por grupo/outros: operações privilegiadas bloqueadas.')
    return root


def checked_target(root, rel, *, must_exist=True, for_write=False):
    parts = PurePosixPath(rel).parts
    if not parts or any(part in ('', '..', '.') for part in parts) or rel.startswith('/'):
        raise ProjectError('Caminho inválido.')
    current = root
    for part in parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise ProjectError('Link simbólico em caminho protegido.')
        if current.exists():
            st = current.lstat()
            if not stat.S_ISDIR(st.st_mode) or st.st_mode & 0o022:
                raise ProjectError('Subdiretório inseguro: ' + rel)
            if for_write:
                _, php_uid, _ = php_account()
                if php_uid is None or st.st_uid == php_uid:
                    raise ProjectError('Subdiretório controlado pelo PHP ou usuário PHP desconhecido: ' + rel)
                if root == PROJECT_ROOT:
                    trusted = {0}
                    try: trusted.add(pwd.getpwnam('ubuntu').pw_uid)
                    except KeyError: pass
                    if st.st_uid not in trusted:
                        raise ProjectError('Subdiretório com dono não autorizado: ' + rel)
        elif must_exist:
            raise ProjectError('Diretório ausente: ' + rel)
    target = root.joinpath(*parts)
    if target.is_symlink():
        raise ProjectError('Link simbólico proibido: ' + rel)
    if target.exists():
        st = target.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise ProjectError('Arquivo não regular/hardlink: ' + rel)
    elif must_exist:
        raise ProjectError('Arquivo ausente: ' + rel)
    return target


def php_account():
    # A conta padrão é apenas uma aproximação; pools específicos precisam de revisão.
    try:
        text = Path('/etc/php/8.3/fpm/pool.d/www.conf').read_text(encoding='utf-8')
        match = re.search(r'(?m)^\s*user\s*=\s*([a-z_][a-z0-9_-]*)\s*$', text)
        name = match.group(1) if match else None
        if name:
            account = pwd.getpwnam(name)
            return account.pw_name, account.pw_uid, account.pw_gid
    except (OSError, KeyError):
        pass
    # Fallback apenas para evitar escrita root em árvore controlada por www-data.
    # Não comprova que o vhost utiliza esse pool.
    try:
        account = pwd.getpwnam('www-data')
        return account.pw_name, account.pw_uid, account.pw_gid
    except KeyError:
        return None, None, None


def _can_write(path, user_id, group_id):
    if user_id is None:
        return None
    st = path.stat()
    mode = st.st_mode
    return bool(mode & (stat.S_IWUSR if st.st_uid == user_id else stat.S_IWGRP if st.st_gid == group_id else stat.S_IWOTH))


def inspect_project(name=PROJECT_NAME, root=PROJECT_ROOT):
    root = verify_project(name, root)
    user, uid, gid = php_account()
    fields = []
    for rel in CRITICAL:
        try:
            target = checked_target(root, rel)
            st = target.stat()
            fields.append({'path': rel, 'exists': True, 'owner': pwd.getpwuid(st.st_uid).pw_name,
                           'group': grp.getgrgid(st.st_gid).gr_name, 'mode': oct(stat.S_IMODE(st.st_mode))[2:],
                           'phpWritableEstimate': _can_write(target, uid, gid), 'safePath': True})
        except (ProjectError, KeyError, OSError) as exc:
            fields.append({'path': rel, 'exists': False, 'safePath': False, 'problem': str(exc)[:160]})
    # Explicar o bloqueio antes de solicitar um TOTP e sem afrouxar a proteção root.
    def owner_of(folder):
        uid = folder.stat().st_uid
        try:
            return pwd.getpwuid(uid).pw_name
        except KeyError:
            return 'uid:' + str(uid)
    root_owner, parent_owner = owner_of(root), owner_of(root.parent)
    mutation_allowed, mutation_blocker = True, None
    try:
        guard_mutation_ownership(root)
    except ProjectError as exc:
        mutation_allowed, mutation_blocker = False, str(exc)
    version = None
    try:
        version = checked_target(root, 'VERSION').read_text(encoding='utf-8').strip()[:60]
    except (OSError, ProjectError, UnicodeError):
        pass
    # O gerenciador de perfis da 2.0.29 aceita donos de implantação distintos
    # de root/ubuntu, se o helper validar cada arquivo separadamente.
    panel_permissions_available = (root.parent.stat().st_uid == 0 and root.stat().st_uid != uid
        and not (root.stat().st_mode & 0o022))
    return {'ok': True, 'name': name, 'path': str(root), 'version': version,
            'phpDefaultPool': user, 'phpPoolVerifiedForSite': False,
            'rootOwner': root_owner, 'parentOwner': parent_owner,
            'mutationAllowed': mutation_allowed, 'mutationBlocker': mutation_blocker,
            'panelPermissionsAvailable': panel_permissions_available,
            'files': fields, 'writablePaths': [f['path'] for f in fields if f.get('phpWritableEstimate')],
            'note': 'Estimativa do pool padrão. Se o Nginx usar outro pool, confirmar o usuário antes de liberar escrita.',
            'webUpdaterSafe': False}


def private_backup_root(dest=BACKUP_ROOT):
    if dest.is_symlink():
        raise ProjectError('Diretório de backup não confiável.')
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    if dest.resolve(strict=True) != dest or (dest.stat().st_mode & 0o077):
        raise ProjectError('Diretório de backup deve ser privado (0700).')
    return dest


def _save_json_exclusive(target, value):
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        json.dump(value, file, ensure_ascii=False)
        file.flush(); os.fsync(file.fileno())


def guard_mutation_ownership(root):
    actor, actor_uid, _ = php_account()
    if actor_uid is None:
        raise ProjectError('Usuário PHP-FPM padrão não identificado; manutenção privilegiada recusada.')
    if root.stat().st_uid == actor_uid or root.parent.stat().st_uid == actor_uid:
        raise ProjectError('Diretório controlado pelo usuário do PHP-FPM; faça revisão manual do proprietário antes de qualquer alteração root.')
    if root == PROJECT_ROOT:
        trusted = {0}
        try: trusted.add(pwd.getpwnam('ubuntu').pw_uid)
        except KeyError: pass
        if root.stat().st_uid not in trusted or root.parent.stat().st_uid != 0:
            raise ProjectError('A pasta de produção pertence a um usuário diferente de root/ubuntu. Confira o dono real por SSH (stat -c %U:%G /var/www/projetos/iguatamaonline); alteração automática como root bloqueada.')
    return actor


def permissions_change(task, *, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    if set(task) != {'action', 'name', 'mode'} or task['name'] != PROJECT_NAME or task['mode'] not in ('allow', 'restore'):
        raise ProjectError('Parâmetros de correção inválidos.')
    verify_project(task['name'], root)
    guard_mutation_ownership(root)
    dest = private_backup_root(backups)
    saved = dest / 'permissions-original.json'
    if task['mode'] == 'allow':
        if saved.exists() or saved.is_symlink():
            raise ProjectError('Acesso temporário já preparado. Restaure-o antes de repetir.')
        user, uid, gid = php_account()
        if uid is None or user is None:
            raise ProjectError('Usuário do pool PHP padrão não identificado. Correção automática recusada.')
        targets = [checked_target(root, rel, for_write=True) for rel in CRITICAL]
        original = [{'path': rel, 'uid': file.stat().st_uid, 'gid': file.stat().st_gid,
                     'mode': stat.S_IMODE(file.stat().st_mode), 'inode': file.stat().st_ino}
                    for rel, file in zip(CRITICAL, targets)]
        _save_json_exclusive(saved, {'name': PROJECT_NAME, 'phpUser': user, 'entries': original})
        changed = []
        try:
            for file in targets:
                st = file.stat()
                os.chown(file, st.st_uid, gid, follow_symlinks=False)
                os.chmod(file, (stat.S_IMODE(st.st_mode) & ~0o007) | 0o660, follow_symlinks=False)
                changed.append(file)
        except Exception:
            for item in original:
                if root.joinpath(item['path']) in changed:
                    file = checked_target(root, item['path'], for_write=True)
                    os.chown(file, item['uid'], item['gid'], follow_symlinks=False)
                    os.chmod(file, item['mode'], follow_symlinks=False)
            saved.unlink(missing_ok=True)
            raise
        return {'ok': True, 'mode': 'allow', 'files': list(CRITICAL), 'phpUser': user,
                'warning': 'Escrita temporária em arquivos PHP habilitada; revogue quando terminar. Verifique o pool real do Nginx.'}
    if saved.is_symlink() or not saved.is_file():
        raise ProjectError('Nenhuma alteração de permissões registrada.')
    data = json.loads(saved.read_text(encoding='utf-8'))
    if data.get('name') != PROJECT_NAME or [i.get('path') for i in data.get('entries', [])] != list(CRITICAL):
        raise ProjectError('Registro de permissões inválido.')
    for item in data['entries']:
        file = checked_target(root, item['path'], for_write=True)
        if file.stat().st_ino != item['inode']:
            raise ProjectError('Arquivo foi substituído desde a liberação; restauração automática recusada.')
    for item in data['entries']:
        file = checked_target(root, item['path'], for_write=True)
        os.chown(file, item['uid'], item['gid'], follow_symlinks=False)
        os.chmod(file, item['mode'], follow_symlinks=False)
    saved.unlink()
    return {'ok': True, 'mode': 'restore', 'files': list(CRITICAL)}


def acceptable_rel(rel):
    if '\\' in rel or '\x00' in rel or len(rel) > 280 or rel.startswith('/'):
        return False
    parts = rel.split('/')
    if any(not p or p in ('.', '..') or p.startswith('.') or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,100}', p) for p in parts):
        return False
    if any(part.lower() in {'uploads', 'upload', 'storage', 'cache', 'logs', 'backup', 'backups', 'vendor', 'node_modules', 'data', 'database', 'private', 'secrets', 'tmp', 'temp', 'sessions', 'media', 'images'} for part in parts):
        return False
    if any(part.lower().startswith(('config.local', 'settings.local', '.env')) or part.lower().endswith(('.sql','.sqlite','.sqlite3','.db','.pem','.key','.p12','.pfx','.bak','.log')) for part in parts):
        return False
    return rel in ('VERSION', 'index.php', 'composer.json') or (parts[0] in ('app','public','assets') and len(parts) >= 2)


def validate_archive(archive):
    if archive.is_symlink() or not archive.is_file() or not (512 <= archive.stat().st_size <= MAX_ARCHIVE):
        raise ProjectError('ZIP inválido ou maior que 32 MiB.')
    with zipfile.ZipFile(archive) as source:
        items = source.infolist()
        if len(items) > MAX_FILES or len(items) < 3:
            raise ProjectError('Quantidade de entradas do ZIP fora do limite.')
        # Um diretório superior é aceito apenas se TODAS as entradas compartilharem-no.
        names = [i.filename.rstrip('/') for i in items]
        wrapper = ''
        non_dirs = [n for i, n in zip(items,names) if not i.is_dir()]
        if 'VERSION' not in non_dirs and len({n.split('/')[0] for n in non_dirs}) == 1:
            wrapper = non_dirs[0].split('/')[0] + '/'
        entries = {}
        total = 0
        for entry in items:
            if entry.flag_bits & 1:
                raise ProjectError('ZIP criptografado não é suportado.')
            if entry.filename.startswith('/') or '\\' in entry.filename or entry.filename.startswith('../'):
                raise ProjectError('Caminho absoluto ou inseguro no ZIP.')
            if wrapper and not entry.filename.startswith(wrapper):
                if entry.is_dir() and entry.filename == wrapper:
                    continue
                raise ProjectError('Estrutura mista do ZIP não autorizada.')
            rel = entry.filename[len(wrapper):].rstrip('/')
            if not rel:
                continue
            if entry.is_dir():
                # Diretórios explícitos são comuns em ZIPs; somente dentro de raízes de código.
                if not (rel.split('/')[0] in ('app', 'public', 'assets') and all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,100}', x) and not x.startswith('.') for x in rel.split('/'))):
                    raise ProjectError('Diretório não permitido no ZIP: ' + rel[:120])
                if any(x.lower() in {'uploads', 'upload', 'storage', 'cache', 'logs', 'backup', 'backups', 'vendor', 'node_modules', 'data', 'database', 'private', 'secrets', 'tmp', 'temp', 'sessions', 'media', 'images'} for x in rel.split('/')):
                    raise ProjectError('Diretório protegido no ZIP: ' + rel[:120])
            elif not acceptable_rel(rel):
                raise ProjectError('Entrada não permitida: ' + rel[:120])
            mode = (entry.external_attr >> 16) & 0xffff
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ProjectError('Link simbólico ou entrada especial no ZIP.')
            if entry.is_dir():
                if stat.S_IFMT(mode) not in (0, stat.S_IFDIR):
                    raise ProjectError('Entrada ZIP incompatível com diretório.')
                continue
            if stat.S_IFMT(mode) == stat.S_IFDIR:
                raise ProjectError('Entrada ZIP incompatível com arquivo.')
            if rel in entries:
                raise ProjectError('Arquivos duplicados no ZIP.')
            total += entry.file_size
            if total > MAX_UNCOMPRESSED or entry.file_size > 16 * 1024 * 1024:
                raise ProjectError('ZIP excede limite descompactado.')
            entries[rel] = entry
        if not set(CRITICAL).issubset(entries):
            raise ProjectError('Pacote deve conter VERSION, app/updater.php e public/admin.php.')
        if entries['VERSION'].file_size > 80:
            raise ProjectError('VERSION muito grande no ZIP.')
        version_raw = source.read(entries['VERSION'])
        if len(version_raw) > 80 or not re.fullmatch(rb'\s*\d+\.\d+\.\d+(?:[-+][\w.-]+)?\s*', version_raw):
            raise ProjectError('VERSION inválida no pacote.')
        return {'version': version_raw.decode('ascii').strip(), 'files': len(entries), 'bytes': total, 'entries': entries, 'wrapper': wrapper}


def _copy_with_hash(source, destination):
    digest = hashlib.sha256()
    with open(source, 'rb') as inp, open(destination, 'xb') as out:
        while True:
            buf = inp.read(131072)
            if not buf:
                break
            digest.update(buf)
            out.write(buf)
        out.flush(); os.fsync(out.fileno())
    return digest.hexdigest()


def deploy_archive(archive, *, root=PROJECT_ROOT, backups=BACKUP_ROOT, update_status=lambda s, msg: None):
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    info = validate_archive(archive)
    current_version_file = checked_target(root, 'VERSION', for_write=True)
    current = current_version_file.read_text(encoding='utf-8').strip()
    def version_tuple(value):
        m = re.match(r'^(\d+)\.(\d+)\.(\d+)', value)
        return tuple(map(int, m.groups())) if m else None
    if version_tuple(current) is None or version_tuple(info['version']) is None or version_tuple(info['version']) <= version_tuple(current):
        raise ProjectError('ZIP deve ter versão superior à instalada (versão atual: ' + current[:60] + ').')
    originals = {}
    for rel in info['entries']:
        target = checked_target(root, rel, must_exist=False, for_write=True)
        if target.exists():
            st = target.stat()
            if st.st_mode & 0o022:
                raise ProjectError('Arquivo com escrita de grupo/outros: ' + rel)
            originals[rel] = st
    if shutil.disk_usage(backups.parent if backups.parent.exists() else '/').free < (info['bytes'] * 3 + 128 * 1024 * 1024):
        raise ProjectError('Espaço insuficiente para implantação e reversão.')
    backup_parent = private_backup_root(backups)
    snapshot = backup_parent / ('code-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + os.urandom(4).hex())
    snapshot.mkdir(mode=0o700)
    change_log = []
    metadata = {'project': PROJECT_NAME, 'from': current, 'to': info['version'], 'entries': []}
    update_status('backup', 'Criando cópia privada dos arquivos que serão alterados')
    try:
        for rel, entry in info['entries'].items():
            old = originals.get(rel)
            if old:
                backup_file = snapshot / rel
                backup_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                _copy_with_hash(root / rel, backup_file)
            metadata['entries'].append({'path': rel, 'existed': bool(old), 'mode': stat.S_IMODE(old.st_mode) if old else 0o644,
                                        'uid': old.st_uid if old else 0, 'gid': old.st_gid if old else 0})
        _save_json_exclusive(snapshot / 'metadata.json', metadata)
        update_status('installing', 'Instalando os arquivos de código verificados')
        with zipfile.ZipFile(archive) as source:
            for rel, entry in info['entries'].items():
                target = checked_target(root, rel, must_exist=False, for_write=True)
                if not target.parent.exists():
                    target.parent.mkdir(parents=True, mode=0o755)
                fd, temporary = tempfile.mkstemp(prefix='.als-deploy-', dir=target.parent)
                try:
                    with os.fdopen(fd, 'wb') as output, source.open(entry) as content:
                        shutil.copyfileobj(content, output, 131072)
                        output.flush(); os.fsync(output.fileno())
                    old = originals.get(rel)
                    os.chown(temporary, old.st_uid if old else 0, old.st_gid if old else 0)
                    os.chmod(temporary, (stat.S_IMODE(old.st_mode) & ~0o022) if old else 0o644)
                    os.replace(temporary, target)
                    change_log.append(rel)
                finally:
                    if os.path.exists(temporary): os.unlink(temporary)
        update_status('verifying', 'Verificando arquivos e versão instalada')
        with zipfile.ZipFile(archive) as source:
            for rel, entry in info['entries'].items():
                with source.open(entry) as inp, open(checked_target(root, rel, for_write=True), 'rb') as deployed:
                    if hashlib.sha256(inp.read()).digest() != hashlib.file_digest(deployed, 'sha256').digest():
                        raise ProjectError('Integridade pós-instalação divergente: ' + rel)
        if (root / 'VERSION').read_text().strip() != info['version']:
            raise ProjectError('Versão não corresponde após atualização.')
        return {'ok': True, 'version': info['version'], 'previousVersion': current, 'files': len(info['entries']),
                'backup': snapshot.name, 'note': 'Backup apenas do código alterado. Banco, uploads e storage não são substituídos.'}
    except Exception:
        update_status('rolling_back', 'Erro na instalação; revertendo arquivos alterados')
        for rel in reversed(change_log):
            target = checked_target(root, rel, must_exist=False, for_write=True)
            if rel in originals:
                before = snapshot / rel
                fd, tmp = tempfile.mkstemp(prefix='.als-restore-', dir=target.parent)
                try:
                    with os.fdopen(fd, 'wb') as dest, open(before, 'rb') as src:
                        shutil.copyfileobj(src, dest)
                    old = originals[rel]
                    os.chown(tmp, old.st_uid, old.st_gid)
                    os.chmod(tmp, stat.S_IMODE(old.st_mode))
                    os.replace(tmp, target)
                finally:
                    if os.path.exists(tmp): os.unlink(tmp)
            else:
                target.unlink(missing_ok=True)
        raise


def restore_code(backup_id, *, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    if not isinstance(backup_id, str) or not re.fullmatch(r'code-\d{8}T\d{6}Z-[a-f0-9]{8}', backup_id):
        raise ProjectError('Identificador de backup inválido.')
    folder = private_backup_root(backups) / backup_id
    if folder.is_symlink() or not folder.is_dir():
        raise ProjectError('Backup indisponível.')
    metadata_file = folder / 'metadata.json'
    if metadata_file.is_symlink() or not metadata_file.is_file() or metadata_file.stat().st_size > 100000:
        raise ProjectError('Manifesto do backup indisponível.')
    data = json.loads(metadata_file.read_text(encoding='utf8'))
    if data.get('project') != PROJECT_NAME or not isinstance(data.get('entries'), list):
        raise ProjectError('Manifesto de backup inválido.')
    if checked_target(root, 'VERSION', for_write=True).read_text(encoding='utf8').strip() != data.get('to'):
        raise ProjectError('Versão atual mudou após o backup. Reversão automática bloqueada.')
    entries = data['entries']
    if len(entries) > MAX_FILES:
        raise ProjectError('Backup excede limite de arquivos.')
    for item in entries:
        rel = item.get('path')
        if not isinstance(rel, str) or not acceptable_rel(rel) or not isinstance(item.get('existed'), bool):
            raise ProjectError('Entrada de backup inválida.')
        checked_target(root, rel, must_exist=False, for_write=True)
        if item['existed']:
            source = folder / rel
            if source.is_symlink() or not source.is_file() or source.stat().st_nlink != 1:
                raise ProjectError('Arquivo de backup ausente ou inseguro.')
    stage = Path(tempfile.mkdtemp(prefix='restore-', dir=private_backup_root(backups)))
    applied = []
    try:
        # Guarda estado atual antes de qualquer escrita para rollback se o restore falhar.
        for item in entries:
            rel = item['path']
            current = root / rel
            if current.exists():
                stage_file = stage / rel
                stage_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                _copy_with_hash(current, stage_file)
        for item in entries:
            rel = item['path']
            dest = checked_target(root, rel, must_exist=False, for_write=True)
            if not item['existed']:
                dest.unlink(missing_ok=True)
            else:
                fd, temp = tempfile.mkstemp(prefix='.als-restore-', dir=dest.parent)
                try:
                    with os.fdopen(fd, 'wb') as output, open(folder / rel, 'rb') as old:
                        shutil.copyfileobj(old, output)
                        output.flush(); os.fsync(output.fileno())
                    os.chown(temp, item['uid'], item['gid'])
                    os.chmod(temp, item['mode'])
                    os.replace(temp, dest)
                finally:
                    if os.path.exists(temp): os.unlink(temp)
            applied.append(rel)
        if checked_target(root, 'VERSION', for_write=True).read_text(encoding='utf8').strip() != data.get('from'):
            raise ProjectError('Reversão não passou na verificação de versão.')
        return {'ok': True, 'restored': data['from'], 'backup': backup_id, 'note': 'Somente código foi revertido; banco e uploads não foram modificados.'}
    except Exception:
        for rel in reversed(applied):
            original = stage / rel
            dest = checked_target(root, rel, must_exist=False, for_write=True)
            if original.exists():
                fd, temp = tempfile.mkstemp(prefix='.als-recover-', dir=dest.parent)
                try:
                    with os.fdopen(fd, 'wb') as output, open(original, 'rb') as src:
                        shutil.copyfileobj(src, output)
                    os.replace(temp, dest)
                finally:
                    if os.path.exists(temp): os.unlink(temp)
            else:
                dest.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(stage)


def backup_list(*, backups=BACKUP_ROOT):
    if not backups.exists():
        return []
    private_backup_root(backups)
    found = []
    for item in sorted(backups.glob('code-*'), reverse=True)[:20]:
        try:
            if item.is_symlink() or not item.is_dir():
                continue
            metadata = item / 'metadata.json'
            if metadata.is_symlink() or metadata.stat().st_size > 100000:
                continue
            info = json.loads(metadata.read_text(encoding='utf8'))
            if info.get('project') == PROJECT_NAME:
                found.append({'id': item.name, 'from': info.get('from'), 'to': info.get('to'), 'files': len(info.get('entries', []))})
        except (OSError, ValueError, TypeError):
            continue
    return found


def backup_code(*, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    """Snapshot restrito de arquivos de código; não inclui banco, uploads ou segredos."""
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    current = checked_target(root, 'VERSION', for_write=True).read_text(encoding='utf8').strip()
    dest = private_backup_root(backups)
    if shutil.disk_usage(dest).free < 196 * 1024 * 1024:
        raise ProjectError('Espaço insuficiente para backup de código.')
    entries = []
    aggregate = 0
    candidate_files = [root / 'VERSION']
    for folder in ('app', 'public', 'assets'):
        parent = root / folder
        if not parent.exists(): continue
        if parent.is_symlink() or not parent.is_dir():
            raise ProjectError('Diretório de código não confiável: ' + folder)
        for current_dir, dirs, files in os.walk(parent, followlinks=False):
            relative_dir = Path(current_dir).relative_to(root)
            # Nunca percorrer conteúdo privado ou gravável pelo site.
            dirs[:] = [d for d in dirs if acceptable_rel((relative_dir / d / 'file.php').as_posix())]
            for name in files:
                rel = (relative_dir / name).as_posix()
                if acceptable_rel(rel):
                    candidate_files.append(root / rel)
    for file in candidate_files:
        rel = file.relative_to(root).as_posix()
        safe = checked_target(root, rel, for_write=True)
        st = safe.stat()
        if st.st_mode & 0o022:
            raise ProjectError('Arquivo de código gravável por grupo/outros: ' + rel)
        entries.append({'path': rel, 'existed': True, 'mode': stat.S_IMODE(st.st_mode), 'uid': st.st_uid, 'gid': st.st_gid})
        aggregate += st.st_size
        if len(entries) > MAX_FILES or aggregate > MAX_UNCOMPRESSED:
            raise ProjectError('Código ultrapassa o limite para backup; use snapshot externo da EC2.')
    snapshot = dest / ('code-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + os.urandom(4).hex())
    snapshot.mkdir(mode=0o700)
    try:
        for item in entries:
            backup_file = snapshot / item['path']
            backup_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            _copy_with_hash(checked_target(root, item['path'], for_write=True), backup_file)
        _save_json_exclusive(snapshot / 'metadata.json', {
            'project': PROJECT_NAME, 'from': current, 'to': current, 'entries': entries, 'scope': 'code-only'})
        return {'ok': True, 'backup': snapshot.name, 'version': current,
                'files': len(entries), 'bytes': aggregate, 'note': 'Backup privado do código. Sem banco, uploads ou armazenamento de usuários.'}
    except Exception:
        shutil.rmtree(snapshot)
        raise
