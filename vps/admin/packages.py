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
import time
import tempfile
from datetime import datetime, timezone
sys.path.insert(0,str(Path(__file__).resolve().parent))
from package_policy import ALLOWED, package_status as status, package_gate, read_job, write_job
from mongo_repo import ensure_mongo_repo

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
        if not isinstance(payload,dict) or set(payload) not in ({'package'},{'package','operation','job'}) or not isinstance(payload.get('package'),str) or payload['package'] not in ALLOWED:
            raise ValueError('Pacote não autorizado')
        if set(payload) == {'package'}: return payload['package']
        if payload['operation'] not in ('install','remove') or not isinstance(payload['job'],str) or not re.fullmatch('[a-f0-9]{24}',payload['job']):
            raise ValueError('Operação não autorizada')
        return payload
    finally:
        if fd >= 0: os.close(fd)


APT = ['/usr/bin/apt-get','--no-remove','--no-install-recommends','--no-upgrade']
PROTECTED = re.compile(r'^(?:nodejs(?:-doc|-dev)?|node|npm|libnode[0-9]*|libnode-dev|nsolid|nginx(?:-core|-full|-light|-common)?)$')
APT_ENV = {'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','DEBIAN_FRONTEND':'noninteractive'}

class Canceled(Exception): pass

MONGO_STACK = ['mongodb-org','mongodb-org-database','mongodb-org-server','mongodb-org-mongos','mongodb-org-tools','mongodb-org-database-tools-extra','mongodb-org-shell','mongodb-mongosh','mongodb-database-tools']
REMOVE_PROTECTED = {'python3','curl','unzip','nodejs','npm','nginx'}
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
def redact(data):
    raw = ANSI.sub('',str(data)).replace('\r','\n')
    raw = re.sub(r'(?i)(https?://)[^\s/@]+@',r'\1[oculto]@',raw)
    raw = re.sub(r'(?i)(password|token|secret|senha)(\s*[:=]\s*)[^\s]+',r'\1\2[oculto]',raw)
    return ''.join(c for c in raw if c in '\n\t' or ord(c) >= 32 and ord(c) != 127)[-14000:]

def stream_run(cmd,report):
    with tempfile.TemporaryFile() as log:
        with subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,env=APT_ENV) as proc:
            def tail():
                end = os.fstat(log.fileno()).st_size
                return redact(os.pread(log.fileno(),min(end,14000),max(0,end-14000)).decode('utf-8','replace'))
            while True:
                try:
                    code = proc.wait(timeout=1)
                    report(tail())
                    return code
                except subprocess.TimeoutExpired:
                    report(tail())

def install_allowed(pkg, runner=subprocess.run, *, operation='install', report=None, gate=None, stream=None):
    if pkg not in ALLOWED or operation not in ('install','remove'): raise ValueError('Pacote não autorizado')
    package = ALLOWED[pkg]
    emit = report or (lambda stage,msg,log='':status(stage,pkg,msg))
    if operation == 'remove' and package in REMOVE_PROTECTED:
        raise ValueError('Este pacote é necessário ao painel e não pode ser removido por aqui.')
    if operation == 'install' and pkg == 'mongodb':
        ensure_mongo_repo(runner,APT_ENV,lambda msg:emit('checking',msg))
    if operation == 'remove' and pkg == 'mongodb':
        existing = runner(['/usr/bin/dpkg-query','-W','-f=${binary:Package}\t${Status}\n',*MONGO_STACK],capture_output=True,text=True,env=APT_ENV,timeout=10)
        targets = [line.split('\t')[0].split(':')[0] for line in (existing.stdout or '').splitlines()
                   if '\tinstall ok installed' in line and line.split('\t')[0].split(':')[0] in MONGO_STACK]
        if not targets: raise ValueError('Não há componentes MongoDB gerenciados para remover.')
    else: targets = [package]
    pin = runner(['/usr/bin/dpkg-query','-W','-f=${binary:Package}\t${Status}\t${Version}\n','nodejs','npm','nsolid'],
                 capture_output=True,text=True,env=APT_ENV,timeout=8)
    if pin.returncode not in (0,1): raise RuntimeError('Não foi possível verificar o Node.js antes da operação.')
    preserve = []
    for row in (pin.stdout or '').splitlines():
        fields = row.split('\t')
        if len(fields) == 3 and fields[1] == 'install ok installed' and fields[0] in ('nodejs','npm','nsolid'):
            if not re.fullmatch(r'[0-9][0-9A-Za-z.:~+_-]{0,99}',fields[2]): raise RuntimeError('Versão do APT inválida.')
            preserve.append(fields[0] + '=' + fields[2])
    apt = APT if operation == 'install' else ['/usr/bin/apt-get','-o','APT::Get::AutomaticRemove=false']
    args = [operation,*targets,*(preserve if operation == 'install' else [])]
    simulation = runner([*apt,'--simulate',*args],capture_output=True,text=True,env=APT_ENV,timeout=35)
    plan = redact((simulation.stdout or '') + '\n' + (getattr(simulation,'stderr','') or ''))
    if report: emit('checking','Plano do APT recebido.',plan)
    if simulation.returncode: raise RuntimeError('O APT não encontrou um plano compatível. Veja os detalhes.')
    for entry in (simulation.stdout or '').splitlines():
        parts = entry.split()
        if len(parts) < 2: continue
        name = parts[1].split(':')[0]
        if (parts[0] == 'Purg' or (parts[0] == 'Remv' and (operation == 'install' or name not in targets))
            or (parts[0] in ('Inst','Conf') and (operation == 'remove' or PROTECTED.fullmatch(name)))):
            raise RuntimeError('Operação bloqueada: o APT mudaria o Node.js, o Nginx ou outros pacotes.')
    if gate: gate()
    stage = 'removing' if operation == 'remove' else 'installing'
    msg = 'Plano validado. ' + ('Removendo pelo APT…' if operation == 'remove' else 'Instalando pelo APT…')
    emit(stage,msg,plan)
    if stream: code=stream([*apt,'-y',*args],lambda log:emit(stage,msg,plan+'\n'+log))
    else: code=runner([*apt,'-y',*args],capture_output=True,timeout=460,env=APT_ENV).returncode
    if code: raise RuntimeError('O APT não concluiu a operação. Veja os detalhes.')

def main(runner=subprocess.run):
    if os.geteuid() != 0: raise RuntimeError('Serviço deve executar como root')
    st = RUNTIME.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o077: raise RuntimeError('Diretório administrativo inseguro')
    lock_fd = os.open(RUNTIME / 'packages.lock',os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,0o600)
    with os.fdopen(lock_fd,'r+') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        task = read_request()
        REQUEST.unlink()
        if isinstance(task,str): task={'package':task,'job':None,'operation':'install'}
        pkg,job,op = task['package'],task['job'],task['operation']
        tail = ''
        started_at = datetime.now(timezone.utc).isoformat()
        def emit(stage,msg,log=''):
            nonlocal tail
            if log: tail=log[-18000:]
            status(stage,pkg,msg,job=job,operation=op,log=tail,started_at=started_at)
        def transition(phase):
            with package_gate():
                control=read_job()
                if job and control.get('job') != job: raise RuntimeError('A tarefa não corresponde ao controle ativo.')
                if control.get('cancel') and phase != 'done': raise Canceled()
                if job: write_job({**control,'phase':phase})
        try:
            transition('checking')
            emit('checking','Verificando o plano do APT…')
            install_allowed(pkg,runner,operation=op,report=emit,gate=lambda:transition('applying'),stream=stream_run)
            emit('completed','Remoção concluída.' if op=='remove' else 'Instalação concluída.')
        except Canceled: emit('canceled','Operação cancelada antes de alterar pacotes.')
        except (subprocess.TimeoutExpired,OSError):
            emit('failed','O APT não respondeu. Veja os detalhes da operação.')
            raise
        except Exception as exc:
            emit('failed',str(exc))
            raise
        finally: transition('done')

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(f'AL Sistemas: operação recusada/falhou: {redact(str(exc))[:200]}',file=sys.stderr)
        sys.exit(1)
