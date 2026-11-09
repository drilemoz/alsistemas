#!/usr/bin/python3
"""Instala apenas pacotes APT de uma allowlist fixa por unidade systemd root.
Nenhum argumento, pacote ou comando arbitrário chega do navegador.
"""
import fcntl
import json
import os
import pwd
import grp
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from datetime import datetime, timezone

RUNTIME = Path('/run/alsistemas-vps')
REQUEST = RUNTIME / 'package-request.json'
STATE = Path('/var/lib/alsistemas')
ALLOWED = {
    'php-curl': 'php8.3-curl',
    'php-mbstring': 'php8.3-mbstring',
    'php-xml': 'php8.3-xml',
    'php-mysql': 'php8.3-mysql',
    'php-zip': 'php8.3-zip',
    'php-gd': 'php8.3-gd',
    'php-intl': 'php8.3-intl',
    'composer': 'composer',
}


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
        if not isinstance(payload, dict) or set(payload) != {'package'} or payload['package'] not in ALLOWED:
            raise ValueError('Pacote não autorizado')
        return payload['package']
    finally:
        if fd >= 0: os.close(fd)


def status(stage, package, message):
    data = {'stage': stage, 'package': package, 'message': message[:200],
            'time': datetime.now(timezone.utc).isoformat()}
    uid = pwd.getpwnam('alsistemas').pw_uid
    gid = grp.getgrnam('alsistemas').gr_gid
    fd, raw = tempfile.mkstemp(prefix='.packages-', suffix='.tmp', dir=STATE)
    temp = Path(raw)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump(data, out, ensure_ascii=False)
            out.flush(); os.fsync(out.fileno())
            os.fchmod(out.fileno(), 0o600)
            os.fchown(out.fileno(), uid, gid)
        os.replace(temp, STATE / 'packages-status.json')
    finally:
        temp.unlink(missing_ok=True)


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
        status('installing', pkg, 'Instalação iniciada via APT; acompanhe o status no painel')
        try:
            completed = runner(['/usr/bin/apt-get', 'install', '-y', '--no-install-recommends', ALLOWED[pkg]],
                               capture_output=True, timeout=480)
            if completed.returncode != 0:
                raise RuntimeError('APT retornou erro; veja journalctl -u alsistemas-package-installer.service')
            status('completed', pkg, 'Pacote instalado; consulte a versão novamente')
        except Exception as exc:
            status('failed', pkg, str(exc))
            raise


if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'AL Sistemas: instalação recusada/falhou: {str(exc)[:200]}', file=sys.stderr)
        sys.exit(1)
