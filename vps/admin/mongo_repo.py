"""Bootstrap limitado ao repositório oficial da série MongoDB 8.0, usando HTTPS."""
from pathlib import Path
import os
import subprocess
import tempfile
import urllib.request

KEY = Path('/usr/share/keyrings/als-mongodb-8.0.asc')
SOURCE = Path('/etc/apt/sources.list.d/als-mongodb-8.0.sources')
URL = 'https://pgp.mongodb.com/server-8.0.asc'
REPO = 'https://repo.mongodb.org/apt/ubuntu'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def write_fixed(path,value):
    if path.is_symlink() or (path.exists() and (not path.is_file() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022)):
        raise RuntimeError('Arquivo administrativo do repositório não confiável.')
    fd,temp = tempfile.mkstemp(prefix='.als-mongo-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(value)
            os.fchmod(stream.fileno(),0o644)
        os.replace(temp,path)
    finally:
        if os.path.exists(temp): os.unlink(temp)

def ensure_mongo_repo(run=subprocess.run,env=None,announce=lambda _msg: None):
    cached = run(['/usr/bin/apt-cache','policy','mongodb-org'],text=True,capture_output=True,timeout=12,env=env)
    if cached.returncode == 0 and any(line.strip().startswith('Candidate: 8.0.') for line in (cached.stdout or '').splitlines()):
        return
    osrelease = dict(line.partition('=')[::2] for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    distro = osrelease.get('ID','').strip('"')
    codename = osrelease.get('VERSION_CODENAME','').strip('"')
    arch = run(['/usr/bin/dpkg','--print-architecture'],text=True,capture_output=True,timeout=8,env=env)
    arch_value = (arch.stdout or '').strip()
    if distro != 'ubuntu' or codename not in ('noble','jammy') or arch.returncode or arch_value not in ('amd64','arm64'):
        raise RuntimeError('Instalação automática do MongoDB disponível para Ubuntu 22.04/24.04 em amd64/arm64.')
    announce('Preparando o repositório oficial do MongoDB 8.0…')
    try:
        with urllib.request.build_opener(NoRedirect).open(URL,timeout=20) as response:
            data = response.read(65537)
    except OSError as error:
        raise RuntimeError('Não foi possível obter a chave HTTPS oficial do MongoDB.') from error
    if not 200 <= len(data) <= 65536 or not data.startswith(b'-----BEGIN PGP PUBLIC KEY BLOCK-----'):
        raise RuntimeError('Chave do repositório MongoDB em formato inválido.')
    write_fixed(KEY,data)
    write_fixed(SOURCE,(f'Types: deb\nURIs: {REPO}\nSuites: {codename}/mongodb-org/8.0\nComponents: multiverse\nArchitectures: {arch_value}\nSigned-By: {KEY}\n').encode())
    updated = run(['/usr/bin/apt-get','-o','Dir::Etc::sourcelist='+str(SOURCE),'-o','Dir::Etc::sourceparts=-',
                   '-o','APT::Get::List-Cleanup=false','update'],capture_output=True,timeout=100,env=env)
    if updated.returncode: raise RuntimeError('APT não conseguiu validar ou atualizar o repositório MongoDB.')
