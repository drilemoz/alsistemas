#!/usr/bin/python3
"""Atualizador de Releases públicas com hash SHA-256 e rollback local.
Executado exclusivamente pela unidade root-owned alsistemas-updater.service.
Não aceita URL, comandos ou caminho passados pelo navegador.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import urllib.parse
import zipfile
import time
from pathlib import Path
from datetime import datetime, timezone

DATA = Path('/var/lib/alsistemas')
TARGET = Path('/opt/alsistemas-vps/current')
HELPER = Path('/usr/local/libexec/alsistemas-helper')
UNIT = Path('/etc/systemd/system/alsistemas-vps.service')
SUDOERS = Path('/etc/sudoers.d/alsistemas-vps')
BACKUP = Path('/var/backups/alsistemas')
REPO_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}/[A-Za-z0-9_.-]{1,100}$')
VERSION_RE = re.compile(r'^\d+\.\d+\.\d+$')
MAX_ZIP = 32 * 1024 * 1024
MAX_UNPACK = 120 * 1024 * 1024
REQUEST = Path('/etc/alsistemas-vps/update-request.json')
OPERATION_ID = None
OPERATION_MODE = None


def status(stage, message, **extra):
    data = {'stage': stage, 'message': message, 'time': datetime.now(timezone.utc).isoformat(),
            'id': OPERATION_ID, 'mode': OPERATION_MODE, **extra}
    # O diretório do painel é gravável pelo Node; arquivos temporários root não
    # podem ter nomes previsíveis nem seguir symlinks criados por esse usuário.
    import pwd
    import grp
    fd, raw_path = tempfile.mkstemp(prefix='.update-status-', suffix='.tmp', dir=DATA)
    tmp = Path(raw_path)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
            os.fchmod(f.fileno(), 0o600)
            os.fchown(f.fileno(), pwd.getpwnam('alsistemas').pw_uid, grp.getgrnam('alsistemas').gr_gid)
        os.replace(tmp, DATA / 'update-status.json')
    finally:
        if tmp.exists(): tmp.unlink()


def safe_url(url, repo, asset=None):
    parts = urllib.parse.urlparse(url)
    if parts.scheme != 'https' or parts.username or parts.password or parts.port or parts.fragment:
        return False
    if parts.hostname == 'api.github.com':
        if parts.query: return False
        return parts.path == f'/repos/{repo}/releases/latest' and asset is None
    if parts.hostname == 'github.com':
        if parts.query: return False
        return parts.path.startswith(f'/{repo}/releases/download/') and (asset is None or parts.path.endswith('/' + asset))
    # Redirecionamento do próprio GitHub para armazenamento de assets de Release.
    return parts.hostname in ('release-assets.githubusercontent.com', 'objects.githubusercontent.com') and asset is not None


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    repo = None
    asset = None

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not safe_url(newurl, self.repo, self.asset):
            raise RuntimeError('Redirecionamento de download não autorizado')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, repo, limit, asset=None, on_progress=None):
    if not safe_url(url, repo, asset):
        raise RuntimeError('URL de atualização não autorizada')
    handler = SafeRedirect()
    handler.repo, handler.asset = repo, asset
    opener = urllib.request.build_opener(handler)
    req = urllib.request.Request(url, headers={'User-Agent': 'AL-Sistemas-VPS/2.0.12', 'Accept': 'application/vnd.github+json'})
    with opener.open(req, timeout=25) as res:
        length = res.headers.get('Content-Length')
        if length and int(length) > limit:
            raise RuntimeError('Arquivo excede limite de tamanho')
        blocks, count, last_report = [], 0, 0
        expected = int(length) if length and length.isdigit() else None
        while True:
            chunk = res.read(min(131072, limit + 1 - count))
            if not chunk: break
            count += len(chunk)
            if count > limit: raise RuntimeError('Arquivo excede limite de tamanho')
            blocks.append(chunk)
            if on_progress and expected and expected > 0:
                percent = min(100, int(100 * count / expected))
                if percent >= last_report + 5 or percent == 100:
                    on_progress(percent, count, expected)
                    last_report = percent
        return b''.join(blocks)


def version_tuple(v):
    if not isinstance(v, str) or not VERSION_RE.fullmatch(v):
        raise RuntimeError('Versão inválida na atualização')
    return tuple(map(int, v.split('.')))


def archive_validate(z):
    seen = set()
    if len(z.infolist()) > 1800:
        raise RuntimeError('ZIP com arquivos demais')
    total = 0
    for i in z.infolist():
        name = i.filename
        # ZIP de distribuição deve conter somente caminhos relativos e regulares.
        if not name or name.startswith('/') or '\\' in name or '\x00' in name or ':' in name:
            raise RuntimeError('Caminho inseguro no ZIP')
        parts = name.rstrip('/').split('/')
        if any(part in ('', '.', '..') for part in parts):
            raise RuntimeError('Caminho inseguro no ZIP')
        if name in seen:
            raise RuntimeError('Caminho duplicado no ZIP')
        seen.add(name)
        mode = (i.external_attr >> 16) & 0o170000
        if mode not in (0, 0o100000, 0o040000):
            raise RuntimeError('ZIP contém link ou arquivo especial')
        total += i.file_size
        if total > MAX_UNPACK:
            raise RuntimeError('ZIP extraído grande demais')


def read_current():
    return json.loads((TARGET / 'package.json').read_text(encoding='utf-8'))['version']


def health(expected=None):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8181/api/health', timeout=5) as r:
            payload = json.loads(r.read(4096))
            return payload.get('ok') is True and (expected is None or payload.get('version') == expected)
    except Exception:
        return False


def wait_healthy(version, timeout=65):
    # Após systemctl restart, o socket pode reaparecer antes de a nova versão subir.
    limit = time.monotonic() + timeout
    while time.monotonic() < limit:
        if health(version): return True
        time.sleep(2)
    return False


def health_diagnostics(expected):
    """Informações mínimas e seguras para distinguir falha de API, serviço e versão."""
    result = {'expectedVersion': expected}
    try:
        result['diskVersion'] = read_current()
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        result['diskVersion'] = 'indisponível'
    try:
        with urllib.request.urlopen('http://127.0.0.1:8181/api/health', timeout=4) as response:
            data = json.loads(response.read(4096))
            result['httpStatus'] = response.status
            result['healthVersion'] = str(data.get('version', 'ausente'))[:30]
            result['healthOk'] = data.get('ok') is True
    except Exception as error:
        result['healthErrorType'] = type(error).__name__
    try:
        probe = subprocess.run(['/usr/bin/systemctl', 'is-active', 'alsistemas-vps'], capture_output=True, text=True, timeout=5)
        result['service'] = (probe.stdout or '').strip()[:30] or 'indisponível'
    except (OSError, subprocess.TimeoutExpired):
        result['service'] = 'indisponível'
    return result


def trusted_local_archive(archive):
    if archive.is_symlink() or not archive.is_file():
        return False
    stat_result = archive.stat()
    return stat_result.st_uid == 0 and stat_result.st_nlink == 1 and 512 <= stat_result.st_size <= MAX_ZIP


def local_request():
    # O pedido e o arquivo ficam em diretórios root-only; o navegador não controla caminhos.
    if REQUEST.is_symlink() or not REQUEST.is_file():
        raise RuntimeError('Solicitação de atualização ausente ou insegura')
    req = json.loads(REQUEST.read_text(encoding='utf-8'))
    if set(req) not in ({'id', 'mode'}, {'id', 'mode', 'archive', 'sha256'}):
        raise RuntimeError('Formato de solicitação inválido')
    if not re.fullmatch(r'[0-9a-f]{24}', str(req.get('id', ''))):
        raise RuntimeError('ID da operação inválido')
    if req['mode'] not in ('github', 'file'):
        raise RuntimeError('Origem da atualização inválida')
    if req['mode'] == 'file':
        filename = req.get('archive', '')
        if not re.fullmatch(r'upload-[0-9a-f]{24}\.zip', str(filename)):
            raise RuntimeError('Arquivo de atualização não autorizado')
        if not re.fullmatch(r'[0-9a-f]{64}', str(req.get('sha256', ''))):
            raise RuntimeError('Hash de upload inválido')
    return req


def run_installer(root):
    proc = subprocess.run(['/usr/bin/bash', str(root / 'instalar.sh'), '--allow-existing-host', '--core-upgrade'], cwd=root, capture_output=True, timeout=330)
    if proc.returncode != 0:
        stderr_tail = proc.stderr.decode('utf-8', 'replace')[-1600:]
        error = RuntimeError('Instalador falhou: ' + stderr_tail[-350:])
        error.returncode = proc.returncode
        error.stderr_tail = stderr_tail
        raise error


def restore_core_safely(saved, target):
    """Preparar cópia íntegra antes de trocar o diretório ativo.

    Em falha durante a preparação, mantém `current` intacto. Na falha de
    renomeação, devolve a pasta ativa ao caminho original.
    """
    if saved.is_symlink() or not saved.is_dir() or not (saved / 'src/server.js').is_file():
        raise RuntimeError('Backup anterior incompleto; instalação atual preservada')
    if target.is_symlink() or not target.is_dir():
        raise RuntimeError('Caminho do núcleo ativo não é um diretório seguro')
    staged = target.parent / f'.restore-staged-{os.getpid()}-{int(time.time() * 1000)}'
    failed = target.parent / f'.failed-update-{os.getpid()}-{int(time.time() * 1000)}'
    # Não excluir `target` antes de termos um destino pronto e validado.
    shutil.copytree(saved, staged, symlinks=True)
    if not (staged / 'src/server.js').is_file() or not (staged / 'package.json').is_file():
        raise RuntimeError('Cópia temporária da reversão está incompleta')
    os.rename(target, failed)
    try:
        os.rename(staged, target)
    except Exception:
        os.rename(failed, target)
        raise
    return failed


def apply(request=None):
    if os.geteuid() != 0:
        raise RuntimeError('Execução somente pelo serviço root')
    current = read_current()
    mode = (request or {}).get('mode', 'github')
    repo = None
    archive_name = None
    sha256_prefix = None
    target_version = None
    installed = None
    snapshot = None
    rollback_errors = []
    try:
        with tempfile.TemporaryDirectory(prefix='als-update-', dir=BACKUP) as tmp:
            folder = Path(tmp)
            if mode == 'file':
                filename = request['archive']
                archive_name = filename
                archive = BACKUP / filename
                sha256_prefix = str(request.get('sha256', ''))[:16]
                if not trusted_local_archive(archive):
                    raise RuntimeError('Arquivo de upload inseguro ou com tamanho inválido')
                status('validating', 'Conferindo SHA-256 e estrutura do ZIP enviado', source='file', archive=archive_name, sha256Prefix=sha256_prefix, installedBefore=current)
                if hashlib.sha256(archive.read_bytes()).hexdigest() != request['sha256']:
                    raise RuntimeError('SHA-256 do upload divergiu durante a transferência')
            else:
                cfg = json.loads((DATA / 'updates-config.json').read_text(encoding='utf-8'))
                repo = cfg.get('repo')
                if not isinstance(repo, str) or not REPO_RE.fullmatch(repo) or '..' in repo or repo.endswith('.git'):
                    raise RuntimeError('Repositório não autorizado')
                status('checking', 'Consultando Release do repositório configurado', repo=repo, installedBefore=current)
                release = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases/latest', repo, 1024 * 1024))
                version = str(release.get('tag_name', '')).removeprefix('v')
                if version_tuple(version) <= version_tuple(current):
                    status('up_to_date', 'Nenhuma versão superior à instalada', installed=current, repo=repo)
                    return
                assets = {a.get('name'): a.get('browser_download_url') for a in release.get('assets', []) if isinstance(a, dict)}
                archive_name = f'AL-Sistemas-v{version}-VPS.zip'
                names = [archive_name, 'update-manifest.json']
                if not all(n in assets and safe_url(assets[n], repo, n) for n in names):
                    raise RuntimeError('Release sem assets obrigatórios ou com URL inválida')
                status('downloading', 'Baixando manifesto SHA-256 e ZIP da Release', target=version, repo=repo, archive=archive_name, installedBefore=current)
                manifest = fetch(assets[names[1]], repo, 16384, names[1])
                data = json.loads(manifest)
                if set(data) != {'schema', 'version', 'asset', 'sha256'} or data['schema'] != 1 or data['version'] != version or data['asset'] != archive_name or not re.fullmatch('[0-9a-f]{64}', str(data['sha256'])):
                    raise RuntimeError('Manifesto SHA-256 com informações divergentes')
                sha256_prefix = str(data['sha256'])[:16]
                def progress(percent, received, total):
                    status('downloading', 'Baixando pacote do GitHub', target=version, repo=repo, archive=archive_name,
                           percent=percent, bytesReceived=received, bytesTotal=total, sha256Prefix=sha256_prefix, installedBefore=current)
                zip_bytes = fetch(assets[archive_name], repo, MAX_ZIP, archive_name, progress)
                if hashlib.sha256(zip_bytes).hexdigest() != data['sha256']:
                    raise RuntimeError('SHA-256 do ZIP não confere')
                archive = folder / archive_name
                archive.write_bytes(zip_bytes)
                target_version = version
            status('validating', 'Validando conteúdo, caminhos e versão do ZIP', target=target_version, archive=archive_name, sha256Prefix=sha256_prefix, installedBefore=current)
            with zipfile.ZipFile(archive) as z:
                archive_validate(z)
                unpack = folder / 'unpacked'
                unpack.mkdir()
                z.extractall(unpack)
            for needed in ('instalar.sh', 'vps/src/server.js', 'vps/admin/helper.py', 'vps/package.json', 'vps/admin/updater.py'):
                if not (unpack / needed).is_file():
                    raise RuntimeError('Pacote de atualização incompleto')
            installed = json.loads((unpack / 'vps/package.json').read_text(encoding='utf-8'))['version']
            if target_version is not None and installed != target_version:
                raise RuntimeError('Versão interna divergente')
            if version_tuple(installed) <= version_tuple(current):
                status('up_to_date', 'Arquivo não contém versão superior à instalada', installed=current, target=installed, archive=archive_name)
                return
            if not health():
                raise RuntimeError('Painel não respondeu à verificação inicial')
            status('backup', 'Criando cópia de segurança antes da instalação', target=installed, archive=archive_name, candidateVersion=installed, installedBefore=current)
            snapshot = BACKUP / f'pre-update-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}-{os.getpid()}'
            snapshot.mkdir(mode=0o700)
            shutil.copytree(TARGET, snapshot / 'current', symlinks=True)
            shutil.copytree(DATA, snapshot / 'data', symlinks=True)
            for source, name in ((HELPER, 'helper'), (UNIT, 'service'), (SUDOERS, 'sudoers')):
                shutil.copy2(source, snapshot / name)
            for source, name in ((Path('/usr/local/libexec/alsistemas-updater'), 'updater'),
                                 (Path('/etc/systemd/system/alsistemas-updater.service'), 'updater-service')):
                if source.is_file(): shutil.copy2(source, snapshot / name)
            status('installing', 'Instalando arquivos e reiniciando o serviço', target=installed, archive=archive_name, backupSnapshot=snapshot.name, candidateVersion=installed, installedBefore=current)
            try:
                run_installer(unpack)
                status('verifying', 'Aguardando nova versão responder à verificação de saúde', target=installed, archive=archive_name, backupSnapshot=snapshot.name, candidateVersion=installed, installedBefore=current)
                if read_current() != installed or not wait_healthy(installed):
                    raise RuntimeError('A nova versão não passou na verificação de saúde: ' + json.dumps(health_diagnostics(installed), ensure_ascii=False))
            except Exception as err:
                status('rolling_back', 'Instalação falhou; preparando restauração segura', target=installed, archive=archive_name, backupSnapshot=snapshot.name, candidateVersion=installed, installedBefore=current)
                rollback_errors = []
                try:
                    restore_core_safely(snapshot / 'current', TARGET)
                except Exception as restore_error:
                    rollback_errors.append('código: ' + str(restore_error))
                for dest, name in ((HELPER, 'helper'), (UNIT, 'service'), (SUDOERS, 'sudoers'),
                                   (Path('/usr/local/libexec/alsistemas-updater'), 'updater'),
                                   (Path('/etc/systemd/system/alsistemas-updater.service'), 'updater-service')):
                    if (snapshot / name).is_file():
                        try:
                            shutil.copy2(snapshot / name, dest)
                        except OSError as restore_error:
                            rollback_errors.append(name + ': ' + str(restore_error))
                try:
                    subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], timeout=15, check=True)
                    subprocess.run(['/usr/bin/systemctl', 'restart', 'alsistemas-vps'], timeout=30, check=True)
                    if not wait_healthy(current, timeout=30):
                        rollback_errors.append('versão anterior não respondeu à verificação de saúde')
                except Exception as restore_error:
                    rollback_errors.append('serviço: ' + str(restore_error))
                if rollback_errors:
                    raise RuntimeError('Falha na instalação (' + str(err) + '); reversão não confirmada: ' + '; '.join(rollback_errors)) from err
                raise RuntimeError('Instalação revertida e versão anterior verificada: ' + str(err)) from err
            status('completed', 'Versão instalada e verificada. Atualize a página para carregar a nova interface.',
                   installed=installed, target=installed, archive=archive_name, backupSnapshot=snapshot.name,
                   candidateVersion=installed, percent=100)
    except Exception as err:
        diagnostics = {'installedBefore': current, 'mode': mode, 'errorType': type(err).__name__}
        if target_version is not None:
            diagnostics['target'] = target_version
        if installed is not None:
            diagnostics['candidateVersion'] = installed
        try:
            diagnostics['installed'] = read_current()
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            pass
        if repo:
            diagnostics['repo'] = repo
        if archive_name:
            diagnostics['archive'] = archive_name
        if sha256_prefix:
            diagnostics['sha256Prefix'] = sha256_prefix
        if snapshot is not None:
            diagnostics['backupSnapshot'] = snapshot.name
        if rollback_errors:
            diagnostics['rollbackErrors'] = rollback_errors
        if hasattr(err, 'returncode'):
            diagnostics['installerExitCode'] = err.returncode
        if hasattr(err, 'stderr_tail'):
            diagnostics['installerStderrTail'] = err.stderr_tail
        diagnostics['healthDiagnostics'] = health_diagnostics(installed or current)
        status('failed', str(err)[:350], **diagnostics)
        raise


def main():
    try:
        BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
        global OPERATION_ID, OPERATION_MODE
        request = local_request() if REQUEST.exists() else None
        if request:
            OPERATION_ID, OPERATION_MODE = request['id'], request['mode']
        apply(request)
    except Exception as err:
        try:
            current_status = json.loads((DATA / 'update-status.json').read_text(encoding='utf-8')) if (DATA / 'update-status.json').exists() else {}
        except (OSError, ValueError, json.JSONDecodeError):
            current_status = {}
        if current_status.get('stage') != 'failed':
            status('failed', str(err)[:350], errorType=type(err).__name__)
        print(str(err), file=sys.stderr)
        sys.exit(1)
    finally:
        # O pedido só existe enquanto é consumido; nunca repetir upload automaticamente.
        if REQUEST.exists():
            try:
                req = local_request()
                if req['mode'] == 'file':
                    (BACKUP / req['archive']).unlink(missing_ok=True)
                REQUEST.unlink(missing_ok=True)
            except (RuntimeError, OSError, ValueError):
                pass


if __name__ == '__main__':
    main()
