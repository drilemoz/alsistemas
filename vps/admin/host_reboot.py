"""Reinício normal do Linux, agendado por unidade fixa e confirmado pela mudança de boot."""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time
from contextlib import contextmanager

RUNTIME = Path('/run/alsistemas-vps')
STATE = Path('/etc/alsistemas-vps/reboot-request.json')
BOOT = Path('/proc/sys/kernel/random/boot_id')
TIMER = 'alsistemas-host-reboot.timer'
MAX_WINDOW = 240
UNITS = {
    'alsistemas-package-installer.service':'Operação de dependências do APT',
    'alsistemas-updater.service':'Atualização do painel',
    'alsistemas-project-updater.service':'Atualização de projeto',
    'apt-daily.service':'Rotina do APT',
    'apt-daily-upgrade.service':'Atualização automática do APT',
}
boot_pattern = re.compile(r'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
class RebootError(Exception): pass

def boot_id(path=BOOT):
    ident=path.read_text(encoding='ascii').strip()
    if not boot_pattern.fullmatch(ident): raise RebootError('O Linux não informou um identificador de boot válido.')
    return ident

def read_request(path=STATE):
    try:
        with os.fdopen(os.open(path,os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK),'rb') as source:
            info=os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 4096:
                raise RebootError('Registro de reinício não confiável.')
            data=json.loads(source.read(4097))
            if (not isinstance(data,dict) or data.get('phase') not in ('scheduled','dispatching','blocked','failed')
                or not isinstance(data.get('boot'),str) or not boot_pattern.fullmatch(data['boot'])
                or not isinstance(data.get('requestedAt'),(int,float))):
                raise RebootError('Registro de reinício inválido.')
            return data
    except FileNotFoundError: return None

def write_request(data,path=STATE):
    fd,tmp=tempfile.mkstemp(prefix='.als-reboot-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump(data,out,ensure_ascii=False)
            os.fchmod(out.fileno(),0o644)
            out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
        parent=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(parent)
        finally: os.close(parent)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

@contextmanager
def reboot_lock(runtime=RUNTIME):
    info=runtime.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077: raise RebootError('Diretório administrativo inseguro.')
    fd=os.open(runtime/'tasks.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'a') as lock:
        try: fcntl.flock(lock.fileno(),fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error: raise RebootError('Há uma tarefa administrativa, publicação ou backup em execução.') from error
        yield

def blockers(runner,runtime=RUNTIME,state=STATE):
    result=runner(['/bin/systemctl','show','--property=Id,LoadState,ActiveState','--',*UNITS],
                  capture_output=True,text=True,timeout=8)
    loaded={}
    for block in result.stdout.split('\n\n'):
        info=dict(line.split('=',1) for line in block.splitlines() if '=' in line)
        if info.get('Id') in UNITS: loaded[info['Id']]=info
    if not set(list(UNITS)[:3]).issubset(loaded):
        raise RebootError('Não foi possível verificar as tarefas do painel no systemd.')
    found=[UNITS[u] for u,info in loaded.items() if info.get('ActiveState') in ('active','activating','deactivating','reloading','refreshing')]
    for path,label in [(runtime/'package-request.json','Dependências em fila'),(runtime/'project-request.json','Projeto em fila'),
                       (state.parent/'update-request.json','Atualização do painel em fila')]:
        if path.exists() or path.is_symlink(): found.append(label)
    return list(dict.fromkeys(found))

def schedule(task,runner=subprocess.run,*,runtime=RUNTIME,state=STATE,boot=BOOT):
    if task != {'action':'schedule_host_reboot'}: raise RebootError('Parâmetros de reinício não autorizados.')
    with reboot_lock(runtime):
        ident=boot_id(boot)
        previous=read_request(state)
        now=time.time()
        if previous and previous['phase'] in ('scheduled','dispatching') and previous['boot']==ident and now-previous['requestedAt']<MAX_WINDOW:
            raise RebootError('Já existe um reinício solicitado. Aguarde a confirmação.')
        busy=blockers(runner,runtime,state)
        if busy: raise RebootError('Aguarde antes de reiniciar: '+', '.join(busy)+'.')
        data={'phase':'scheduled','boot':ident,'requestedAt':now}
        write_request(data,state)
        try:
            result=runner(['/bin/systemctl','start','--',TIMER],capture_output=True,text=True,timeout=8)
            if result.returncode: raise RebootError('O systemd não conseguiu agendar o reinício.')
        except (OSError,subprocess.TimeoutExpired,RebootError) as error:
            write_request({**data,'phase':'failed','reason':'Não foi possível agendar o reinício no systemd.'},state)
            raise RebootError('Não foi possível agendar o reinício no systemd.') from error
        return {'ok':True,'requested':True}

def dispatch(runner=subprocess.run,*,runtime=RUNTIME,state=STATE,boot=BOOT):
    data=read_request(state)
    if not data or data['phase']!='scheduled' or data['boot']!=boot_id(boot): return
    if time.time()-data['requestedAt']>MAX_WINDOW:
        write_request({**data,'phase':'failed','reason':'O agendamento expirou antes de executar.'},state)
        return
    try:
        with reboot_lock(runtime):
            if read_request(state)!=data: return
            busy=blockers(runner,runtime,state)
            if busy: raise RebootError('Reinício não executado. Tarefas em andamento: '+', '.join(busy)+'.')
            write_request({**data,'phase':'dispatching'},state)
            result=runner(['/bin/systemctl','reboot'],capture_output=True,text=True,timeout=8)
            if result.returncode: raise RebootError('O Linux recusou o pedido de reinício.')
    except (OSError,ValueError,subprocess.TimeoutExpired,RebootError) as error:
        write_request({**data,'phase':'blocked','reason':str(error)[:250] if isinstance(error,RebootError) else 'Não foi possível validar ou enviar o reinício.'},state)

if __name__ == '__main__':
    if os.geteuid()!=0: raise SystemExit('A unidade de reinício exige root.')
    dispatch()
