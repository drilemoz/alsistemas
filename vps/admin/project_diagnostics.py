"""Diagnósticos administrativos limitados, sem shell nem leitura de credenciais."""
import os
import stat
import re
import subprocess
import pwd
import grp
import json
import fcntl
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from project_maintenance import PROJECT_ROOT, schema_diagnostics

GROUPS = ('all', 'files', 'services', 'web', 'database', 'host', 'deploy')

@contextmanager
def parent_fd(root, rel):
    parts = rel.split('/') if rel else []
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        yield fd, parts[-1] if parts else '.'
    finally:
        os.close(fd)


def safe_read(root, rel, limit=4096):
    with parent_fd(root, rel) as (fd, name):
        with os.fdopen(os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd), 'rb') as f:
            s = os.fstat(f.fileno())
            if not stat.S_ISREG(s.st_mode) or s.st_size > limit:
                raise ValueError('Arquivo não regular ou acima do limite')
            return f.read(limit).decode(errors='replace')


def redact(s):
    s = re.sub(r'(?i)(password|passwd|token|secret|authorization|api[_-]?key)(\s*[:=]\s*)[^\s]+', r'\1\2[omitido]', s)
    s = re.sub(r'(?i)(https?://)[^\s/@]+:[^\s/@]+@', r'\1[omitido]@', s)
    return s[-4000:]


def collect(root, runner=subprocess.run, group='all'):
    if group not in GROUPS: raise ValueError('Consulta desconhecida')
    results = []
    def add(label, code, output):
        results.append(dict(label=label, code=code, output=output))
    def selected(*groups): return group == 'all' or group in groups
    def run(item):
        label, args = item
        try:
            p = runner(args, capture_output=True, text=True, timeout=5, env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'})
            return dict(label=label, code=p.returncode, output=redact((p.stdout or '') + (p.stderr or '')))
        except (OSError, subprocess.TimeoutExpired) as e:
            return dict(label=label, code=-1, output=type(e).__name__)
    special = root.name == 'iguatamaonline'
    if selected('files','deploy'):
        paths = ['', 'VERSION','app','public','storage']
        if special:
            paths += ['app/updater.php','public/admin.php','storage/backups','storage/updater','storage/updater/jobs','storage/updater/vps','storage/updater/vps/private','storage/updater/vps/private/.code.lock','storage/updater/vps/.dispatch.lock','storage/updater/vps/request.json','storage/updater/vps/running.json','storage/updater/vps/worker.json','storage/updater/vps/private/maintenance','storage/.update-maintenance','deploy/aws/iguatama-deploy.service','deploy/aws/iguatama-deploy.timer']
        for rel in paths:
            try:
                with parent_fd(root, rel) as (fd,name):
                    s = os.stat(name, dir_fd=fd, follow_symlinks=False)
                try: user = pwd.getpwuid(s.st_uid).pw_name
                except KeyError: user = str(s.st_uid)
                try: group_name = grp.getgrgid(s.st_gid).gr_name
                except KeyError: group_name = str(s.st_gid)
                expected = {'storage/updater':'iguanews-deploy:www-data 3770','storage/updater/vps':'iguanews-deploy:www-data 3770','storage/updater/vps/private':'iguanews-deploy:www-data 2750','storage/updater/vps/private/.code.lock':'iguanews-deploy:www-data 0600','storage/updater/vps/.dispatch.lock':'iguanews-deploy:www-data 0660'}.get(rel) if special else None
                add(str(root/rel),0,f'{stat.filemode(s.st_mode)} {user}:{group_name} uid={s.st_uid} gid={s.st_gid} links={s.st_nlink}'+(f'; esperado: {expected}' if expected else ''))
            except OSError as e:
                add(str(root/rel), e.errno, e.strerror)
        try:
            version=safe_read(root,'VERSION',128).strip()
            if re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,3}(?:[-+][a-zA-Z0-9.-]+)?',version): add('Versão instalada',0,version)
        except (OSError,ValueError): pass
        if special:
            try:
                with parent_fd(root,'storage/updater/vps/private/.code.lock') as (fd,name):
                    s=os.stat(name,dir_fd=fd,follow_symlinks=False)
                    acct=pwd.getpwnam('iguanews-deploy')
                    ok=stat.S_ISREG(s.st_mode) and s.st_uid==acct.pw_uid and s.st_nlink==1 and not s.st_mode & 0o077
                    add('Validação do lock privado',0 if ok else 1,'Proprietário, tipo e modo compatíveis' if ok else 'Tipo, proprietário, links ou modo incompatíveis')
                    if ok:
                        with parent_fd(root,'storage/updater/vps/private/.code.lock') as (fd,name):
                            lock = os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
                            try:
                                if os.fstat(lock).st_ino != s.st_ino: raise OSError('Lock substituído durante a consulta')
                                try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                                except BlockingIOError: add('Estado do lock privado',1,'Ocupado no momento da consulta')
                                else:
                                    fcntl.flock(lock,fcntl.LOCK_UN)
                                    add('Estado do lock privado',0,'Livre no momento da consulta')
                            finally: os.close(lock)
            except (OSError,KeyError) as e: add('Validação do lock privado',1,str(e)[:200])
            try:
                worker=json.loads(safe_read(root,'storage/updater/vps/worker.json'))
                if not isinstance(worker,dict): raise ValueError('Formato inválido')
                at=worker.get('at')
                age=int(time.time()-at) if isinstance(at,(int,float)) and 0<=at<=time.time() else None
                checks=worker.get('checks',{})
                known=('root_atomic','app_atomic','public_atomic','updater_atomic','jobs_atomic','backups_atomic','control_atomic','queue_secure','queue_lock','config_read','php_extensions','legacy_clear')
                detail={k:checks[k] for k in known if isinstance(checks,dict) and isinstance(checks.get(k),bool)}
                ready=worker.get('ready') is True and age is not None and age<=180
                add('Última vistoria do worker',0 if ready else 1,json.dumps({'ready':worker.get('ready') is True,'idade_segundos':age,'checks':detail},ensure_ascii=False))
            except (OSError,ValueError,TypeError) as e: add('Última vistoria do worker',1,type(e).__name__)
    cmds=[]
    if selected('host'): cmds += [('Disco',['df','-h',str(root)]),('Memória',['free','-m']),('Sistema',['uname','-sr']),('Carga',['uptime']),('Reinicialização',['test','-f','/run/reboot-required'])]
    if selected('web'): cmds += [('Nginx',['nginx','-t']),('PHP CLI',['php','-v']),('Extensões PHP CLI',['php','-m']),('Validação PHP-FPM',['php-fpm8.3','-t'])]
    if selected('services','deploy'):
        units=['nginx.service','php8.3-fpm.service','mariadb.service','alsistemas-terminal.socket']
        if special: units+=['iguatama-deploy.service','iguatama-deploy.timer','alsistemas-project-updater.service']
        cmds += [('Serviços',['systemctl','show',*units,'-p','Id,LoadState,ActiveState,SubState,Result,UnitFileState,ExecMainStatus'])]
        if special: cmds += [
            ('Timer de implantação',['systemctl','list-timers','iguatama-deploy.timer','--all','--no-pager']),
            ('Conta de implantação',['id','iguanews-deploy']),
            ('Detalhes da unidade de implantação',['systemctl','show','iguatama-deploy.service','-p','User,Group,FragmentPath,WorkingDirectory,ExecMainCode,ExecMainStatus,Result,ActiveEnterTimestamp,InactiveExitTimestamp']),
            ('Eventos recentes do serviço de implantação (revise antes de compartilhar)',['journalctl','-u','iguatama-deploy.service','-n','30','--no-pager','-o','short-iso']),
            ('Eventos recentes do timer de implantação',['journalctl','-u','iguatama-deploy.timer','-n','15','--no-pager','-o','short-iso']),
            ('Eventos do atualizador AL Sistemas',['journalctl','-u','alsistemas-project-updater.service','-n','20','--no-pager','-o','short-iso'])]
    if selected('files'): cmds += [('Atributos',['lsattr','-d',str(root)])]
    if root == PROJECT_ROOT and selected('database','deploy'):
        results.extend(schema_diagnostics(root))
    if selected('database'): cmds += [('MariaDB versão do cliente',['mariadb','--version']),('MariaDB conexão local (admin, sem credenciais do projeto)',['mariadb-admin','--no-defaults','--protocol=socket','--user=root','--connect-timeout=3','ping'])]
    with ThreadPoolExecutor(max_workers=4) as pool: results.extend(pool.map(run,cmds))
    if selected('web'):
        # Não exportar requisições, URLs, credenciais ou configuração completa.
        for log in (Path('/var/log/nginx/error.log'),Path('/var/log/nginx')/('als-'+root.name+'-error.log')):
            try:
                with os.fdopen(os.open(log,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as f:
                    s=os.fstat(f.fileno())
                    if not stat.S_ISREG(s.st_mode): continue
                    f.seek(max(0,s.st_size-131072)); data=f.read(131072).decode(errors='replace')
                for phrase in ('client intended to send too large body','Permission denied','upstream timed out','connect() failed'):
                    add(log.name+': '+phrase,0,str(sum(phrase in line for line in data.splitlines()))+' ocorrências no trecho recente')
            except OSError as e: add(log.name,e.errno,e.strerror)
        # Configurações do sistema: somente diretivas numéricas, nunca conteúdo integral.
        files=[Path('/etc/php/8.3/fpm/php.ini'),*sorted(Path('/etc/php/8.3/fpm/pool.d').glob('*.conf'))[:20],Path('/etc/nginx/nginx.conf'),Path('/etc/nginx/sites-enabled')/root.name,Path('/etc/nginx/sites-enabled')/('als-'+root.name+'.conf')]
        pattern=r'^\s*(?:(?:php_admin_value|php_value)\[)?(?:upload_max_filesize|post_max_size|memory_limit|max_execution_time|client_max_body_size)\]?\s*(?:=\s*|\s+)-?\d+[kKmMgG]?\s*;?\s*$'
        for file in files:
            try:
                target=file.resolve(strict=True)
                if not target.is_relative_to('/etc') or not target.is_file() or target.stat().st_size>262144: continue
                lines=[l.strip() for l in target.read_text(errors='replace').splitlines() if re.fullmatch(pattern,l)]
                add(str(file),0,'\n'.join(lines)[:1500] or 'Sem diretiva explícita')
            except OSError as e: add(str(file),e.errno,e.strerror)
    return {'ok':True,'project':root.name,'group':group,'checks':results}


def repair_timer(root, runner=subprocess.run):
    """Only enable a previously installed timer; never install units from mutable project files."""
    if root.name != 'iguatamaonline': raise ValueError('Reparo disponível apenas para IguatamaOnline')
    for rel in ('storage/updater/vps/request.json','storage/updater/vps/running.json','storage/updater/vps/private/maintenance','storage/.update-maintenance'):
        with parent_fd(root,rel) as (fd,name):
            try: os.stat(name,dir_fd=fd,follow_symlinks=False)
            except FileNotFoundError: continue
            raise ValueError('Atualização ou recuperação pendente: '+rel)
    for unit in ('iguatama-deploy.service','iguatama-deploy.timer'):
        p=runner(['systemctl','show',unit,'-p','LoadState','--value'],capture_output=True,text=True,timeout=5)
        if p.returncode or p.stdout.strip()!='loaded': raise ValueError('Unidade não instalada: '+unit)
    p=runner(['systemctl','enable','--now','iguatama-deploy.timer'],capture_output=True,text=True,timeout=15)
    if p.returncode: raise ValueError('Não foi possível ativar o timer: '+redact(p.stderr or '')[:200])
    return {'ok':True,'message':'Timer habilitado. Confira o diagnóstico de serviços.'}

# Fixed recovery actions only. Never accept a command or unit from the browser.
REPAIRS = {
    'nginx-start': ('nginx.service', ('/usr/sbin/nginx','-t')),
    'php-start': ('php8.3-fpm.service', ('/usr/sbin/php-fpm8.3','-t')),
    'mariadb-start': ('mariadb.service', None),
    'terminal-start': ('alsistemas-terminal.socket', None),
}
REPAIR_IDS = ('deploy-timer', *REPAIRS, 'deploy-control-permissions', 'deploy-backup-permissions')


def repair_project(root, repair, runner=subprocess.run):
    if not isinstance(repair,str): raise ValueError('Reparo desconhecido.')
    if repair in DEPLOY_REPAIR_IDS:
        if root.name != 'iguatamaonline': raise ValueError('Reparo exclusivo do IguatamaOnline.')
        try:
            return repair_control_permissions(root) if repair == DEPLOY_REPAIR_IDS[0] else repair_backup_permissions(root)
        except KeyError as exc: raise ValueError('Conta de implantação ou PHP ausente.') from exc
    if repair == 'deploy-timer':
        return repair_timer(root, runner)
    if not isinstance(repair,str) or repair not in REPAIRS:
        raise ValueError('Reparo desconhecido.')
    unit, validation = REPAIRS[repair]
    def call(args, timeout=6):
        return runner(args,capture_output=True,text=True,timeout=timeout,
                      env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'})
    def state():
        p=call(['/bin/systemctl','show',unit,'-p','LoadState,ActiveState,UnitFileState,SubState'])
        if p.returncode: raise ValueError('Não foi possível consultar '+unit+': '+redact(p.stderr or '')[:250])
        return dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
    before=state()
    if before.get('LoadState')!='loaded' or before.get('UnitFileState','').startswith('masked'):
        raise ValueError('Serviço não instalado ou mascarado: '+unit)
    if before.get('ActiveState')=='active':
        return {'ok':True,'changed':False,'message':unit+' já está ativo. Nenhuma alteração realizada.','before':before,'after':before}
    if before.get('ActiveState') not in ('inactive','failed'):
        raise ValueError('Serviço em transição ou estado desconhecido. Consulte novamente.')
    if validation:
        p=call(list(validation),8)
        if p.returncode: raise ValueError('Configuração inválida; serviço não iniciado: '+redact((p.stderr or '')+(p.stdout or ''))[:500])
    p=call(['/bin/systemctl','--no-block','start',unit],8)
    if p.returncode: raise ValueError('Systemd recusou a inicialização: '+redact(p.stderr or '')[:300])
    after=state()
    return {'ok':True,'changed':True,'submitted':True,'before':before,'after':after,
            'message':unit+(' está ativo.' if after.get('ActiveState')=='active' else ': inicialização solicitada; confira o estado após a execução.')}

# Perfil baseado no instalador AWS do Meu-Site 1.0.158. Não executa arquivos do portal.
DEPLOY_REPAIR_IDS = ('deploy-control-permissions', 'deploy-backup-permissions')


def _snapshot(fd):
    s = os.fstat(fd)
    return {'uid': s.st_uid, 'gid': s.st_gid, 'mode': f'{stat.S_IMODE(s.st_mode):04o}', 'inode': s.st_ino}


def _assert_idle(fd):
    try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc: raise ValueError('Lock ocupado: nenhuma permissão alterada.') from exc


def _missing(fd, name):
    try: os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError: return
    raise ValueError('Atualização ou recuperação pendente: '+name)


def _open_at(stack, fd, name, directory=False):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    if directory: flags |= os.O_DIRECTORY
    child = os.open(name, flags, dir_fd=fd)
    stack.callback(os.close, child)
    return child


def _regular_lock(fd, uid, gid, allow_root=False):
    s = os.fstat(fd)
    if (not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_size != 0
            or s.st_uid not in ({uid, 0} if allow_root else {uid}) or s.st_gid not in ({gid, 0} if allow_root else {gid})):
        raise ValueError('Lock com tipo, dono, grupo, conteúdo ou links inesperados; revisão manual necessária.')
    if s.st_uid == 0 and s.st_mode & 0o022:
        raise ValueError('Lock de root com escrita compartilhada; revisão manual necessária.')
    return s


def _same_entry(parent, name, fd):
    a, b = os.stat(name,dir_fd=parent,follow_symlinks=False), os.fstat(fd)
    if (a.st_dev,a.st_ino)!=(b.st_dev,b.st_ino): raise ValueError('Controle substituído durante a operação.')


def repair_control_permissions(root, *, deploy=None, web=None):
    from contextlib import ExitStack
    from project_maintenance import verify_project, guard_mutation_ownership
    verify_project(root=root)
    guard_mutation_ownership(root)
    deploy = deploy or pwd.getpwnam('iguanews-deploy')
    web = web or pwd.getpwnam('www-data')
    if deploy.pw_uid in (0,web.pw_uid) or web.pw_uid==0 or root.stat().st_uid!=deploy.pw_uid or root.parent.stat().st_uid!=0:
        raise ValueError('Conta dedicada ou proprietário da produção incompatível; nenhuma alteração.')
    with ExitStack() as stack:
        base = os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW); stack.callback(os.close,base)
        if os.fstat(base).st_uid!=deploy.pw_uid or os.fstat(base).st_mode & 0o022: raise ValueError('Raiz do projeto insegura.')
        storage = _open_at(stack,base,'storage',True)
        s=os.fstat(storage)
        if (s.st_uid,s.st_gid)!=(web.pw_uid,web.pw_gid) or s.st_mode & 0o027:
            raise ValueError('storage fora do perfil esperado; revisão manual necessária.')
        _missing(storage,'.update-maintenance')
        updater = _open_at(stack,storage,'updater',True)
        vps = _open_at(stack,updater,'vps',True)
        for fd in (updater,vps):
            s=os.fstat(fd)
            if (s.st_uid,s.st_gid)!=(deploy.pw_uid,web.pw_gid) or stat.S_IMODE(s.st_mode)!=0o3770:
                raise ValueError('Diretório da fila fora do perfil 3770; revisão manual necessária.')
        dispatch = _open_at(stack,vps,'.dispatch.lock')
        s=_regular_lock(dispatch,deploy.pw_uid,web.pw_gid)
        if stat.S_IMODE(s.st_mode)!=0o660: raise ValueError('Lock da fila fora do perfil 0660; revisão manual necessária.')
        _assert_idle(dispatch)
        private = _open_at(stack,vps,'private',True)
        s=os.fstat(private)
        if (s.st_uid,s.st_gid)!=(deploy.pw_uid,web.pw_gid) or s.st_mode & 0o022:
            raise ValueError('Pasta privada possui dono/grupo inesperado ou escrita compartilhada; revisão manual necessária.')
        for name in ('request.json','running.json'): _missing(vps,name)
        _missing(private,'maintenance'); _missing(storage,'.update-maintenance')
        try: lock = _open_at(stack,private,'.code.lock')
        except FileNotFoundError:
            raise ValueError('Lock privado ausente. Não será recriado durante reparo de permissões; consulte o instalador do portal.')
        _regular_lock(lock,deploy.pw_uid,web.pw_gid,allow_root=True)
        _assert_idle(lock)
        before={'private':_snapshot(private),'lock':_snapshot(lock)}
        # Verificar todos os nomes antes de operar em descritores já abertos.
        for p,n,f in ((base,'storage',storage),(storage,'updater',updater),(updater,'vps',vps),(vps,'.dispatch.lock',dispatch),(vps,'private',private),(private,'.code.lock',lock)):
            _same_entry(p,n,f)
        for name in ('request.json','running.json'): _missing(vps,name)
        _missing(private,'maintenance'); _missing(storage,'.update-maintenance')
        changed=[]
        try:
            for fd,key,uid,gid,mode in ((private,'private',deploy.pw_uid,web.pw_gid,0o2750),(lock,'lock',deploy.pw_uid,web.pw_gid,0o600)):
                old=before[key]
                if (old['uid'],old['gid'],int(old['mode'],8))==(uid,gid,mode): continue
                changed.append((fd,old))
                if (old['uid'],old['gid'])!=(uid,gid): os.fchown(fd,uid,gid)
                os.fchmod(fd,mode)
            _same_entry(vps,'private',private); _same_entry(private,'.code.lock',lock)
            after={'private':_snapshot(private),'lock':_snapshot(lock)}
            if after['private']['mode']!='2750' or after['lock']['mode']!='0600' or after['lock']['uid']!=deploy.pw_uid or after['lock']['gid']!=web.pw_gid:
                raise ValueError('Validação das permissões falhou.')
        except Exception as exc:
            errors=[]
            for fd,old in reversed(changed):
                try:
                    if (_snapshot(fd)['uid'],_snapshot(fd)['gid'])!=(old['uid'],old['gid']): os.fchown(fd,old['uid'],old['gid'])
                    os.fchmod(fd,int(old['mode'],8))
                except OSError as rollback: errors.append(str(rollback))
            if errors: raise ValueError('Reversão de permissões incompleta: '+ '; '.join(errors)) from exc
            raise
        return {'ok':True,'changed':bool(changed),'before':before,'after':after,'message':'Permissões do controle privado verificadas. Nenhum lock foi removido.'}


def repair_backup_permissions(root, backup=None):
    from contextlib import ExitStack
    from project_maintenance import BACKUP_ROOT
    backup = backup or BACKUP_ROOT
    if root.name!='iguatamaonline': raise ValueError('Reparo exclusivo do IguatamaOnline.')
    with ExitStack() as stack:
        # Abrir cada componente absoluto sem seguir links; só pastas root sem escrita alheia.
        parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY); stack.callback(os.close,parent)
        for part in backup.parent.parts[1:]:
            parent=_open_at(stack,parent,part,True)
            s=os.fstat(parent)
            if s.st_uid!=0 or s.st_mode & 0o022: raise ValueError('Ancestral do backup não confiável.')
        if stat.S_IMODE(os.fstat(parent).st_mode)!=0o700: raise ValueError('Pasta geral de backups deve ser privada (0700).')
        try: fd=_open_at(stack,parent,backup.name,True)
        except FileNotFoundError:
            os.mkdir(backup.name,0o700,dir_fd=parent)
            fd=_open_at(stack,parent,backup.name,True)
            created=True
        else: created=False
        before=_snapshot(fd)
        if before['uid']!=0 or before['gid']!=0 or int(before['mode'],8)&0o022:
            raise ValueError('Pasta de backup com dono/grupo inesperado ou escrita compartilhada; revisão manual necessária.')
        _same_entry(parent,backup.name,fd)
        if before['mode']!='0700': os.fchmod(fd,0o700)
        after=_snapshot(fd)
        return {'ok':True,'changed':created or before!=after,'created':created,'before':None if created else before,'after':after,'message':'Pasta privada de backups verificada (0700). Nenhum backup foi alterado.'}
