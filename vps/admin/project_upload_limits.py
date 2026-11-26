"""Per-project upload limits; only root-owned enabled vhosts, no global PHP changes."""
import os
import re
import stat
import subprocess
from pathlib import Path


def transform(raw, name, values=None, root=Path('/var/www/projetos')):
    # Refuse complex or shared vhosts rather than guessing at Nginx scope.
    clean = re.sub(r'(?m)#.*$', '', raw)
    if not re.search(r'(?m)^\s*root\s+' + re.escape(str(root / name)) + r'(?:/public)?\s*;', clean):
        raise ValueError('Vhost não aponta para este projeto.')
    if re.search(r'(?m)^\s*root\s+(?!'+re.escape(str(root / name))+r'(?:/public)?\s*;)[^;]+;', clean):
        raise ValueError('Vhost com raízes adicionais: configuração não suportada.')
    if re.search(r'\b(?:alias|PHP_ADMIN_VALUE)\s+', clean):
        raise ValueError('Vhost personalizado: configuração não suportada.')
    names = re.findall(r'\bserver_name\s+([^;]+);', clean)
    if not names or any(set(x.split()) != set(names[0].split()) for x in names):
        raise ValueError('Vhost compartilhado ou sem domínio.')
    limits = re.findall(r'\bclient_max_body_size\s+(\S+)\s*;', clean)
    php = re.findall(r'\bfastcgi_pass\s+unix:/run/php/php([0-9]+\.[0-9]+)-fpm\.sock\s*;', clean)
    if len(php) != len(re.findall(r'\bfastcgi_pass\s+', clean)) or len(set(php)) > 1:
        raise ValueError('PHP-FPM personalizado não suportado.')
    params = re.findall(r'(?m)^\s*fastcgi_param\s+PHP_VALUE\s+"upload_max_filesize=(\d+)M\\npost_max_size=(\d+)M";\s*# ALS-UPLOAD\s*$', raw)
    if len(params) != len(re.findall(r'\bfastcgi_param\s+PHP_VALUE\b', clean)):
        raise ValueError('PHP_VALUE personalizado: configuração não suportada.')
    if values is None:
        ini = {}
        if php:
            p = Path('/etc/php') / php[0] / 'fpm/php.ini'
            if p.is_file():
                ini = dict(re.findall(r'(?m)^\s*(upload_max_filesize|post_max_size)\s*=\s*([^;\s]+)', p.read_text()))
        return {'ok':True,'nginx': ', '.join(dict.fromkeys(limits)) or 'Herdado (padrão Nginx 1m)' , 'php': bool(php), 'upload': params[0][0]+'M' if params else ini.get('upload_max_filesize','Não detectado'), 'post':params[0][1]+'M' if params else ini.get('post_max_size','Não detectado')}
    n,u,p = values
    if any(type(x) is not int or not 1 <= x <= 320 for x in values) or (php and not n >= p > u):
        raise ValueError('Use Nginx ≥ POST > upload (1–320 MiB).')
    # Keep location-specific restrictions intact; refuse ambiguous layouts.
    lines = raw.splitlines(keepends=True)
    out_lines = []
    depth = 0
    servers = 0
    for line in lines:
        code = re.sub(r'#[^\n]*', '', line)
        if depth == 0 and re.fullmatch(r'\s*server\s*\{\s*', code):
            servers += 1
            out_lines.extend([line, '    client_max_body_size '+str(n)+'m;\n'])
        elif depth == 1 and re.fullmatch(r'\s*client_max_body_size\s+\S+\s*;\s*', code):
            pass
        else:
            out_lines.append(line)
        # Ignore quoted strings and escaped braces in regular expressions.
        code = re.sub(r'"(?:\\.|[^"\\])*"|\\.', '', code)
        depth += code.count('{') - code.count('}')
        if depth < 0: raise ValueError('Formato Nginx não suportado.')
    if depth or servers != len(names): raise ValueError('Formato de bloco server não suportado.')
    out = ''.join(out_lines)
    out = re.sub(r'(?m)^[ \t]*fastcgi_param\s+PHP_VALUE\s+"upload_max_filesize=\d+M\\npost_max_size=\d+M";[ \t]*# ALS-UPLOAD[^\n]*\n','',out)
    if php:
        out,count = re.subn(r'(?m)^(\s*fastcgi_pass\s+unix:/run/php/php[0-9.]+-fpm\.sock\s*;)[ \t]*$',lambda m:m[1]+'\n        fastcgi_param PHP_VALUE "upload_max_filesize='+str(u)+'M\\npost_max_size='+str(p)+'M"; # ALS-UPLOAD',out)
        if count != len(php): raise ValueError('Formato FastCGI não suportado.')
    return out


def execute(task, root, available, enabled, runner, atomic):
    name=task.get('name')
    if not isinstance(name,str) or not re.fullmatch(r'[a-z][a-z0-9-]{1,39}',name) or name in ('alsistemas','iguatama-teste') or '--' in name:
        raise ValueError('Projeto não autorizado.')
    project=root/name
    if project.is_symlink() or not project.is_dir(): raise ValueError('Projeto inexistente.')
    candidates=[]
    for filename in ('als-'+name+'.conf',name,name+'.conf'):
        link=enabled/filename
        if not link.exists(): continue
        target=link.resolve()
        if target.parent not in (available.resolve(),enabled.resolve()): raise ValueError('Vhost fora do diretório autorizado.')
        s=target.stat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022 or s.st_size>131072: raise ValueError('Vhost inseguro.')
        if target not in candidates: candidates.append(target)
    if len(candidates)!=1: raise ValueError('Vhost ativo único não encontrado.')
    target=candidates[0]; old=target.read_text()
    if task.get('mode')=='inspect' and set(task)=={'action','name','mode'}: return transform(old,name,root=root)
    if task.get('mode')!='apply' or set(task)!={'action','name','mode','nginx','upload','post'}: raise ValueError('Parâmetros inválidos.')
    new=transform(old,name,(task['nginx'],task['upload'],task['post']),root)
    def run(args): return runner(args,capture_output=True,timeout=10).returncode
    atomic(target,new)
    try:
        if run(['/usr/sbin/nginx','-t']) or run(['/bin/systemctl','reload','nginx']): raise ValueError('Nginx rejeitou a configuração.')
    except Exception:
        atomic(target,old)
        run(['/bin/systemctl','reload','nginx'])
        raise
    return transform(new,name,root=root)
