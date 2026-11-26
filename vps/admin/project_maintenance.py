"""Manutenção limitada ao IguatamaOnline. Sem comandos arbitrários nem escrita em outros sites."""
import grp
import fcntl
from contextlib import contextmanager
from functools import wraps
import hashlib
import json
import os
import pwd
import re
import shutil
import stat
import subprocess
import resource
import signal
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PROJECT_NAME = 'iguatamaonline'
DEPLOY_ACCOUNT = 'iguanews-deploy'
PROJECT_ROOT = Path('/var/www/projetos/iguatamaonline')
BACKUP_ROOT = Path('/var/backups/alsistemas-vps/iguatamaonline')
CRITICAL = ('VERSION', 'app/updater.php', 'public/admin.php')
MAX_ARCHIVE = 32 * 1024 * 1024
MAX_FILES = 1200
MAX_UNCOMPRESSED = 96 * 1024 * 1024
ACTIVE_STAGES = ('queued', 'downloading', 'validating', 'backup', 'installing', 'migrating', 'verifying', 'rolling_back')

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
                    trusted = trusted_code_owners(root)
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
        if for_write and root == PROJECT_ROOT and st.st_uid not in trusted_code_owners(root):
            raise ProjectError('Arquivo com dono não autorizado: ' + rel)
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
        if root == PROJECT_ROOT:
            recovery_guard(BACKUP_ROOT)
            with site_worker_lock(root):
                pass
    except ProjectError as exc:
        mutation_allowed, mutation_blocker = False, str(exc)
    version = None
    try:
        version = read_code(root, 'VERSION').decode('utf-8').strip()[:60]
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
            'dedicatedDeployOwner': bool(root == PROJECT_ROOT and dedicated_owner(root)), 'webUpdaterSafe': False}


def private_backup_root(dest=BACKUP_ROOT):
    if dest.is_symlink():
        raise ProjectError('Diretório de backup não confiável.')
    try:
        dest.mkdir(parents=True, exist_ok=True, mode=0o700)
        st = dest.stat()
        if dest.resolve(strict=True) != dest or (st.st_mode & 0o077) or (dest == BACKUP_ROOT and st.st_uid != 0):
            raise ProjectError(f'Diretório de backup inseguro: {dest}; uid={st.st_uid}, modo={stat.S_IMODE(st.st_mode):04o}; esperado privado (0700).')
    except OSError as exc:
        raise ProjectError(f'Não foi possível preparar a cópia privada: {dest}; errno {exc.errno}.') from exc
    return dest


def _save_json_exclusive(target, value):
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        json.dump(value, file, ensure_ascii=False)
        file.flush(); os.fsync(file.fileno())


def dedicated_owner(root):
    try:
        account = pwd.getpwnam(DEPLOY_ACCOUNT)
    except KeyError:
        return None
    if account.pw_uid == 0 or root.stat().st_uid != account.pw_uid:
        return None
    return account


def trusted_code_owners(root):
    trusted = {0}
    try: trusted.add(pwd.getpwnam('ubuntu').pw_uid)
    except KeyError: pass
    account = dedicated_owner(root)
    if account is not None:
        trusted.add(account.pw_uid)
    return trusted


def guard_mutation_ownership(root):
    actor, actor_uid, _ = php_account()
    if actor_uid is None:
        raise ProjectError('Usuário PHP-FPM sem privilégios não identificado; manutenção recusada.')
    if root.stat().st_uid == actor_uid or root.parent.stat().st_uid == actor_uid:
        raise ProjectError('Diretório controlado pelo usuário do PHP-FPM; faça revisão manual do proprietário antes de qualquer alteração root.')
    if actor_uid == 0:
        raise ProjectError('Usuário PHP-FPM não pode ser root.')
    if root == PROJECT_ROOT:
        if root.stat().st_uid not in trusted_code_owners(root) or root.parent.stat().st_uid != 0:
            raise ProjectError('Proprietário não autorizado para implantação ou diretório pai não pertence a root.')
        account = dedicated_owner(root)
        if account is not None:
            # Não aceitar a conta de deploy como identidade de qualquer pool web.
            for cfg in Path('/etc/php').glob('*/fpm/pool.d/*.conf'):
                try:
                    if re.search(r'(?m)^\s*user\s*=\s*'+re.escape(DEPLOY_ACCOUNT)+r'\s*(?:[;#].*)?$', cfg.read_text()):
                        raise ProjectError('Conta de implantação também utilizada pelo PHP-FPM.')
                except OSError:
                    continue
    return actor


@contextmanager
def code_parent(root, rel, create=False):
    # Caminhos de código abertos componente por componente, sem seguir links.
    # Operações root são relativas a descritores, não caminhos trocáveis pelo deploy.
    parts = PurePosixPath(rel).parts
    if not acceptable_rel(rel):
        raise ProjectError('Caminho de código não autorizado: ' + rel)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(root, flags)
    try:
        approved = trusted_code_owners(root) if root == PROJECT_ROOT else {os.fstat(fd).st_uid}
        root_st = os.fstat(fd)
        if root_st.st_uid not in approved or root_st.st_mode & 0o022:
            raise ProjectError('Raiz de código insegura.')
        for part in parts[:-1]:
            try:
                child = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                if not create: raise
                os.mkdir(part, 0o755, dir_fd=fd)
                child = os.open(part, flags, dir_fd=fd)
                try:
                    if os.fstat(child).st_uid != os.geteuid():
                        raise ProjectError('Diretório novo substituído durante a implantação.')
                    os.fchown(child, root_st.st_uid, root_st.st_gid)
                    os.fchmod(child, 0o755)
                except Exception:
                    os.close(child); raise
            os.close(fd); fd = child
            st = os.fstat(fd)
            if st.st_uid not in approved or st.st_mode & 0o022:
                raise ProjectError('Subdiretório de código inseguro: ' + rel)
        yield fd, parts[-1], approved
    finally:
        os.close(fd)


@contextmanager
def open_code(root, rel):
    with code_parent(root, rel) as (fd, name, approved):
        file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            st = os.fstat(file)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid not in approved or st.st_mode & 0o022:
                raise ProjectError('Arquivo de código inseguro: ' + rel)
            with os.fdopen(file, 'rb', closefd=False) as stream:
                yield stream
        finally:
            os.close(file)


def read_code(root, rel):
    with open_code(root, rel) as stream:
        return stream.read()


def copy_code(root, rel, destination):
    with open_code(root, rel) as inp, open(destination, 'xb') as out:
        shutil.copyfileobj(inp, out, 131072)
        out.flush(); os.fsync(out.fileno())


def install_code(root, rel, content, uid, gid, mode):
    with code_parent(root, rel, create=True) as (fd, name, approved):
        if uid not in approved or mode & 0o7022:
            raise ProjectError('Metadados de código inseguros: ' + rel)
        try:
            existing = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if not stat.S_ISREG(existing.st_mode) or existing.st_nlink != 1 or existing.st_uid not in approved or existing.st_mode & 0o022:
                raise ProjectError('Destino de código inseguro: ' + rel)
        except FileNotFoundError:
            pass
        temp = '.als-deploy-' + os.urandom(12).hex()
        out_fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        try:
            with os.fdopen(out_fd, 'wb') as out:
                shutil.copyfileobj(content, out, 131072)
                out.flush(); os.fsync(out.fileno())
                os.fchown(out.fileno(), uid, gid)
                os.fchmod(out.fileno(), mode)
                # O nome temporário tem de continuar apontando para o FD criado.
                if os.stat(temp, dir_fd=fd, follow_symlinks=False).st_ino != os.fstat(out.fileno()).st_ino:
                    raise ProjectError('Arquivo temporário substituído.')
                os.replace(temp, name, src_dir_fd=fd, dst_dir_fd=fd)
        finally:
            try: os.unlink(temp, dir_fd=fd)
            except FileNotFoundError: pass


def remove_code(root, rel):
    try:
        with code_parent(root, rel) as (fd, name, approved):
            os.unlink(name, dir_fd=fd)
    except FileNotFoundError:
        pass


@contextmanager
def site_worker_lock(root):
    account = dedicated_owner(root) if root == PROJECT_ROOT else None
    if account is None:
        yield; return
    # Mesmo lock usado pelo atualizador PHP. Nunca criar/alterar controles do portal.
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = None
    lock = None
    stage = str(root)
    try:
        fd = os.open(root, flags)
        for part in ('storage', 'updater', 'vps', 'private'):
            stage += "/" + part
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd); fd = child
        st = os.fstat(fd)
        if st.st_uid != account.pw_uid or st.st_mode & 0o022:
            raise ProjectError(f'Controle privado inseguro: {stage}; uid={st.st_uid}, esperado={account.pw_uid}, modo={stat.S_IMODE(st.st_mode):04o}.')
        stage += '/.code.lock'
        lock = os.open('.code.lock', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        st = os.fstat(lock)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != account.pw_uid or st.st_nlink != 1 or st.st_mode & 0o077:
            raise ProjectError(f'Lock inseguro: {stage}; uid={st.st_uid}, esperado={account.pw_uid}, modo={stat.S_IMODE(st.st_mode):04o}, links={st.st_nlink}.')
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc: raise ProjectError('Atualizador do site em execução; tente novamente após concluir.') from exc
        stage = str(root / 'storage/updater/vps/private/maintenance')
        try: os.stat('maintenance', dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError: pass
        else: raise ProjectError('Recuperação pendente no atualizador do site.')
    except OSError as exc:
        if lock is not None: os.close(lock)
        if fd is not None: os.close(fd)
        raise ProjectError(f'Controle do atualizador indisponível: {stage}; {exc.strerror} (errno {exc.errno}).') from exc
    except BaseException:
        if lock is not None: os.close(lock)
        if fd is not None: os.close(fd)
        raise
    try:
        yield
    finally:
        if lock is not None: os.close(lock)
        if fd is not None: os.close(fd)


def coordinated(operation):
    @wraps(operation)
    def call(*args, **kwargs):
        root = kwargs.get('root', PROJECT_ROOT)
        verify_project(PROJECT_NAME, root)
        guard_mutation_ownership(root)
        with site_worker_lock(root):
            return operation(*args, **kwargs)
    return call


def permissions_change(task, *, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    if set(task) != {'action', 'name', 'mode'} or task['name'] != PROJECT_NAME or task['mode'] not in ('allow', 'restore'):
        raise ProjectError('Parâmetros de correção inválidos.')
    verify_project(task['name'], root)
    guard_mutation_ownership(root)
    dest = private_backup_root(backups)
    saved = dest / 'permissions-original.json'
    if task['mode'] == 'allow':
        if root == PROJECT_ROOT and dedicated_owner(root) is not None:
            raise ProjectError('O atualizador do site utiliza iguanews-deploy; não precisa liberar escrita de código ao PHP.')
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
    if rel in ('public/.user.ini', 'public/.htaccess'):
        return True
    if rel in ('public/ads.txt', 'app/config.php', 'public/config.php'):
        return False
    if '\\' in rel or '\x00' in rel or len(rel) > 280 or rel.startswith('/'):
        return False
    parts = rel.split('/')
    if any(not p or p in ('.', '..') or p.startswith('.') or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,100}', p) for p in parts):
        return False
    if any(part.lower() in {'uploads', 'upload', 'storage', 'cache', 'logs', 'backup', 'backups', 'vendor', 'node_modules', 'data', 'database', 'private', 'secrets', 'tmp', 'temp', 'sessions', 'media', 'images'} for part in parts):
        return False
    if any(part.lower() == 'config.php' or part.lower().startswith(('config.local', 'settings.local', '.env')) or part.lower().endswith(('.sql','.sqlite','.sqlite3','.db','.pem','.key','.p12','.pfx','.bak','.log')) for part in parts):
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
        manifest_entries = {}
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
            elif rel in ('release.json', 'release.sig'):
                if rel in manifest_entries or entry.file_size > (512 * 1024 if rel == 'release.json' else 64):
                    raise ProjectError('Manifesto ou assinatura inválido.')
                manifest_entries[rel] = entry
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
            if rel in manifest_entries:
                continue
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
        version = version_raw.decode('ascii').strip()
        revision = None
        if 'app/schema_migrations.php' in entries:
            revision = schema_from_bytes(source.read(entries['app/schema_migrations.php']))
        if manifest_entries:
            if 'release.json' not in manifest_entries:
                raise ProjectError('Manifesto de Release ausente.')
            try:
                manifest = json.loads(source.read(manifest_entries['release.json']))
                descriptors = manifest['files']
                if (manifest['format'] != 'meu-site-update-v2' or manifest['version'] != version
                        or type(manifest['schema_revision']) is not int or revision is None
                        or manifest['schema_revision'] != revision or manifest['min_php'] != '8.1.0'
                        or not isinstance(descriptors, list) or len(descriptors) != len(entries)):
                    raise ValueError()
                seen = set()
                for d in descriptors:
                    path = d['path']
                    if path in seen or path not in entries or type(d['size']) is not int or d['size'] != entries[path].file_size:
                        raise ValueError()
                    if hashlib.sha256(source.read(entries[path])).hexdigest() != d['sha256']:
                        raise ValueError()
                    seen.add(path)
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                raise ProjectError('Manifesto SHA-256, versão ou schema divergente.') from exc
            # A assinatura não é validada por este painel: não confundir integridade com autoria.
            if 'release.sig' in manifest_entries and manifest_entries['release.sig'].file_size != 64:
                raise ProjectError('Assinatura com tamanho inválido.')
        return {'version': version, 'files': len(entries), 'bytes': total, 'entries': entries, 'wrapper': wrapper,
                'schema': revision, 'manifestVerified': bool(manifest_entries)}



def schema_from_bytes(raw):
    matches = re.findall(rb'\bconst\s+IGUA_SCHEMA_REVISION\s*=\s*(\d+)\s*;', raw)
    if len(matches) != 1 or not 1 <= int(matches[0]) <= 100000:
        raise ProjectError('Revisão de schema não reconhecida.')
    return int(matches[0])


def installed_schema(root):
    path = checked_target(root, 'app/schema_migrations.php', must_exist=False, for_write=True)
    return schema_from_bytes(read_code(root, 'app/schema_migrations.php')) if path.exists() else None


# PHP do portal jamais é executado como root. O worker recebe somente resultado
# mínimo ou dump via stdout, sem colocar senha em argumentos, logs ou metadados.
PHP_JOB = r'''<?php
ini_set('display_errors','0');
try {
  $root=$argv[1]; $job=$argv[2];
  if ($job==='maintenance-on') {
    $p=$root.'/storage/.update-maintenance';
    if (is_link($root.'/storage') || !is_dir($root.'/storage')) exit(2);
    $f=@fopen($p,'x'); if(!$f) exit(2);
    fwrite($f,"AL Sistemas: atualização em andamento\n"); fclose($f); exit(0);
  }
  if ($job==='maintenance-off') {
    $p=$root.'/storage/.update-maintenance';
    if (is_link($p) || !is_file($p) || !unlink($p)) exit(2); exit(0);
  }
  require $root.'/app/bootstrap.php';
  require_once $root.'/app/schema_migrations.php';
  $db=db();
  if ($job==='probe') { echo igua_schema_revision($db); exit(0); }
  if ($job==='dump') {
    $c=config(); $host=$c['host']??'127.0.0.1'; $name=$c['database']??'';
    if(!in_array($host,['localhost','127.0.0.1','::1'],true) || !preg_match('/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/D',$name) || !empty($c['tls'])) exit(3);
    $port=(int)($c['port']??3306);
    $user=(string)($c['username']??''); if($user==='' || $user==='root') exit(3);
    if ($db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB'")->fetchColumn()>0) exit(3);
    $cmd=['/usr/bin/mariadb-dump','--no-defaults','--host='.$host,'--port='.$port,'--user='.$user,'--single-transaction','--quick','--skip-lock-tables','--hex-blob','--no-tablespaces'];
    if ($db->query('SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()')->fetchColumn()>0) $cmd[]='--routines';
    if ($db->query('SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()')->fetchColumn()>0) $cmd[]='--events';
    $cmd[]='--'; $cmd[]=$name;
    $proc=proc_open($cmd,[0=>['file','/dev/null','r'],1=>STDOUT,2=>['file','/dev/null','w']],$pipes,null,['PATH'=>'/usr/bin:/bin','MYSQL_PWD'=>(string)($c['password']??'')]);
    exit(is_resource($proc)?proc_close($proc):4);
  }
  if ($job==='migrate') {
    foreach (['ads.php','news_editor.php','schema.php','article_workflow.php','analytics.php'] as $file) require_once $root.'/app/'.$file;
    igua_migrate_schema($db);
    if (igua_schema_revision($db)!==IGUA_SCHEMA_REVISION) exit(5);
    if (IGUA_SCHEMA_REVISION===38) $db->query('SELECT id,name,contact,title,message,photos,rate_key,status,article_id,created_at FROM story_submissions LIMIT 0');
    echo igua_schema_revision($db); exit(0);
  }
  exit(2);
} catch(Throwable $e) { exit(6); }
'''


def php_job(root, job, output=None, *, timeout=180):
    actor, uid, gid = php_account()
    if not actor or uid in (None, 0) or gid is None:
        raise ProjectError('Conta PHP sem privilégios não identificada.')
    if not Path('/usr/bin/php').is_file():
        raise ProjectError('PHP CLI indisponível.')
    if job == 'dump' and not Path('/usr/bin/mariadb-dump').is_file():
        raise ProjectError('mariadb-dump não instalado; atualização bloqueada antes de alterar o código.')
    # Limite do dump preserva margem para o sistema e para o backup do código.
    limit = min(512 * 1024 * 1024, max(0, os.fstatvfs(output.fileno()).f_bavail * os.fstatvfs(output.fileno()).f_frsize - 128 * 1024 * 1024)) if output is not None else None
    if limit is not None and limit < 1024 * 1024:
        raise ProjectError('Espaço insuficiente para exportação SQL.')
    def set_limit():
        if limit is not None:
            resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
    try:
        with subprocess.Popen(['/usr/bin/php', '-d', 'display_errors=0', '--', str(root), job],
            stdin=subprocess.PIPE, stdout=output if output is not None else subprocess.PIPE,
            stderr=subprocess.DEVNULL, user=uid, group=gid, extra_groups=[], cwd=str(root),
            env={'PATH':'/usr/bin:/bin','HOME':'/tmp'}, start_new_session=True, preexec_fn=set_limit) as proc:
            try:
                stdout, _ = proc.communicate(PHP_JOB.encode(), timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.communicate()
                raise
            code = proc.returncode
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProjectError('Falha ou timeout na etapa PHP: '+job) from exc
    if code:
        reason = {2: 'controle de manutenção ou operação indisponível',
                  3: 'banco incompatível com exportação local segura',
                  4: 'não foi possível iniciar a exportação',
                  5: 'revisão final não confirmada',
                  6: 'exceção PHP ou banco'}.get(code, 'processo PHP ou ferramenta de banco falhou')
        raise ProjectError(f'Etapa PHP {job} falhou (código {code}): {reason}.')
    if output is None:
        return stdout.decode('ascii', errors='strict').strip()


def schema_diagnostics(root=PROJECT_ROOT, backups=BACKUP_ROOT):
    """Read-only report; never call migrate, dump or maintenance jobs here."""
    checks = []
    def add(label, code, output):
        checks.append(dict(label=label, code=code, output=output))
    revision = None
    try:
        verify_project(PROJECT_NAME, root)
        guard_mutation_ownership(root)
        revision = installed_schema(root)
        add('Schema declarado no código', 0 if revision is not None else 1,
            str(revision) if revision is not None else 'Não identificado')
    except (OSError, ProjectError, ValueError) as exc:
        add('Schema declarado no código', 1, str(exc)[:300])
    if revision is not None:
        try:
            actual = php_job(root, 'probe', timeout=8)
            if not re.fullmatch(r'(?:0|[1-9][0-9]{0,17})', actual):
                raise ProjectError('Resposta de revisão inválida.')
            actual = int(actual)
            add('Schema real do banco', 0 if actual == revision else 1,
                f'{actual} · código {revision} · ' + ('compatível' if actual == revision else 'divergente; atualização bloqueada'))
        except (OSError, ProjectError, ValueError) as exc:
            add('Schema real do banco', 1, str(exc)[:300])
    else:
        add('Schema real do banco', 1, 'Não consultado: código não validado.')
    # Não criar diretórios nem expor dados do backup durante um diagnóstico.
    try:
        st = backups.lstat()
        ok = stat.S_ISDIR(st.st_mode) and not st.st_mode & 0o077 and st.st_uid == 0 and backups.resolve() == backups
        add('Pasta privada de backup', 0 if ok else 1,
            f'{backups}; uid={st.st_uid}; modo={stat.S_IMODE(st.st_mode):04o}' + ('' if ok else '; insegura'))
        if ok:
            flag = backups / 'schema-recovery.json'
            pending = flag.exists() or flag.is_symlink()
            add('Recuperação de schema', 1 if pending else 0, 'Pendente; preservar código e SQL' if pending else 'Sem marcador de recuperação')
    except FileNotFoundError:
        add('Pasta privada de backup', 0, 'Ainda não existe; criada apenas na implantação.')
    except OSError as exc:
        add('Pasta privada de backup', 1, f'Falha de acesso (errno {exc.errno})')
    return checks


def database_backup(root, snapshot):
    dump = snapshot / 'database.sql'
    with os.fdopen(os.open(dump, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as output:
        php_job(root, 'dump', output)
        output.flush(); os.fsync(output.fileno())
    # O rodapé do mariadb-dump e o exit code devem confirmar que a exportação terminou.
    with dump.open('rb') as stream:
        stream.seek(max(0, dump.stat().st_size - 4096))
        if b'-- Dump completed on ' not in stream.read():
            raise ProjectError('Dump SQL incompleto; atualização cancelada.')
        stream.seek(0)
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'file': 'database.sql', 'bytes': dump.stat().st_size, 'sha256': digest}


def recovery_guard(backups):
    flag = backups / 'schema-recovery.json'
    if flag.exists() or flag.is_symlink():
        raise ProjectError('Recuperação de schema pendente. Confira schema-recovery.json e o backup privado por SSH antes de novas alterações.')


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


@coordinated
def deploy_archive(archive, *, root=PROJECT_ROOT, backups=BACKUP_ROOT, update_status=lambda s, msg: None):
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    recovery_guard(backups)
    info = validate_archive(archive)
    old_schema = installed_schema(root)
    new_schema = info['schema']
    if old_schema is not None and (new_schema is None or not info['manifestVerified']):
        raise ProjectError('Use o ZIP oficial gerado por tools/build_update_package.py, com manifesto e schema.')
    if old_schema is not None and (new_schema < old_schema or new_schema > old_schema + 1):
        raise ProjectError(f'Downgrade ou salto de schema não autorizado: {old_schema} → {new_schema}; instalação assistida necessária.')
    if root == PROJECT_ROOT and old_schema is None:
        raise ProjectError('Schema instalado não identificado; instalação assistida necessária.')
    current_version_file = checked_target(root, 'VERSION', for_write=True)
    current = read_code(root, 'VERSION').decode('utf-8').strip()
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
    metadata = {'project': PROJECT_NAME, 'from': current, 'to': info['version'], 'entries': [],
                'schemaFrom': old_schema, 'schemaTo': new_schema}
    maintenance = False
    migration_started = False
    recovery = backup_parent / 'schema-recovery.json'
    update_status('backup', 'Criando cópia privada dos arquivos que serão alterados')
    try:
        if old_schema is not None:
            update_status('backup', 'Ativando manutenção e conferindo o schema do banco')
            if php_job(root, 'probe') != str(old_schema):
                raise ProjectError(f'Schema real do banco difere do código instalado (esperado {old_schema}). Consulte o diagnóstico do banco.')
            php_job(root, 'maintenance-on')
            maintenance = True
            update_status('backup', 'Exportando banco MariaDB antes da atualização')
            metadata['database'] = database_backup(root, snapshot)
        for rel, entry in info['entries'].items():
            old = originals.get(rel)
            if old:
                backup_file = snapshot / rel
                backup_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                copy_code(root, rel, backup_file)
            metadata['entries'].append({'path': rel, 'existed': bool(old), 'mode': stat.S_IMODE(old.st_mode) if old else 0o644,
                                        'uid': old.st_uid if old else root.stat().st_uid, 'gid': old.st_gid if old else root.stat().st_gid})
        _save_json_exclusive(snapshot / 'metadata.json', metadata)
        if old_schema is not None:
            _save_json_exclusive(recovery, {'backup': snapshot.name, 'from': old_schema, 'to': new_schema, 'version': info['version']})
        update_status('installing', 'Instalando os arquivos de código verificados')
        with zipfile.ZipFile(archive) as source:
            # Exponha a nova revisão apenas após todos os demais arquivos.
            ordered = sorted(info['entries'].items(), key=lambda pair: (pair[0] == 'VERSION', pair[0] == 'app/schema_migrations.php'))
            for rel, entry in ordered:
                if old_schema is not None and new_schema != old_schema and rel == 'app/schema_migrations.php':
                    # Rotas de login antigas podem executar DDL mesmo com manutenção.
                    # A partir daqui não é seguro reverter código automaticamente.
                    migration_started = True
                target = checked_target(root, rel, must_exist=False, for_write=True)
                old = originals.get(rel)
                with source.open(entry) as content:
                    install_code(root, rel, content, old.st_uid if old else root.stat().st_uid,
                                 old.st_gid if old else root.stat().st_gid,
                                 (stat.S_IMODE(old.st_mode) & ~0o022) if old else 0o644)
                change_log.append(rel)
        update_status('verifying', 'Verificando arquivos e versão instalada')
        with zipfile.ZipFile(archive) as source:
            for rel, entry in info['entries'].items():
                with source.open(entry) as inp, open_code(root, rel) as deployed:
                    if hashlib.sha256(inp.read()).digest() != hashlib.file_digest(deployed, 'sha256').digest():
                        raise ProjectError('Integridade pós-instalação divergente: ' + rel)
        if read_code(root, 'VERSION').decode('utf-8').strip() != info['version']:
            raise ProjectError('Versão não corresponde após atualização.')
        if old_schema is not None:
            # A partir deste ponto DDL pode ter sido confirmado pelo MariaDB. Não
            # restaurar código ou SQL automaticamente: requisições administrativas
            # já iniciadas podem ter gravado dados após o dump.
            migration_started = True
            update_status('migrating', 'Executando migração do banco e verificando revisão')
            if php_job(root, 'migrate') != str(new_schema) or php_job(root, 'probe') != str(new_schema):
                raise ProjectError('Revisão do banco não confirmada após migração.')
            php_job(root, 'maintenance-off')
            maintenance = False
            recovery.unlink()
        return {'ok': True, 'version': info['version'], 'previousVersion': current, 'files': len(info['entries']),
                'backup': snapshot.name, 'schemaFrom': old_schema, 'schemaTo': new_schema,
                'databaseBackup': bool(metadata.get('database')), 'manifestVerified': info['manifestVerified'],
                'note': 'Código verificado; banco exportado e schema conferido quando aplicável. Uploads preservados.'}
    except Exception as exc:
        if migration_started:
            raise ProjectError('Migração/verificação interrompida; backup '+snapshot.name+' preservado. Recuperação assistida obrigatória. Causa: '+(str(exc)[:160] if isinstance(exc, ProjectError) else type(exc).__name__)) from exc
        if maintenance and change_log and php_job(root, 'probe') != str(old_schema):
            raise ProjectError('Schema alterado por outra execução; código e backup preservados para recuperação assistida.') from exc
        update_status('rolling_back', 'Erro antes da migração; revertendo arquivos alterados')
        for rel in reversed(change_log):
            target = checked_target(root, rel, must_exist=False, for_write=True)
            if rel in originals:
                before = snapshot / rel
                old = originals[rel]
                with open(before, 'rb') as src:
                    install_code(root, rel, src, old.st_uid, old.st_gid, stat.S_IMODE(old.st_mode))
            else:
                remove_code(root, rel)
        if maintenance:
            # Admin/login do portal pode executar migração mesmo durante manutenção.
            # Caso a revisão tenha mudado, manter o bloqueio de recuperação.
            if php_job(root, 'probe') != str(old_schema):
                raise ProjectError('Schema alterado por outra execução; recuperação assistida necessária.') from exc
            php_job(root, 'maintenance-off')
        if old_schema is not None:
            recovery.unlink(missing_ok=True)
        if not (snapshot / 'metadata.json').exists():
            shutil.rmtree(snapshot)
        raise


@coordinated
def restore_code(backup_id, *, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    if not isinstance(backup_id, str) or not re.fullmatch(r'code-\d{8}T\d{6}Z-[a-f0-9]{8}', backup_id):
        raise ProjectError('Identificador de backup inválido.')
    recovery_guard(backups)
    folder = private_backup_root(backups) / backup_id
    if folder.is_symlink() or not folder.is_dir():
        raise ProjectError('Backup indisponível.')
    metadata_file = folder / 'metadata.json'
    if metadata_file.is_symlink() or not metadata_file.is_file() or metadata_file.stat().st_size > 100000:
        raise ProjectError('Manifesto do backup indisponível.')
    data = json.loads(metadata_file.read_text(encoding='utf8'))
    if data.get('project') != PROJECT_NAME or not isinstance(data.get('entries'), list):
        raise ProjectError('Manifesto de backup inválido.')
    if read_code(root, 'VERSION').decode('utf-8').strip() != data.get('to'):
        raise ProjectError('Versão atual mudou após o backup. Reversão automática bloqueada.')
    actual_schema = installed_schema(root)
    if actual_schema is not None:
        previous_schema = data.get('schemaFrom')
        old_file = folder / 'app/schema_migrations.php'
        if previous_schema is None and old_file.is_file() and not old_file.is_symlink():
            previous_schema = schema_from_bytes(old_file.read_bytes())
        if previous_schema != actual_schema or php_job(root, 'probe') != str(actual_schema):
            raise ProjectError('Backup incompatível com schema atual; restauração conjunta assistida necessária. Nenhum dado alterado.')
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
    prior = {}
    try:
        # Guarda estado atual antes de qualquer escrita para rollback se o restore falhar.
        for item in entries:
            rel = item['path']
            current = root / rel
            if current.exists():
                prior[rel] = current.stat()
                stage_file = stage / rel
                stage_file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                copy_code(root, rel, stage_file)
        for item in entries:
            rel = item['path']
            dest = checked_target(root, rel, must_exist=False, for_write=True)
            if not item['existed']:
                remove_code(root, rel)
            else:
                with open(folder / rel, 'rb') as old:
                    install_code(root, rel, old, item['uid'], item['gid'], item['mode'])
            applied.append(rel)
        if read_code(root, 'VERSION').decode('utf-8').strip() != data.get('from'):
            raise ProjectError('Reversão não passou na verificação de versão.')
        return {'ok': True, 'restored': data['from'], 'backup': backup_id, 'note': 'Somente código foi revertido; banco e uploads não foram modificados.'}
    except Exception:
        for rel in reversed(applied):
            original = stage / rel
            dest = checked_target(root, rel, must_exist=False, for_write=True)
            if original.exists():
                st = prior[rel]
                with open(original, 'rb') as src:
                    install_code(root, rel, src, st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode))
            else:
                remove_code(root, rel)
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
                found.append({'id': item.name, 'from': info.get('from'), 'to': info.get('to'), 'files': len(info.get('entries', [])), 'schemaFrom': info.get('schemaFrom'), 'schemaTo': info.get('schemaTo'), 'databaseBackup': bool(info.get('database'))})
        except (OSError, ValueError, TypeError):
            continue
    return found


@coordinated
def backup_code(*, root=PROJECT_ROOT, backups=BACKUP_ROOT):
    """Snapshot restrito de arquivos de código; não inclui banco, uploads ou segredos."""
    root = verify_project(PROJECT_NAME, root)
    guard_mutation_ownership(root)
    current = read_code(root, 'VERSION').decode('utf-8').strip()
    recovery_guard(backups)
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
            copy_code(root, item['path'], backup_file)
        _save_json_exclusive(snapshot / 'metadata.json', {
            'project': PROJECT_NAME, 'from': current, 'to': current, 'entries': entries, 'scope': 'code-only', 'schemaFrom': installed_schema(root), 'schemaTo': installed_schema(root)})
        return {'ok': True, 'backup': snapshot.name, 'version': current,
                'files': len(entries), 'bytes': aggregate, 'note': 'Backup privado do código. Sem banco, uploads ou armazenamento de usuários.'}
    except Exception:
        shutil.rmtree(snapshot)
        raise
