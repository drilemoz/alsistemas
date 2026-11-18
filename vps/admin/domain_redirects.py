"""Operações Nginx isoladas para redirecionamentos criados pelo painel."""
import hashlib
import json
import os
import re
import stat
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

PREFIX = 'als-redirect-'
MARKER = '# AL-SISTEMAS-REDIRECT '
FILES = re.compile(r'^als-redirect-[a-z0-9.-]{4,180}\.conf$')
LABEL = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?')
RESERVED = {'www', 'painel', 'panel', 'admin', 'api', 'mail', 'smtp', 'imap', 'pop', 'autodiscover', 'migrar'}
ACME = '/var/lib/letsencrypt/alsistemas-webroot'
MAX_RULES = 50


class RedirectError(Exception):
    pass


def host_ok(value):
    return (isinstance(value, str) and 4 <= len(value) <= 253 and '.' in value
            and all(LABEL.fullmatch(label) for label in value.split('.'))
            and re.search(r'[a-z]', value.split('.')[-1]) is not None
            and not value.endswith(('.local', '.localhost', '.internal', '.home', '.test', '.invalid', '.onion')))


def source_ok(zone, host):
    if not host_ok(zone) or not host_ok(host) or len(host) > 180 or not host.endswith('.' + zone):
        raise RedirectError('Origem deve ser um subdomínio do domínio selecionado.')
    if set(host[:-(len(zone) + 1)].split('.')) & RESERVED:
        raise RedirectError('Subdomínio reservado.')


def validate_rule(zone, host, config):
    source_ok(zone, host)
    expected = {'destination', 'code', 'preserve', 'enabled', 'https'}
    if not isinstance(config, dict) or set(config) != expected or type(config['code']) is not int or config['code'] not in (301, 302):
        raise RedirectError('Confirme os campos e um código HTTP 301 ou 302.')
    if any(type(config[key]) is not bool for key in ('preserve', 'enabled', 'https')):
        raise RedirectError('Configuração inválida.')
    destination = config['destination']
    # Nenhum escape, delimitador, variável Nginx, espaço ou comentário literal.
    if (not isinstance(destination, str) or len(destination) > 1100 or
            not re.fullmatch(r'https?://[A-Za-z0-9._~:/?@!&()*+,=%-]+', destination) or
            re.search(r'%(?![0-9A-Fa-f]{2})|(?i:%0[ad])', destination)):
        raise RedirectError('Use uma URL HTTP/HTTPS válida, com caracteres especiais codificados.')
    value = urlsplit(destination)
    if not host_ok(value.netloc) or value.netloc.lower() == host:
        raise RedirectError('Destino deve ter hostname público e diferente da origem, sem porta nem credenciais.')
    if config['preserve'] and ('?' in destination or destination.endswith('/')):
        raise RedirectError('Ao preservar caminho e parâmetros, use um destino-base sem query e sem barra final.')
    return {**config, 'zone': zone, 'host': host}


def render(rule):
    host = rule['host']
    target = rule['destination'] + ('$request_uri' if rule['preserve'] else '')
    body = (f'    server_name {host};\n'
            f'    location ^~ /.well-known/acme-challenge/ {{ root {ACME}; try_files $uri =404; }}\n'
            f'    location / {{ return {rule["code"]} "{target}"; }}\n'
            '}\n')
    config = MARKER + json.dumps(rule, sort_keys=True, separators=(',', ':')) + '\n'
    config += 'server {\n    listen 80;\n' + body
    if rule['https']:
        config += ('server {\n    listen 443 ssl;\n'
                   f'    ssl_certificate /etc/letsencrypt/live/{host}/fullchain.pem;\n'
                   f'    ssl_certificate_key /etc/letsencrypt/live/{host}/privkey.pem;\n' + body)
    return config.encode('ascii')


def safe_dirs(available, enabled):
    for directory in (available, enabled):
        state = directory.lstat()
        if not stat.S_ISDIR(state.st_mode) or state.st_uid != os.geteuid() or state.st_mode & 0o022 or directory.resolve() != directory:
            raise RedirectError('Diretório de configuração Nginx não confiável.')


def rules_in(available, enabled):
    out = {}
    for file in available.glob(PREFIX + '*.conf'):
        if not FILES.fullmatch(file.name):
            continue
        if len(out) >= MAX_RULES:
            raise RedirectError('Há arquivos demais no inventário de redirecionamentos.')
        try:
            st = file.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.geteuid() or st.st_size > 4600 or st.st_mode & 0o022:
                raise RedirectError('Arquivo de redirecionamento não confiável.')
            raw = file.read_bytes()
            marker = raw.splitlines()[0].decode('ascii')
            if not marker.startswith(MARKER):
                raise RedirectError('Marcador ausente.')
            data = json.loads(marker[len(MARKER):])
            zone, host = data.pop('zone'), data.pop('host')
            rule = validate_rule(zone, host, data)
            if PREFIX + host + '.conf' != file.name or raw != render(rule):
                raise RedirectError('A regra foi ajustada fora do painel.')
            link = enabled / file.name
            if rule['enabled']:
                if not link.is_symlink() or (enabled / os.readlink(link)).resolve() != file:
                    raise RedirectError('Vínculo ativo da regra mudou fora do painel.')
            elif os.path.lexists(link):
                raise RedirectError('Vínculo inesperado em regra desativada.')
        except (OSError, ValueError, TypeError, IndexError, KeyError, RedirectError):
            raise RedirectError('Inventário de redirecionamentos inconsistente. Revise o Nginx fora do painel.') from None
        out[host] = (rule, raw)
    return out


def gone_or_matches(file, link, old):
    if old is None and (os.path.lexists(file) or os.path.lexists(link)):
        raise RedirectError('O nome do arquivo está ocupado por uma configuração externa.')


def atomically_write(file, raw):
    fd, tmp = tempfile.mkstemp(prefix='.als-redirect-', dir=file.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o644)
        os.replace(tmp, file)
    finally:
        Path(tmp).unlink(missing_ok=True)


def write_state(file, link, state):
    if state is None:
        link.unlink(missing_ok=True)
        file.unlink(missing_ok=True)
        return
    rule, raw = state
    atomically_write(file, raw)
    if rule['enabled']:
        if not link.is_symlink():
            link.symlink_to(file)
    else:
        link.unlink(missing_ok=True)


def require_clear_host(host, file, runner):
    check = runner(['/usr/sbin/nginx', '-T'], capture_output=True, text=True, timeout=6)
    if check.returncode or len(check.stdout) > 3 * 1024 * 1024:
        raise RedirectError('Não foi possível verificar as origens já usadas no Nginx.')
    # O dump separa cada arquivo incluído. Não examina a configuração da
    # própria regra e reconhece server_name que ocupa mais de uma linha.
    chunks = re.split(r'^# configuration file (.+):\s*$', check.stdout, flags=re.MULTILINE)
    for label, raw in zip(chunks[1::2], chunks[2::2]):
        if Path(label).resolve() == file:
            continue
        raw = '\n'.join(line.split('#', 1)[0] for line in raw.splitlines())
        for match in re.finditer(r'\bserver_name\s+([^;{}]+);', raw):
            for name in match[1].lower().split():
                name = name.strip('\'"')
                if (host == name or (name.startswith('*.') and host.endswith(name[1:])) or
                    (name.startswith('.') and (host == name[1:] or host.endswith(name))) or
                    (name.endswith('.*') and host.startswith(name[:-1]))):
                    raise RedirectError('A origem já é atendida por outro site ou curinga do Nginx.')


def check_nginx(runner):
    result = runner(['/usr/sbin/nginx', '-t'], capture_output=True, text=True, timeout=6)
    if result.returncode or 'conflicting server name' in result.stderr.lower():
        raise RedirectError('O Nginx rejeitou a configuração por erro ou conflito.')


def reload_nginx(runner):
    result = runner(['/bin/systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=8)
    if result.returncode:
        raise RedirectError('O Nginx não aceitou o recarregamento.')


def public_rule(state):
    rule, raw = state
    return {**rule, 'revision': hashlib.sha256(raw).hexdigest()}


def execute_redirect(task, available, enabled, runner=subprocess.run, cert_root=Path('/etc/letsencrypt/live')):
    safe_dirs(available, enabled)
    zone = task.get('zone')
    if not host_ok(zone):
        raise RedirectError('Domínio inválido.')
    all_rules = rules_in(available, enabled)
    if task.get('action') == 'list_domain_redirects' and set(task) == {'action', 'zone'}:
        return {'ok': True, 'items': [public_rule(r) for host, r in sorted(all_rules.items()) if r[0]['zone'] == zone]}
    action = task.get('action')
    required = {'action','zone','host','revision'}
    if action == 'save_domain_redirect':
        required.add('rule')
    if action not in ('save_domain_redirect', 'delete_domain_redirect') or set(task) != required:
        raise RedirectError('Operação de redirecionamento inválida.')
    host, revision = task['host'], task['revision']
    source_ok(zone, host)
    old = all_rules.get(host)
    if old and old[0]['zone'] != zone:
        raise RedirectError('Esta origem pertence a outra zona.')
    if revision != (public_rule(old)['revision'] if old else None):
        raise RedirectError('A regra mudou. Atualize a lista antes de aplicar.')
    if action == 'delete_domain_redirect' and old is None:
        raise RedirectError('Regra não encontrada.')
    file = available / (PREFIX + host + '.conf')
    link = enabled / file.name
    gone_or_matches(file, link, old)
    new = None
    if action == 'save_domain_redirect':
        if old is None and len(all_rules) >= MAX_RULES:
            raise RedirectError('Limite de redirecionamentos do painel atingido.')
        rule = validate_rule(zone, host, task['rule'])
        if rule['enabled']:
            require_clear_host(host, file, runner)
            if rule['https'] and not all((cert_root / host / name).is_file() for name in ('fullchain.pem', 'privkey.pem')):
                raise RedirectError('Não foi encontrado certificado para esta origem. Emita o certificado antes de ativar HTTPS.')
            # Impede ciclos entre regras administradas, inclusive em outras zonas.
            target = urlsplit(rule['destination']).hostname
            visited = {host}
            while target in all_rules or target == host:
                if target in visited:
                    raise RedirectError('A mudança criaria um ciclo de redirecionamentos.')
                previous_rule = all_rules[target][0]
                if not previous_rule['enabled']:
                    break
                visited.add(target)
                target = urlsplit(previous_rule['destination']).hostname
        new = (rule, render(rule))
    try:
        write_state(file, link, new)
        check_nginx(runner)
        reload_nginx(runner)
    except (OSError, RedirectError, subprocess.TimeoutExpired) as error:
        try:
            write_state(file, link, old)
            check_nginx(runner)
            reload_nginx(runner)
        except (OSError, RedirectError, subprocess.TimeoutExpired):
            raise RedirectError('A alteração falhou e a reversão não pôde ser confirmada. Revise o Nginx.') from None
        raise RedirectError(f'Alteração cancelada. Configuração anterior restaurada. {error}') from None
    return {'ok': True, 'item': public_rule(new) if new else None}
