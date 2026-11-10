"""Permissões por projeto com perfis criados pelo painel via helper root.

O navegador seleciona apenas arquivos previamente descobertos, dentro do projeto.
O helper confere proprietários, inodes, grupo PHP e segurança das pastas.
"""
import json
import os
import pwd
import tempfile
import re
import stat
from pathlib import Path, PurePosixPath

POLICY_FILE = Path('/etc/alsistemas-vps/project-permissions.json')
PROJECTS_ROOT = Path('/var/www/projetos')
BACKUP_ROOT = Path('/var/backups/alsistemas-vps')
NAME_RE = re.compile(r'^[a-z][a-z0-9-]{1,39}$')
RESERVED = {'iguatama-teste', 'alsistemas'}
DENY_SEGMENTS = {'storage', 'node_modules', 'vendor', 'cache', 'backups', 'private', 'secrets', 'database'}
DENY_NAME = re.compile(r'(?i)(?:^\.|\.env|\.(?:pem|key|p12|pfx|db|sqlite|sql|bak|zip|tar|gz|crt)$|(?:secret|credential|password|private[-_]?key))')

class ProfileError(Exception):
    pass


def project_name(name):
    if not isinstance(name, str) or not NAME_RE.fullmatch(name) or name in RESERVED or '--' in name:
        raise ProfileError('Projeto não autorizado para permissões genéricas.')
    return name


def load_profile(name, policy_file=POLICY_FILE, *, require_root=True):
    project_name(name)
    if not policy_file.exists():
        return None
    folder = policy_file.parent
    try: parent_st = folder.lstat()
    except OSError: raise ProfileError('Pasta de perfis inacessível.')
    if (not stat.S_ISDIR(parent_st.st_mode) or parent_st.st_mode & 0o022
            or (require_root and parent_st.st_uid != 0)):
        raise ProfileError('Pasta de perfis insegura: deve ser root-owned e não gravável por terceiros.')
    st = policy_file.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_mode & 0o077 or (require_root and st.st_uid != 0):
        raise ProfileError('Configuração de permissões insegura: exige arquivo regular root-owned, modo 0600.')
    try:
        data = json.loads(policy_file.read_text(encoding='utf-8'))
    except (ValueError, UnicodeError, OSError):
        raise ProfileError('Arquivo de perfis inválido.')
    if not isinstance(data, dict) or set(data) != {'projects'} or not isinstance(data['projects'], dict):
        raise ProfileError('Estrutura de perfis inválida.')
    entry = data['projects'].get(name)
    if entry is None: return None
    if not isinstance(entry, dict) or set(entry) != {'owner', 'phpUser', 'files'}:
        raise ProfileError('Perfil precisa informar owner, phpUser e files.')
    owner, php_user, files = entry['owner'], entry['phpUser'], entry['files']
    if not all(isinstance(v, str) and re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}', v) for v in (owner, php_user)) or owner == php_user:
        raise ProfileError('Usuários do perfil inválidos.')
    if not isinstance(files, list) or not 1 <= len(files) <= 12 or len(files) != len(set(map(str, files))):
        raise ProfileError('Selecione de 1 a 12 arquivos únicos por projeto.')
    for rel in files:
        if not isinstance(rel, str) or not rel or len(rel) > 180 or rel.startswith('/') or '\\' in rel or '\x00' in rel:
            raise ProfileError('Caminho de arquivo não permitido.')
        parts = PurePosixPath(rel).parts
        if not parts or any(part in ('', '.', '..') or part.lower() in DENY_SEGMENTS or DENY_NAME.search(part) for part in parts):
            raise ProfileError('Arquivo sensível, oculto ou caminho inválido: ' + rel[:80])
    return entry


def _checked_project(name, profile, root_base=PROJECTS_ROOT, *, require_root=True):
    project = root_base / name
    try:
        parent_st = root_base.lstat(); st = project.lstat()
        owner_id = pwd.getpwnam(profile['owner']).pw_uid
        php = pwd.getpwnam(profile['phpUser'])
    except (OSError, KeyError):
        raise ProfileError('Pasta ou usuário do perfil não encontrado no servidor.')
    if (not stat.S_ISDIR(parent_st.st_mode) or not stat.S_ISDIR(st.st_mode)
            or st.st_mode & 0o022 or parent_st.st_mode & 0o022
            or project.resolve(strict=True) != project or root_base.resolve(strict=True) != root_base):
        raise ProfileError('Pasta não canônica, simbólica ou com permissões inseguras.')
    if st.st_uid != owner_id or (require_root and parent_st.st_uid != 0):
        raise ProfileError('Proprietário divergente do perfil autorizado; confirme antes de alterar.')
    if php.pw_uid in (0, owner_id):
        raise ProfileError('Usuário PHP não pode ser root nem proprietário da pasta.')
    return project, owner_id, php


def _files(project, profile, owner_id, php):
    files = []
    for rel in profile['files']:
        current = project
        for segment in PurePosixPath(rel).parts[:-1]:
            current = current / segment
            st = current.lstat()
            if (not stat.S_ISDIR(st.st_mode) or st.st_mode & 0o022
                    or st.st_uid not in (0, owner_id) or st.st_uid == php.pw_uid):
                raise ProfileError('Subdiretório inseguro: ' + rel)
        target = project / rel
        st = target.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid not in (0, owner_id)
                or st.st_uid == php.pw_uid or st.st_mode & 0o002):
            raise ProfileError('Arquivo inseguro: ' + rel)
        files.append((rel, target, st))
    return files


def _backup_path(name, backup_base=BACKUP_ROOT):
    dest = backup_base / name
    if dest.is_symlink(): raise ProfileError('Pasta de backup simbólica.')
    dest.mkdir(mode=0o700, parents=True, exist_ok=True)
    if dest.stat().st_mode & 0o077:
        raise ProfileError('Pasta de backup exige modo 0700.')
    return dest / 'permissions-original.json'


def _write_exclusive(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
        f.flush(); os.fsync(f.fileno())


def _apply_permissions(target, expected_inode, uid, gid, mode):
    """Opera sobre FD verificado para evitar troca de alvo entre lstat e chmod."""
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_ino != expected_inode:
            raise ProfileError('Arquivo foi trocado durante a operação.')
        os.fchown(fd, uid, gid)
        os.fchmod(fd, mode)
    finally:
        os.close(fd)



# Descoberta de arquivos usa somente caminhos relativos dentro da árvore canônica.
# Não exibe segredos, links simbólicos, diretórios de upload ou arquivos globais.
ALLOWED_EXTENSIONS = {'.php', '.html', '.htm', '.css', '.js', '.json', '.txt'}


def _checked_directory(name, root_base=PROJECTS_ROOT, *, require_root=True):
    project_name(name)
    project = root_base / name
    try:
        parent_st, st = root_base.lstat(), project.lstat()
        owner = pwd.getpwuid(st.st_uid)
    except (OSError, KeyError):
        raise ProfileError('Projeto ou proprietário não encontrado.')
    if (not stat.S_ISDIR(parent_st.st_mode) or not stat.S_ISDIR(st.st_mode)
            or parent_st.st_mode & 0o022 or st.st_mode & 0o022
            or project.resolve(strict=True) != project or root_base.resolve(strict=True) != root_base
            or (require_root and parent_st.st_uid != 0)):
        raise ProfileError('Pasta insegura, simbólica ou fora da raiz autorizada.')
    # O dono do projeto pode ser usuário de implantação, como iguanews-deploy.
    # Nunca confiar em um projeto controlado por um processo PHP ativo.
    if st.st_uid in set(_php_user_ids(require_root=require_root)):
        raise ProfileError('O dono do projeto é usuário PHP; alteração privilegiada recusada.')
    return project, st.st_uid, owner.pw_name


def _php_user_ids(*, require_root=True):
    return [pwd.getpwnam(item).pw_uid for item in _php_accounts(require_root=require_root)]


def _php_accounts(*, require_root=True):
    found = set()
    pools = Path('/etc/php')
    # Não executa arquivos de configuração PHP. Apenas lê nomes de usuário em pools locais.
    for cfg in sorted(pools.glob('*/fpm/pool.d/*.conf'))[:80]:
        try:
            st = cfg.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o022 or (require_root and st.st_uid != 0):
                continue
            value = cfg.read_text(encoding='utf-8')[:131072]
            match = re.search(r'(?m)^\s*user\s*=\s*([a-z_][a-z0-9_-]{0,31})\s*(?:[;#].*)?$', value)
            if match:
                account = pwd.getpwnam(match.group(1))
                if account.pw_uid != 0: found.add(account.pw_name)
        except (OSError, KeyError, UnicodeError):
            continue
    # Conta padrão presente no sistema, mas a identidade do pool real depende do Nginx.
    try:
        account = pwd.getpwnam('www-data')
        if account.pw_uid: found.add(account.pw_name)
    except KeyError:
        pass
    return sorted(found)


def _valid_relative_path(rel):
    if not isinstance(rel, str) or not rel or len(rel) > 180 or rel.startswith('/') or '\\' in rel or '\x00' in rel or '//' in rel:
        return False
    parts = rel.split('/')
    return (all(part and part not in ('.', '..') and part.lower() not in DENY_SEGMENTS
                and not DENY_NAME.search(part) for part in parts)
            and (rel == 'VERSION' or Path(rel).suffix.lower() in ALLOWED_EXTENSIONS))


def discover_files(name, *, root_base=PROJECTS_ROOT, require_root=True):
    project, owner_id, owner = _checked_directory(name, root_base, require_root=require_root)
    items, dirs = [], [(project, '', 0)]
    examined = 0
    while dirs and len(items) < 120 and examined < 1000:
        folder, prefix, depth = dirs.pop(0)
        with os.scandir(folder) as scanner:
            entries = sorted(scanner, key=lambda e: e.name)
        for entry in entries:
            examined += 1
            if examined > 1000: break
            rel = prefix + entry.name
            if not _valid_relative_path(rel) and (entry.name.startswith('.') or entry.name.lower() in DENY_SEGMENTS or DENY_NAME.search(entry.name)):
                continue
            try:
                st = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(st.st_mode) and depth < 4:
                    if st.st_uid in (0, owner_id) and not st.st_mode & 0o022 and entry.name not in ('.', '..'):
                        dirs.append((Path(entry.path), rel + '/', depth + 1))
                elif (stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_uid in (0, owner_id)
                      and not st.st_mode & 0o002 and _valid_relative_path(rel)):
                    items.append({'path': rel, 'owner': pwd.getpwuid(st.st_uid).pw_name,
                                  'mode': format(stat.S_IMODE(st.st_mode), '03o')})
            except (OSError, KeyError):
                continue
            if len(items) >= 120: break
    return {'ok': True, 'name': name, 'owner': owner, 'phpUsers': _php_accounts(require_root=require_root),
            'files': items, 'limited': examined >= 1000 or len(items) >= 120,
            'warning': 'Usuário PHP é uma seleção baseada nos pools detectados. Confirme o pool do domínio antes da liberação.'}


def configure_profile(name, php_user, files, *, policy_file=POLICY_FILE,
                      root_base=PROJECTS_ROOT, backup_base=BACKUP_ROOT, require_root=True):
    project, owner_id, owner = _checked_directory(name, root_base, require_root=require_root)
    if not isinstance(php_user, str) or php_user not in _php_accounts(require_root=require_root):
        raise ProfileError('Escolha um usuário PHP-FPM listado pelo servidor.')
    if not isinstance(files, list) or not 1 <= len(files) <= 12 or any(not _valid_relative_path(rel) for rel in files) or len(set(files)) != len(files):
        raise ProfileError('Selecione entre 1 e 12 arquivos elegíveis, sem duplicatas.')
    php = pwd.getpwnam(php_user)
    if php.pw_uid == owner_id or php.pw_uid == 0:
        raise ProfileError('O usuário PHP não pode ser o proprietário da pasta nem root.')
    # Catalogar novamente, nunca confiar em caminhos apresentados pelo navegador.
    catalog = discover_files(name, root_base=root_base, require_root=require_root)
    eligible = {x['path'] for x in catalog['files']}
    if not set(files).issubset(eligible):
        raise ProfileError('Um ou mais arquivos não pertencem à lista segura da vistoria atual.')
    profile = {'owner': owner, 'phpUser': php_user, 'files': sorted(files)}
    _files(project, profile, owner_id, php)
    # Não permitir redefinição enquanto houver permissão temporária ativa.
    # Consultar sem criar pastas de backup em uma ação de configuração.
    saved = backup_base / name / 'permissions-original.json'
    if saved.exists() or saved.is_symlink():
        raise ProfileError('Restaure as permissões temporárias antes de alterar a configuração.')
    if policy_file.exists():
        load_profile(name, policy_file, require_root=require_root)  # valida ACLs do arquivo existente
        try: data = json.loads(policy_file.read_text(encoding='utf-8'))
        except (OSError, ValueError): raise ProfileError('Política existente inválida.')
    else:
        data = {'projects': {}}
        parent = policy_file.parent
        st = parent.lstat()
        if (not stat.S_ISDIR(st.st_mode) or st.st_mode & 0o022
                or (require_root and st.st_uid != 0)):
            raise ProfileError('A pasta da política não é confiável.')
    if not isinstance(data, dict) or set(data) != {'projects'} or not isinstance(data['projects'], dict) or len(data['projects']) > 100:
        raise ProfileError('Política inválida ou excessivamente grande.')
    data['projects'][name] = profile
    temp_path = None
    try:
        fd, temp_path = tempfile.mkstemp(prefix='.permission-policy-', dir=policy_file.parent)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            os.fchmod(f.fileno(), 0o600)
            payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            if len(payload.encode('utf-8')) > 65536: raise ProfileError('Política excede 64 KiB.')
            f.write(payload)
            f.flush(); os.fsync(f.fileno())
        os.replace(temp_path, policy_file)
        temp_path = None
        directory_fd = os.open(policy_file.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        if temp_path: os.unlink(temp_path)
    return {'ok': True, 'configured': True, 'name': name, 'owner': owner,
            'phpUser': php_user, 'files': profile['files'], 'active': False}

def handle_permissions(name, mode, *, policy_file=POLICY_FILE, root_base=PROJECTS_ROOT,
                       backup_base=BACKUP_ROOT, require_root=True):
    project_name(name)
    if mode == 'discover':
        return discover_files(name, root_base=root_base, require_root=require_root)
    if mode not in ('inspect', 'allow', 'restore'):
        raise ProfileError('Operação de permissão inválida.')
    profile = load_profile(name, policy_file, require_root=require_root)
    if profile is None:
        if mode != 'inspect': raise ProfileError('Selecione e salve os arquivos no painel antes de liberar escrita.')
        return {'ok': True, 'name': name, 'configured': False, 'files': [], 'active': False}
    project, owner_id, php = _checked_project(name, profile, root_base, require_root=require_root)
    files = _files(project, profile, owner_id, php)
    saved = _backup_path(name, backup_base)
    if saved.is_symlink(): raise ProfileError('Backup de permissões não confiável.')
    if mode == 'inspect':
        return {'ok': True, 'name': name, 'configured': True, 'active': saved.is_file(),
                'owner': profile['owner'], 'phpUser': profile['phpUser'], 'files': [
                    {'path': rel, 'mode': oct(stat.S_IMODE(st.st_mode))[2:],
                     'phpWritable': bool(st.st_mode & (stat.S_IWUSR if st.st_uid == php.pw_uid else stat.S_IWGRP if st.st_gid == php.pw_gid else stat.S_IWOTH))}
                    for rel, _, st in files]}
    if mode == 'allow':
        if saved.exists(): raise ProfileError('Já existe liberação ativa. Restaure antes de repetir.')
        original = [{'path': rel, 'uid': st.st_uid, 'gid': st.st_gid, 'mode': stat.S_IMODE(st.st_mode), 'inode': st.st_ino} for rel, _, st in files]
        _write_exclusive(saved, {'name': name, 'phpUser': profile['phpUser'], 'entries': original})
        changed = []
        try:
            for rel, target, st in files:
                # Revalidar imediatamente antes de alterar; nenhum arquivo vem da requisição.
                now = target.lstat()
                if (now.st_ino, now.st_uid, now.st_gid, stat.S_IMODE(now.st_mode)) != (st.st_ino, st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)):
                    raise ProfileError('Arquivo alterado durante a operação: ' + rel)
                changed.append((target, st))
                _apply_permissions(target, st.st_ino, st.st_uid, php.pw_gid, (stat.S_IMODE(st.st_mode) & ~0o007) | 0o660)
        except Exception as original_error:
            rollback_failed = False
            for target, st in reversed(changed):
                try:
                    now = target.lstat()
                    if now.st_ino != st.st_ino: raise ProfileError('Arquivo trocado no rollback.')
                    if (now.st_uid, now.st_gid, stat.S_IMODE(now.st_mode)) != (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)):
                        _apply_permissions(target, st.st_ino, st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode))
                except Exception:
                    rollback_failed = True
            if rollback_failed:
                raise ProfileError('Falha na alteração e reversão incompleta: faça revisão manual do backup de permissões.') from original_error
            saved.unlink(missing_ok=True)
            raise
        return {'ok': True, 'active': True, 'changed': [rel for rel, _, _ in files],
                'warning': 'Escrita PHP temporária liberada apenas nos arquivos aprovados. Restaure ao terminar.'}
    if not saved.is_file(): raise ProfileError('Não há permissões temporárias para restaurar.')
    previous = json.loads(saved.read_text(encoding='utf-8'))
    entries = previous.get('entries')
    if (previous.get('name') != name or previous.get('phpUser') != profile['phpUser']
        or not isinstance(entries, list) or [e['path'] for e in entries] != [rel for rel, _, _ in files]):
        raise ProfileError('Perfil alterado após liberação; restauração automática bloqueada.')
    for old, (_, _, st) in zip(entries, files):
        if st.st_ino != old['inode'] or st.st_uid != old['uid'] or st.st_gid != php.pw_gid:
            raise ProfileError('Arquivo substituído ou modificado externamente; restauração exige revisão manual.')
    for old, (_, target, _) in zip(entries, files):
        _apply_permissions(target, old['inode'], old['uid'], old['gid'], old['mode'])
    saved.unlink()
    return {'ok': True, 'active': False, 'restored': [rel for rel, _, _ in files]}
