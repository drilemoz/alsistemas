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
HOSTING_PATTERN = r"/api/projects/[a-z][a-z0-9-]+/hosting/upload$"
HOSTING_LOCATION = "location ~ ^" + HOSTING_PATTERN + " {"


def new_config(original):
    if not original.startswith('# AL-SISTEMAS-MANAGED\n'):
        raise ValueError('Configuração não pertence ao painel')
    if ' listen 443 ssl;' not in original or 'proxy_pass http://127.0.0.1:8181;' not in original:
        raise ValueError('Vhost HTTPS desconhecido')
    existing = [e for e in ENDPOINTS if f'location = {e} {{' in original]
    if len(existing) == len(ENDPOINTS) and HOSTING_LOCATION in original:
        return original
    if len(existing) not in (0,len(ENDPOINTS)) or HOSTING_LOCATION in original:
        raise ValueError('Vhost parcialmente alterado; revisão manual necessária')
    last_endpoint = ' location = ' + ENDPOINTS[-1] + ' {'
    if original.count(ANCHOR) != 1 and (not existing or original.count(last_endpoint) != 1):
        raise ValueError('Modelo de vhost incompatível')
    blocks = []
    for location in [*('location = ' + e + ' {' for e in ENDPOINTS if not existing), HOSTING_LOCATION]:
        blocks.append(f""" {location}
   client_max_body_size 32m;
   proxy_pass http://127.0.0.1:8181;
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-Proto https;
   proxy_read_timeout 120s;
 }}""")
    if existing:
        return original.replace(last_endpoint, blocks[0] + '\n' + last_endpoint, 1)
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
