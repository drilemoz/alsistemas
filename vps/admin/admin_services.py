"""Ações fixas para serviços gerenciáveis. Não administra SSH, sudo ou o painel."""
import subprocess

ACTIONS = {
    'nginx':('restart',),
    'php8.3-fpm':('start','stop','restart'),
    'mariadb':('start','stop','restart'),
    'mongod':('start','stop','restart'),
    'redis-server':('start','stop','restart'),
    'postgresql':('start','stop','restart'),
    'postfix':('start','stop','restart'),
    'dovecot':('start','stop','restart'),
}
class ServiceError(Exception): pass

def control_service(task,runner=subprocess.run):
    if set(task) != {'action','unit','operation'}: raise ServiceError('Parâmetros não autorizados.')
    unit,operation=task['unit'],task['operation']
    if not isinstance(unit,str) or operation not in ACTIONS.get(unit,()): raise ServiceError('Este serviço ou ação não é gerenciável pelo painel.')
    name=unit+'.service'
    state=runner(['/bin/systemctl','show','--property=LoadState','--value',name],capture_output=True,text=True,timeout=6)
    if state.returncode or state.stdout.strip() != 'loaded': raise ServiceError('Serviço indisponível ou não instalado.')
    if unit=='nginx':
        checked=runner(['/usr/sbin/nginx','-t'],capture_output=True,timeout=8)
        if checked.returncode: raise ServiceError('Nginx não passou na validação. Nenhum reinício foi solicitado.')
    # Agendamento no systemd para a resposta HTTP não depender da duração do serviço.
    result=runner(['/bin/systemctl','--no-block',operation,name],capture_output=True,timeout=8)
    if result.returncode: raise ServiceError('O systemd recusou a operação. Consulte o estado do serviço.')
    return {'ok':True,'submitted':True,'unit':unit,'operation':operation}
