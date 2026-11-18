"""Catálogo compartilhado com o painel, sem aceitar nomes de pacotes do APT do navegador."""
import json
import fcntl
from contextlib import contextmanager
import os
import pwd
import re
import stat
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

HISTORY_FILE = 'packages-history.json'
HISTORY_LIMIT = 20
HISTORY_BYTES = 1024 * 1024
TERMINAL = {'completed','failed','canceled'}

def _write_state(state,name,data,user):
    fd, raw = tempfile.mkstemp(prefix='.packages-',suffix='.tmp',dir=state)
    temp = Path(raw)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump(data,out,ensure_ascii=False)
            out.flush(); os.fsync(out.fileno())
            os.fchmod(out.fileno(),0o600)
            os.fchown(out.fileno(),user.pw_uid,user.pw_gid)
        os.replace(temp,state / name)
    finally:
        temp.unlink(missing_ok=True)

def _read_history(state):
    try:
        with os.fdopen(os.open(state / HISTORY_FILE,os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW),'rb') as src:
            info = os.fstat(src.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > HISTORY_BYTES: return []
            content = src.read(HISTORY_BYTES+1)
            if len(content) > HISTORY_BYTES: return []
            data = json.loads(content)
            return data if isinstance(data,list) else []
    except (OSError,ValueError): return []

def _history_record(entry):
    if not isinstance(entry,dict) or not isinstance(entry.get('job'),str) or not re.fullmatch('[a-f0-9]{24}',entry['job']): return None
    if not isinstance(entry.get('package'),str) or entry['package'] not in ALLOWED: return None
    if entry.get('operation') not in ('install','remove') or entry.get('stage') not in ('completed','failed','canceled'): return None
    if not isinstance(entry.get('time'),str): return None
    result = {key:entry[key] for key in ('job','package','operation','stage')}
    for key,maxlen in [('time',80),('startedAt',80),('message',200),('log',18000)]:
        value = entry.get(key)
        if not isinstance(value,str): result[key] = ''
        elif key == 'log': result[key] = value.encode('utf-8',errors='replace')[-maxlen:].decode('utf-8',errors='ignore')
        else: result[key] = value[-maxlen:]
    return result

def package_status(stage, package, message, state=Path('/var/lib/alsistemas'), *, job=None, operation='install', log='', started_at=None):
    data = {'stage':stage,'package':package,'message':message[:200],
            'time':datetime.now(timezone.utc).isoformat(),'job':job,'operation':operation,'log':log[-18000:],'startedAt':started_at}
    user = pwd.getpwnam('alsistemas')
    _write_state(state,'packages-status.json',data,user)
    if stage in TERMINAL and job:
        current = _history_record(data)
        if not current: return
        seen = {job}
        history = [current]
        for entry in _read_history(state):
            old = _history_record(entry)
            if not old or old['job'] in seen: continue
            seen.add(old['job'])
            history.append(old)
            if len(history) >= HISTORY_LIMIT: break
        # Progress remains usable even if the history volume is unavailable.
        try: _write_state(state,HISTORY_FILE,history,user)
        except OSError: pass

RUNTIME = Path('/run/alsistemas-vps')

@contextmanager
def package_gate(root=RUNTIME):
    fd = os.open(root/'package-gate.lock',os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'a') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        yield

def read_job(root=RUNTIME):
    p = root/'package-job.json'
    if not p.exists(): return {}
    with os.fdopen(os.open(p,os.O_RDONLY | os.O_NOFOLLOW),'r') as stream:
        return json.load(stream)

def write_job(info,root=RUNTIME):
    fd,temp = tempfile.mkstemp(prefix='.job-',dir=root)
    with os.fdopen(fd,'w') as stream:
        json.dump(info,stream)
    os.replace(temp,root/'package-job.json')
