#!/usr/bin/python3
"""Caixa de entrada root para ZIPs de atualização do núcleo.

Executado pela unidade root alsistemas-inbox.service, disparada por
alsistemas-inbox.path quando /var/lib/alsistemas-inbox deixa de estar vazia.
Somente root grava nessa pasta (0700); o painel Node nunca a enxerga, então a
confiança é a mesma de rodar o instalador manualmente. O ZIP é validado,
copiado para a área root-only e entregue ao mesmo alsistemas-updater.service
usado pelo painel (backup, rollback e verificação de saúde incluídos).
A pasta sempre termina vazia: arquivos recusados vão para inbox-rejected.
"""
import hashlib
import grp
import json
import os
import pwd
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

INBOX = Path('/var/lib/alsistemas-inbox')
BACKUP = Path('/var/backups/alsistemas')
REJECTED = BACKUP / 'inbox-rejected'
DATA = Path('/var/lib/alsistemas')
REQUEST = Path('/etc/alsistemas-vps/update-request.json')
NAME_RE = re.compile(r'^AL-Sistemas-v[0-9][0-9._]*-VPS\.zip$')
MIN_ZIP, MAX_ZIP = 512, 32 * 1024 * 1024
STABLE_TIMEOUT = 90
STABLE_INTERVAL = 1.5


def log(message):
    print('[alsistemas-inbox] ' + message, file=sys.stderr, flush=True)


def wait_stable(path):
    """Evita ler um arquivo ainda em cópia (scp/mv entre sistemas de arquivos)."""
    last = None
    deadline = time.monotonic() + STABLE_TIMEOUT
    while time.monotonic() < deadline:
        try:
            size = os.lstat(path).st_size
        except OSError:
            return False
        if size == last:
            return True
        last = size
        time.sleep(STABLE_INTERVAL)
    return False


def reject(path, reason):
    log(f'Recusado {path.name!r}: {reason}')
    try:
        REJECTED.mkdir(mode=0o700, parents=True, exist_ok=True)
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', path.name)[:80] or 'arquivo'
        dest = REJECTED / f'{int(time.time())}-{secrets.token_hex(3)}-{safe}'
        shutil.move(str(path), str(dest))
        (REJECTED / (dest.name + '.motivo.txt')).write_text(reason[:300] + '\n', encoding='utf-8')
    except OSError as error:
        log(f'Não foi possível mover para inbox-rejected ({error}); removendo para não repetir o gatilho')
        try:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
            else:
                path.unlink(missing_ok=True)
        except OSError:
            pass


def busy():
    running = subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', 'alsistemas-updater.service'],
                             capture_output=True, timeout=10)
    return running.returncode == 0 or REQUEST.exists()


def write_status(token):
    uid, gid = pwd.getpwnam('alsistemas').pw_uid, grp.getgrnam('alsistemas').gr_gid
    data = {'id': token, 'mode': 'file', 'stage': 'queued',
            'message': 'ZIP recebido na caixa de entrada; aguardando o serviço iniciar',
            'time': datetime.now(timezone.utc).isoformat()}
    fd, raw = tempfile.mkstemp(prefix='.update-status-', suffix='.tmp', dir=DATA)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            json.dump(data, out, ensure_ascii=False)
            out.flush()
            os.fchmod(out.fileno(), 0o600)
            os.fchown(out.fileno(), uid, gid)
        os.replace(raw, DATA / 'update-status.json')
    finally:
        Path(raw).unlink(missing_ok=True)


def begin_update(source):
    token = secrets.token_hex(12)
    staged = BACKUP / f'upload-{token}.zip'
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not MIN_ZIP <= info.st_size <= MAX_ZIP:
            raise RuntimeError('arquivo não regular, com hardlink ou fora de 512 B a 32 MiB')
        digest = hashlib.sha256()
        with os.fdopen(os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as out:
            while True:
                chunk = os.read(fd, 131072)
                if not chunk:
                    break
                digest.update(chunk)
                out.write(chunk)
            out.flush()
            os.fsync(out.fileno())
    except Exception:
        staged.unlink(missing_ok=True)
        raise
    finally:
        os.close(fd)
    sha256 = digest.hexdigest()
    request = {'id': token, 'mode': 'file', 'archive': staged.name, 'sha256': sha256}
    try:
        REQUEST.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        with os.fdopen(os.open(REQUEST, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'w') as out:
            json.dump(request, out)
            out.flush()
            os.fsync(out.fileno())
        write_status(token)
        proc = subprocess.run(['/usr/bin/systemctl', 'start', '--no-block', 'alsistemas-updater.service'],
                              capture_output=True, timeout=15)
        if proc.returncode != 0:
            raise RuntimeError('não foi possível iniciar alsistemas-updater.service')
    except Exception:
        REQUEST.unlink(missing_ok=True)
        staged.unlink(missing_ok=True)
        (DATA / 'update-status.json').unlink(missing_ok=True)
        raise
    source.unlink(missing_ok=True)
    log(f'Atualização {token} entregue ao atualizador (SHA-256 {sha256[:16]})')


def process():
    entries = sorted(INBOX.iterdir()) if INBOX.is_dir() else []
    started = False
    for entry in entries:
        info = os.lstat(entry)
        if not stat.S_ISREG(info.st_mode):
            reject(entry, 'não é arquivo regular')
            continue
        if not wait_stable(entry):
            reject(entry, 'o envio não terminou de gravar a tempo')
            continue
        if not NAME_RE.fullmatch(entry.name):
            reject(entry, 'nome fora do padrão AL-Sistemas-vX.Y.Z-VPS.zip')
            continue
        if started or busy():
            reject(entry, 'já existe uma atualização em andamento')
            continue
        try:
            begin_update(entry)
            started = True
        except Exception as error:
            if entry.exists():
                reject(entry, 'falha ao preparar: ' + str(error))
            else:
                log('Falha ao preparar: ' + str(error))


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Execução somente como root')
    BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
    process()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        log('Erro inesperado: ' + str(error))
        sys.exit(1)
