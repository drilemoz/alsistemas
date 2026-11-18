"""Catálogo compartilhado com o painel, sem aceitar nomes de pacotes do APT do navegador."""
import json
import os
import pwd
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_here = Path(__file__).resolve().parent
_catalog_path = _here / 'package_catalog.json'
if not _catalog_path.is_file() and _here.name == 'admin':
    _catalog_path = _here.parent / 'src' / 'package_catalog.json'
_catalog = json.loads(_catalog_path.read_text(encoding='utf-8'))
ALLOWED = {item['id']:item['apt'] for item in _catalog}
if len(ALLOWED) != len(_catalog) or any(not re.fullmatch(r'[a-z0-9][a-z0-9.+-]+',value) for value in ALLOWED.values()):
    raise RuntimeError('Catálogo de pacotes inválido.')

def package_status(stage, package, message, state=Path('/var/lib/alsistemas')):
    data = {'stage':stage,'package':package,'message':message[:200],
            'time':datetime.now(timezone.utc).isoformat()}
    user = pwd.getpwnam('alsistemas')
    fd, raw = tempfile.mkstemp(prefix='.packages-',suffix='.tmp',dir=state)
    temp = Path(raw)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump(data,out,ensure_ascii=False)
            out.flush(); os.fsync(out.fileno())
            os.fchmod(out.fileno(),0o600)
            os.fchown(out.fileno(),user.pw_uid,user.pw_gid)
        os.replace(temp,state / 'packages-status.json')
    finally:
        temp.unlink(missing_ok=True)
