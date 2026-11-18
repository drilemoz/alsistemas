#!/usr/bin/python3
"""Instala apenas pacotes APT de uma allowlist fixa por unidade systemd root.
Nenhum argumento, pacote ou comando arbitrário chega do navegador.
"""
import fcntl
import json
import os
import stat
import subprocess
import sys
from pathlib import Path
import re
sys.path.insert(0,str(Path(__file__).resolve().parent))
from package_policy import ALLOWED, package_status as status

RUNTIME = Path('/run/alsistemas-vps')
REQUEST = RUNTIME / 'package-request.json'


def read_request(path=REQUEST):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or st.st_nlink != 1 or st.st_mode & 0o077 or st.st_size > 512:
            raise ValueError('Pedido administrativo inseguro')
        with os.fdopen(fd, 'rb') as f:
            raw = f.read(513)
        fd = -1
        if len(raw) > 512: raise ValueError('Pedido grande demais')
        payload = json.loads(raw)
        if not isinstance(payload, dict) or set(payload) != {'package'} or not isinstance(payload['package'],str) or payload['package'] not in ALLOWED:
            raise ValueError('Pacote não autorizado')
        return payload['package']
    finally:
        if fd >= 0: os.close(fd)


APT = ['/usr/bin/apt-get','--no-remove','--no-install-recommends','--no-upgrade']
PROTECTED = re.compile(r'^(?:nodejs(?:-doc|-dev)?|node|npm|libnode[0-9]*|libnode-dev|nsolid|nginx(?:-core|-full|-light|-common)?)$')
APT_ENV = {'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','DEBIAN_FRONTEND':'noninteractive'}

def install_allowed(pkg, runner=subprocess.run):
    if pkg not in ALLOWED: raise ValueError('Pacote não autorizado')
    package = ALLOWED[pkg]
    # Fix the installed Node/npm versions in the real transaction as well as in the simulation.
    pin = runner(['/usr/bin/dpkg-query','-W','-f=${binary:Package}\t${Status}\t${Version}\n','nodejs','npm','nsolid'],
                 capture_output=True,text=True,env=APT_ENV,timeout=8)
    if pin.returncode not in (0,1): raise RuntimeError('Não foi possível verificar o Node.js antes de instalar.')
    preserve = []
    for row in (pin.stdout or '').splitlines():
        fields = row.split('\t')
        if len(fields) == 3 and fields[1] == 'install ok installed' and fields[0] in ('nodejs','npm','nsolid'):
            if not re.fullmatch(r'[0-9][0-9A-Za-z.:~+_-]{0,99}',fields[2]):
                raise RuntimeError('O APT retornou uma versão do ambiente não reconhecida.')
            preserve.append(fields[0] + '=' + fields[2])
    simulation = runner([*APT,'--simulate','install',package,*preserve],capture_output=True,text=True,env=APT_ENV,timeout=35)
    if simulation.returncode:
        raise RuntimeError('O APT não encontrou um plano compatível. Confira os repositórios e o estado dos pacotes.')
    for line in (simulation.stdout or '').splitlines():
        parts = line.split()
        if parts and (parts[0] in ('Remv','Purg') or
                      (parts[0] in ('Inst','Conf') and len(parts) > 1 and PROTECTED.fullmatch(parts[1].split(':')[0]))):
            raise RuntimeError('Instalação bloqueada: o APT mudaria o Node.js, o Nginx ou removeria um pacote.')
    status('installing',pkg,'Plano validado. Instalando pelo APT…')
    result = runner([*APT,'-y','install',package,*preserve],capture_output=True,timeout=460,env=APT_ENV)
    if result.returncode:
        raise RuntimeError('O APT não concluiu a instalação. Consulte o serviço de pacotes da VPS.')

def main(runner=subprocess.run):
    if os.geteuid() != 0: raise RuntimeError('Serviço deve executar como root')
    st = RUNTIME.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o077:
        raise RuntimeError('Diretório administrativo inseguro')
    lock_fd = os.open(RUNTIME / 'packages.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'r+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        pkg = read_request()
        REQUEST.unlink()
        status('checking',pkg,'Verificando o plano do APT antes de instalar…')
        try:
            install_allowed(pkg,runner)
            status('completed',pkg,'Instalação concluída.')
        except (subprocess.TimeoutExpired,OSError):
            status('failed',pkg,'O APT não respondeu a tempo. Consulte o serviço de pacotes da VPS.')
            raise
        except Exception as exc:
            status('failed',pkg,str(exc))
            raise


if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'AL Sistemas: instalação recusada/falhou: {str(exc)[:200]}', file=sys.stderr)
        sys.exit(1)
