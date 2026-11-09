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


def status(stage, message, **extra):
    data = {'stage': stage, 'message': message, 'time': datetime.now(timezone.utc).isoformat(), **extra}
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


def fetch(url, repo, limit, asset=None):
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
        payload = res.read(limit + 1)
        if len(payload) > limit:
            raise RuntimeError('Arquivo excede limite de tamanho')
        return payload


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


def health():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8181/api/health', timeout=5) as r:
            return json.loads(r.read(4096)).get('ok') is True
    except Exception:
        return False


def run_installer(root):
    proc = subprocess.run(['/usr/bin/bash', str(root / 'instalar.sh'), '--allow-existing-host'], cwd=root, capture_output=True, timeout=330)
    if proc.returncode != 0:
        raise RuntimeError('Instalador falhou: ' + proc.stderr.decode('utf-8', 'replace')[-350:])


def apply():
    if os.geteuid() != 0:
        raise RuntimeError('Execução somente pelo serviço root')
    cfg = json.loads((DATA / 'updates-config.json').read_text(encoding='utf-8'))
    repo = cfg.get('repo')
    if not isinstance(repo, str) or not REPO_RE.fullmatch(repo) or '..' in repo or repo.endswith('.git'):
        raise RuntimeError('Repositório não autorizado')
    current = read_current()
    status('checking', 'Consultando Release do repositório configurado')
    release = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases/latest', repo, 1024 * 1024))
    version = str(release.get('tag_name', '')).removeprefix('v')
    if version_tuple(version) <= version_tuple(current):
        status('up_to_date', 'Nenhuma versão superior à instalada', installed=current)
        return
    assets = {a.get('name'): a.get('browser_download_url') for a in release.get('assets', []) if isinstance(a, dict)}
    archive_name = f'AL-Sistemas-v{version}-VPS.zip'
    names = [archive_name, 'update-manifest.json']
    if not all(n in assets and safe_url(assets[n], repo, n) for n in names):
        raise RuntimeError('Release sem assets obrigatórios ou com URL inválida')
    status('downloading', 'Baixando manifesto SHA-256 e ZIP da Release', target=version)
    manifest = fetch(assets[names[1]], repo, 16384, names[1])
    with tempfile.TemporaryDirectory(prefix='als-update-', dir=BACKUP) as tmp:
        folder = Path(tmp)
        data = json.loads(manifest)
        if set(data) != {'schema', 'version', 'asset', 'sha256'} or data['schema'] != 1 or data['version'] != version or data['asset'] != archive_name or not re.fullmatch('[0-9a-f]{64}', str(data['sha256'])):
            raise RuntimeError('Manifesto SHA-256 com informações divergentes')
        zip_bytes = fetch(assets[archive_name], repo, MAX_ZIP, archive_name)
        if hashlib.sha256(zip_bytes).hexdigest() != data['sha256']:
            raise RuntimeError('SHA-256 do ZIP não confere')
        archive = folder / archive_name
        archive.write_bytes(zip_bytes)
        status('validating', 'Validando estrutura, arquivos e versão do pacote', target=version)
        with zipfile.ZipFile(archive) as z:
            archive_validate(z)
            unpack = folder / 'unpacked'
            unpack.mkdir()
            z.extractall(unpack)
        for needed in ('instalar.sh', 'vps/src/server.js', 'vps/admin/helper.py', 'vps/package.json'):
            if not (unpack / needed).is_file():
                raise RuntimeError('Pacote de atualização incompleto')
        installed = json.loads((unpack / 'vps/package.json').read_text(encoding='utf-8'))['version']
        if installed != version:
            raise RuntimeError('Versão interna divergente')
        if not health():
            raise RuntimeError('Painel não respondeu à verificação inicial')
        snapshot = BACKUP / f'pre-update-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}'
        snapshot.mkdir(mode=0o700)
        shutil.copytree(TARGET, snapshot / 'current', symlinks=True)
        # Backup separado dos dados administrativos antes da operação.
        # É cópia de segurança, não é revertida automaticamente em caso de falha.
        shutil.copytree(DATA, snapshot / 'data', symlinks=True)
        for source, name in ((HELPER, 'helper'), (UNIT, 'service'), (SUDOERS, 'sudoers')):
            shutil.copy2(source, snapshot / name)
        status('installing', 'Aplicando nova versão (a interface pode desconectar)', target=version)
        try:
            run_installer(unpack)
            if read_current() != version or not health():
                raise RuntimeError('A nova versão não passou na verificação de saúde')
        except Exception as err:
            status('rolling_back', 'Instalação falhou; restaurando código e serviço', target=version)
            shutil.rmtree(TARGET)
            shutil.copytree(snapshot / 'current', TARGET, symlinks=True)
            for dest, name in ((HELPER, 'helper'), (UNIT, 'service'), (SUDOERS, 'sudoers')):
                shutil.copy2(snapshot / name, dest)
            subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], timeout=15, check=True)
            subprocess.run(['/usr/bin/systemctl', 'restart', 'alsistemas-vps'], timeout=30, check=True)
            raise RuntimeError('Instalação revertida: ' + str(err)) from err
        status('completed', 'Nova versão instalada. Sessões podem precisar de novo login.', installed=version)


def main():
    try:
        BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
        apply()
    except Exception as err:
        status('failed', str(err)[:350])
        print(str(err), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
