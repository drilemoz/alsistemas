"""Publicação ZIP isolada em projetos novos. Não executa arquivos do pacote."""
import ctypes
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

MAX_ZIP = 32 * 1024 * 1024
MAX_EXPANDED = 96 * 1024 * 1024
MAX_ENTRIES = 3000
SAFE_COMPONENT = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_.@ -]{0,119}$', re.ASCII)
SECRET = re.compile(r'(?:^|[._-])(?:secrets?|credentials?|private[_-]?key|passwd|config[_-]?local)(?:[._-]|$)|\.(?:env|pem|key|p12|pfx|sql|sqlite3?|ini|bak|zip|tar|gz)$', re.I)
EXECUTABLE = re.compile(r'\.(?:php[0-9]*|phtml|phar|cgi|pl|py|sh)(?:\.|$)', re.I)
class HostingError(Exception):
    pass

def trusted_folder(folder, uid=0):
    st = folder.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != uid or st.st_mode & 0o022:
        raise HostingError('Diretório gerenciado não confiável.')
    return folder

def read_hosting(target, uid=0):
    trusted_folder(target, uid)
    metadata = target / '.alsistemas.json'
    with os.fdopen(os.open(metadata, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        st = os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid != uid or st.st_mode & 0o022 or st.st_size > 4096:
            raise HostingError('Metadados do projeto não confiáveis.')
        result = json.load(f)
    if not isinstance(result, dict) or result.get('managedBy') != 'AL Sistemas' or result.get('type') not in ('static','php') or result.get('hosting') is not True:
        raise HostingError('Publicação disponível apenas para projetos criados pelo novo assistente.')
    return result

def archive_entries(archive, site_type):
    infos = archive.infolist()
    if not infos or len(infos) > MAX_ENTRIES or sum(i.file_size for i in infos) > MAX_EXPANDED:
        raise HostingError('ZIP vazio ou acima do limite expandido de 96 MiB e 3.000 itens.')
    paths = []
    for info in infos:
        raw = info.orig_filename
        parts = raw.removesuffix('/').split('/')
        mode = (info.external_attr >> 16) & 0xffff
        if (len(raw) > 300 or len(parts) > 18 or any(not SAFE_COMPONENT.fullmatch(p) or p.endswith((' ', '.')) or SECRET.search(p) for p in parts)
            or stat.S_IFMT(mode) not in (0,stat.S_IFDIR if info.is_dir() else stat.S_IFREG)
            or info.flag_bits & 1 or info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)):
            raise HostingError('ZIP contém caminho, extensão ou entrada não permitida.')
        paths.append((info,parts))
    wrapper = all(parts[0] == 'public' and (len(parts) > 1 or info.is_dir()) for info,parts in paths)
    seen = {}
    for info, parts in paths:
        parts = parts[1:] if wrapper else parts
        if not parts: continue
        key = '/'.join(parts).casefold()
        if key in seen: raise HostingError('ZIP contém caminhos duplicados.')
        if not info.is_dir() and EXECUTABLE.search(parts[-1]) and (site_type != 'php' or not parts[-1].endswith('.php')):
            raise HostingError('O ZIP contém um script incompatível com o tipo de site.')
        seen[key] = info.is_dir()
        yield info, parts
    exact = {tuple(parts) for info, parts in paths if not info.is_dir()}
    prefix = ('public',) if wrapper else ()
    valid_index = [prefix + ('index.html',)] + ([prefix + ('index.php',)] if site_type == 'php' else [])
    if not any(index in exact for index in valid_index):
        raise HostingError('Inclua index.html ou, para projetos PHP, index.php na raiz publicada.')
    for key in seen:
        elements = key.split('/')
        if any(seen.get('/'.join(elements[:depth])) is False for depth in range(1,len(elements))):
            raise HostingError('ZIP contém conflito entre arquivo e pasta.')

def swap_directories(first, second):
    libc = ctypes.CDLL(None, use_errno=True)
    swap = libc.renameat2
    swap.argtypes = [ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
    if swap(-100,os.fsencode(first),-100,os.fsencode(second),2) != 0:
        err = ctypes.get_errno()
        raise OSError(err,os.strerror(err))

def write_release_status(target, value):
    fd, temp = tempfile.mkstemp(prefix='.release-',dir=target)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:
            json.dump(value,stream)
            stream.flush()
            os.fchmod(stream.fileno(),0o644)
            os.fsync(stream.fileno())
        os.replace(temp,target / '.als-release.json')
    finally:
        if os.path.exists(temp): os.unlink(temp)

def deploy(task,target,data,uid=0,upload_uid=None):
    if set(task) != {'action','name','upload','sha256'}:
        raise HostingError('Dados do upload inválidos.')
    if not isinstance(task['upload'],str) or not re.fullmatch(r'upload-[0-9a-f]{24}\.zip',task['upload']) or not isinstance(task['sha256'],str) or not re.fullmatch('[a-f0-9]{64}',task['sha256']):
        raise HostingError('Referência do upload inválida.')
    info = read_hosting(target,uid)
    public = trusted_folder(target / 'public',uid)
    previous = target / '.als-release-previous'
    if previous.exists() or previous.is_symlink():
        trusted_folder(previous,uid)
    if upload_uid is None: upload_uid = pwd.getpwnam('alsistemas').pw_uid
    source = data / task['upload']
    with tempfile.TemporaryDirectory(prefix='.als-stage-',dir=target) as temp:
        from pathlib import Path
        temp = Path(temp)
        bundle, staged = temp / 'bundle.zip', temp / 'public'
        staged.mkdir(mode=0o755)
        staged.chmod(0o755)
        with os.fdopen(os.open(source,os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK),'rb') as f, bundle.open('xb') as out:
            st = os.fstat(f.fileno())
            if not stat.S_ISREG(st.st_mode) or st.st_uid != upload_uid or st.st_nlink != 1 or not 22 <= st.st_size <= MAX_ZIP:
                raise HostingError('Upload não é um ZIP regular dentro do limite de 32 MiB.')
            h = hashlib.sha256()
            count = 0
            while chunk := f.read(131072):
                count += len(chunk)
                if count > MAX_ZIP: raise HostingError('ZIP maior que o limite.')
                h.update(chunk)
                out.write(chunk)
            if h.hexdigest() != task['sha256']: raise HostingError('Verificação SHA-256 do upload falhou.')
        try:
            with zipfile.ZipFile(bundle) as archive:
                files = list(archive_entries(archive,info['type']))
                for item,parts in files:
                    path = staged.joinpath(*parts)
                    folder = path if item.is_dir() else path.parent
                    folder.mkdir(parents=True,exist_ok=True)
                    while folder != staged:
                        folder.chmod(0o755)
                        folder = folder.parent
                    if not item.is_dir():
                        with archive.open(item) as payload, path.open('xb') as out:
                            shutil.copyfileobj(payload,out,131072)
                        path.chmod(0o644)
        except (zipfile.BadZipFile,NotImplementedError,RuntimeError) as error:
            raise HostingError('ZIP inválido ou arquivo interno corrompido.') from error
        trusted_folder(public,uid)
        rotated = temp / 'older-release'
        exchanged = False
        installed_previous = False
        try:
            if previous.exists(): os.rename(previous,rotated)
            swap_directories(public,staged)
            exchanged = True
            # Preserva o conteúdo anterior fora do webroot e inacessível ao PHP.
            staged.chmod(0o700)
            os.rename(staged,previous)
            installed_previous = True
            result = {'ok':True,'publishedAt':datetime.now(timezone.utc).isoformat(),
                      'files':sum(not item.is_dir() for item,_ in files)}
            write_release_status(target,result)
        except OSError:
            if exchanged:
                old = previous if installed_previous else staged
                old.chmod(0o755)
                swap_directories(public,old)
                if installed_previous: os.rename(previous,staged)
            if rotated.exists(): os.rename(rotated,previous)
            raise
    return result
