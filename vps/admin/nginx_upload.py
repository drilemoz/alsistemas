#!/usr/bin/python3
"""Atualiza somente o vhost Nginx padrão pertencente ao AL Sistemas.
Não modifica nenhum vhost de terceiros nem abre uploads nas outras rotas.
"""
import os
from pathlib import Path
import sys
import tempfile

ANCHOR = " client_max_body_size 64k;\n location / {"
ENDPOINTS = ("/api/updates/upload", "/api/projects/iguatamaonline/update/upload")


def new_config(original):
    if not original.startswith('# AL-SISTEMAS-MANAGED\n'):
        raise ValueError('Configuração não pertence ao painel')
    if ' listen 443 ssl;' not in original or 'proxy_pass http://127.0.0.1:8181;' not in original:
        raise ValueError('Vhost HTTPS desconhecido')
    if all(f'location = {e} {{' in original for e in ENDPOINTS):
        return original
    if any(f'location = {e} {{' in original for e in ENDPOINTS):
        raise ValueError('Vhost parcialmente alterado; revisão manual necessária')
    if original.count(ANCHOR) != 1:
        raise ValueError('Modelo de vhost incompatível')
    blocks = []
    for endpoint in ENDPOINTS:
        blocks.append(f""" location = {endpoint} {{
   client_max_body_size 32m;
   proxy_pass http://127.0.0.1:8181;
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-Proto https;
   proxy_read_timeout 120s;
 }}""")
    return original.replace(ANCHOR, ' client_max_body_size 64k;\n' + '\n'.join(blocks) + '\n location / {', 1)


def update_file(target):
    if target.is_symlink() or not target.is_file():
        raise ValueError('Caminho do vhost inseguro')
    old = target.read_text(encoding='utf-8')
    changed = new_config(old)
    if changed == old:
        return False
    info = target.stat()
    fd, path = tempfile.mkstemp(prefix='.als-nginx-', dir=target.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(changed)
            stream.flush()
            os.fchmod(stream.fileno(), info.st_mode & 0o777)
            os.fchown(stream.fileno(), info.st_uid, info.st_gid)
            os.fsync(stream.fileno())
        os.replace(path, target)
    finally:
        if os.path.exists(path): os.unlink(path)
    return True


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Informe o arquivo gerenciado do painel')
        update_file(Path(sys.argv[1]))
    except (OSError, ValueError) as error:
        print('AL Sistemas: ' + str(error), file=sys.stderr)
        sys.exit(1)
