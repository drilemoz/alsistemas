"""Explorador restrito por projeto: diretórios, metadados e chmod via descritores.

A rota web não tem acesso root. Este módulo roda dentro do helper root, com
somente um projeto sob /var/www/projetos e sem seguir links simbólicos.
"""
import os
import pwd
import grp
import stat
from pathlib import Path

from other_project_permissions import (
    PROJECTS_ROOT, BACKUP_ROOT, DENY_SEGMENTS, DENY_NAME,
    _checked_directory, ProfileError, _php_user_ids,
)

LIMIT = 120
SCAN_LIMIT = 4000
MAX_DEPTH = 12
FLAGS_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FLAGS_ITEM = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK


def _parts(value, *, allow_root=False):
    if value == '' and allow_root:
        return ()
    if (not isinstance(value, str) or not value or len(value) > 512
            or value.startswith('/') or '\\' in value or '\x00' in value):
        raise ProfileError('Caminho inválido.')
    parts = value.split('/')
    if len(parts) > MAX_DEPTH or any(not p or p in ('.', '..') or len(p) > 180 for p in parts):
        raise ProfileError('Caminho não permitido.')
    return tuple(parts)


def _protected(parts):
    return any(p.startswith('.') or p.lower() in DENY_SEGMENTS or DENY_NAME.search(p) for p in parts)


def _open_base(name, root_base, require_root):
    project, owner_id, owner = _checked_directory(name, root_base, require_root=require_root)
    # Diretório raiz fixado por FD; revalida identidade após a checagem de política.
    base_fd = os.open(root_base, FLAGS_DIR)
    try:
        project_fd = os.open(name, FLAGS_DIR, dir_fd=base_fd)
        st = os.fstat(project_fd)
        if (st.st_uid != owner_id or st.st_ino != project.lstat().st_ino
                or st.st_dev != project.lstat().st_dev or st.st_mode & 0o022):
            raise ProfileError('Diretório do projeto mudou durante a operação.')
    except Exception:
        # Fecha também o FD do projeto se a revalidação falhar.
        if 'project_fd' in locals():
            os.close(project_fd)
        os.close(base_fd)
        raise
    os.close(base_fd)
    return project_fd, owner_id, owner


def _enter_directory(fd, part, owner_id):
    child_fd = os.open(part, FLAGS_DIR, dir_fd=fd)
    try:
        st = os.fstat(child_fd)
        if st.st_uid not in (0, owner_id) or st.st_mode & 0o022:
            raise ProfileError('Pasta com proprietário ou escrita insegura.')
    except Exception:
        os.close(child_fd)
        raise
    return child_fd


def _directory_fd(name, parts, root_base, require_root):
    fd, owner_id, owner = _open_base(name, root_base, require_root)
    try:
        for part in parts:
            next_fd = _enter_directory(fd, part, owner_id)
            os.close(fd)
            fd = next_fd
        return fd, owner_id, owner
    except Exception:
        os.close(fd)
        raise


def _owner(uid):
    try:
        return pwd.getpwuid(uid).pw_name
    except KeyError:
        return str(uid)


def _group(gid):
    try:
        return grp.getgrgid(gid).gr_name
    except KeyError:
        return str(gid)


def _kind(st):
    if stat.S_ISDIR(st.st_mode):
        return 'directory'
    if stat.S_ISREG(st.st_mode):
        return 'file'
    if stat.S_ISLNK(st.st_mode):
        return 'link'
    return 'special'


def _item(name, st, parts, owner_id):
    kind = _kind(st)
    protected = _protected(parts)
    safe_owner = st.st_uid in (0, owner_id)
    editable = (kind in ('directory', 'file') and safe_owner and
                not protected and not (st.st_mode & 0o002) and
                (kind != 'file' or st.st_nlink == 1))
    # Não podemos entrar em pasta que outros usuários podem modificar.
    enterable = kind == 'directory' and safe_owner and not (st.st_mode & 0o022) and not protected
    return {'name': name, 'path': '/'.join(parts), 'kind': kind,
            'mode': format(stat.S_IMODE(st.st_mode), '03o'), 'inode': str(st.st_ino),
            'owner': _owner(st.st_uid), 'group': _group(st.st_gid),
            'size': st.st_size if kind == 'file' else None,
            'editable': bool(editable), 'enterable': bool(enterable),
            'protected': bool(protected), 'modified': int(st.st_mtime)}


def browse_project(name, directory='', offset=0, *, root_base=PROJECTS_ROOT, require_root=True):
    parts = _parts(directory, allow_root=True)
    if _protected(parts):
        raise ProfileError('Esta pasta é protegida.')
    if type(offset) is not int or offset < 0 or offset > SCAN_LIMIT:
        raise ProfileError('Página de listagem inválida.')
    try:
        folder_fd, owner_id, owner = _directory_fd(name, parts, root_base, require_root)
        try:
            items = []
            # scandir(fd) lista o diretório já fixado, sem seguir links.
            with os.scandir(folder_fd) as iterator:
                for entry in iterator:
                    if len(items) >= SCAN_LIMIT:
                        break
                    st = entry.stat(follow_symlinks=False)
                    items.append(_item(entry.name, st, (*parts, entry.name), owner_id))
            items.sort(key=lambda item: (item['kind'] != 'directory', item['name'].lower(), item['name']))
            current = os.fstat(folder_fd)
            listing = items[offset:offset + LIMIT]
            return {'ok': True, 'name': name, 'directory': directory,
                    'owner': owner, 'current': _item(parts[-1] if parts else name, current, parts, owner_id),
                    'items': listing, 'total': len(items),
                    'nextOffset': offset + LIMIT if offset + LIMIT < len(items) else None,
                    'limited': len(items) >= SCAN_LIMIT}
        finally:
            os.close(folder_fd)
    except OSError as error:
        raise ProfileError('Não foi possível abrir esta pasta no servidor.') from error


def update_mode(name, relative, mode, expected_inode, expected_mode, *, root_base=PROJECTS_ROOT,
                backup_base=BACKUP_ROOT, require_root=True):
    parts = _parts(relative)
    if _protected(parts):
        raise ProfileError('Arquivo ou pasta protegidos; alteração recusada.')
    if (type(mode) is not int or not 0 <= mode <= 0o777 or mode & 0o002 or
            type(expected_mode) is not int or not 0 <= expected_mode <= 0o777 or
            type(expected_inode) is not str or not expected_inode.isdigit() or len(expected_inode) > 24):
        raise ProfileError('Permissões inválidas ou escrita pública proibida.')
    # O controle de escrita temporária não pode ser misturado com chmod manual.
    snapshot = backup_base / name / 'permissions-original.json'
    if snapshot.exists() or snapshot.is_symlink():
        raise ProfileError('Restaure primeiro as permissões temporárias do projeto.')
    try:
        directory_fd, owner_id, _ = _directory_fd(name, parts[:-1], root_base, require_root)
        try:
            leaf = os.open(parts[-1], FLAGS_ITEM, dir_fd=directory_fd)
            try:
                st = os.fstat(leaf)
                kind = _kind(st)
                if (kind not in ('file', 'directory') or st.st_uid not in (0, owner_id)
                        or st.st_ino != int(expected_inode) or stat.S_IMODE(st.st_mode) != expected_mode
                        or (kind == 'file' and st.st_nlink != 1) or st.st_mode & 0o002):
                    raise ProfileError('O arquivo foi alterado desde a vistoria. Atualize a pasta.')
                if kind == 'directory':
                    # Apenas diretórios internos. Mínimo de acesso do dono e nenhuma escrita de grupo/terceiros.
                    if mode & 0o020 or (mode & 0o500) != 0o500:
                        raise ProfileError('Pastas precisam manter leitura/entrada do dono e não podem ter escrita para grupo/outros.')
                os.fchmod(leaf, mode)
                return {'ok': True, 'path': relative, 'kind': kind,
                        'previousMode': format(expected_mode, '03o'), 'mode': format(mode, '03o')}
            finally:
                os.close(leaf)
        finally:
            os.close(directory_fd)
    except OSError as error:
        raise ProfileError('Não foi possível alterar as permissões; consulte a vistoria.') from error
