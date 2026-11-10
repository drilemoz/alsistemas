#!/usr/bin/python3
"""Worker isolado: atualizações de código do IguatamaOnline (não toca bancos/uploads)."""
import hashlib
import json
import os
import pwd
import re
import shutil
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from project_maintenance import (
    PROJECT_NAME, BACKUP_ROOT, MAX_ARCHIVE, ProjectError, backup_list,
    deploy_archive, validate_archive, private_backup_root,
)

REQUEST = Path('/run/alsistemas-vps/project-request.json')
STATUS = Path('/var/lib/alsistemas/project-update-status.json')
ALLOWED_HOSTS = {'github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}


def status(op_id, stage, message, percent=None, **extra):
    obj = {'operationId': op_id, 'project': PROJECT_NAME, 'stage': stage,
           'message': message, 'updatedAt': datetime.now(timezone.utc).isoformat(), **extra}
    if percent is not None:
        obj['percent'] = max(0, min(100, int(percent)))
    out = STATUS.with_name('.project-status-' + op_id + '.tmp')
    fd = os.open(out, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf8') as stream:
        json.dump(obj, stream, ensure_ascii=False)
        stream.flush(); os.fsync(stream.fileno())
        als = pwd.getpwnam('alsistemas')
        os.fchown(stream.fileno(), als.pw_uid, als.pw_gid)
    os.replace(out, STATUS)


class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(newurl)
        if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password:
            raise ProjectError('Redirecionamento de download fora dos domínios permitidos.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def github_download(repo, destination, op_id):
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,60}/[A-Za-z0-9_.-]{1,80}', repo) or '..' in repo:
        raise ProjectError('Repositório GitHub inválido.')
    opener = urllib.request.build_opener(RestrictedRedirect())
    request = urllib.request.Request('https://api.github.com/repos/' + repo + '/releases/latest',
                                     headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'AL-Sistemas-Project-Updater'})
    with opener.open(request, timeout=20) as response:
        payload = response.read(300000)
        if response.read(1):
            raise ProjectError('Release GitHub possui metadados excessivos.')
    info = json.loads(payload)
    if info.get('draft') or info.get('prerelease'):
        raise ProjectError('Release não publicada ou de pré-lançamento.')
    assets = [x for x in info.get('assets', []) if isinstance(x, dict) and
              isinstance(x.get('name'), str) and x['name'].lower().endswith('.zip') and
              isinstance(x.get('browser_download_url'), str) and 512 <= x.get('size', 0) <= MAX_ARCHIVE]
    if len(assets) != 1:
        raise ProjectError('Release deve ter exatamente um ZIP permitido (512 B a 32 MiB).')
    asset = assets[0]
    link = urlparse(asset['browser_download_url'])
    if link.scheme != 'https' or link.hostname != 'github.com' or link.username or link.password:
        raise ProjectError('Link da Release não é do GitHub oficial.')
    request = urllib.request.Request(asset['browser_download_url'], headers={'User-Agent': 'AL-Sistemas-Project-Update'})
    read = 0
    with opener.open(request, timeout=45) as response, open(destination, 'xb') as output:
        while True:
            chunk = response.read(131072)
            if not chunk: break
            read += len(chunk)
            if read > MAX_ARCHIVE:
                raise ProjectError('Download da Release excedeu 32 MiB.')
            output.write(chunk)
            status(op_id, 'downloading', 'Baixando pacote da Release', int(read * 100 / asset['size']))
    if read != asset['size']:
        raise ProjectError('Tamanho baixado não corresponde à Release.')
    return {'release': str(info.get('tag_name') or '')[:60], 'repo': repo}


def main():
    if os.geteuid() != 0:
        raise ProjectError('Worker requer execução root pelo systemd.')
    if REQUEST.is_symlink() or not REQUEST.is_file() or REQUEST.stat().st_uid != 0 or REQUEST.stat().st_mode & 0o077:
        raise ProjectError('Solicitação não confiável.')
    req = json.loads(REQUEST.read_text(encoding='utf8'))
    REQUEST.unlink()
    op_id = req.get('id')
    if not isinstance(op_id, str) or not re.fullmatch(r'[0-9a-f]{24}', op_id) or req.get('name') != PROJECT_NAME:
        raise ProjectError('Solicitação inválida.')
    archive = None
    details = {}
    preview = None
    requested_mode = req.get('mode')
    requested_archive = req.get('archive') if isinstance(req.get('archive'), str) else None
    requested_sha = str(req.get('sha256') or '')[:16]
    try:
        private_backup_root(BACKUP_ROOT)
        status(op_id, 'validating', 'Validando solicitação', mode=requested_mode, archive=requested_archive, sha256Prefix=requested_sha)
        if requested_mode == 'file':
            filename = req.get('archive')
            if not isinstance(filename, str) or not re.fullmatch(r'project-upload-[0-9a-f]{24}\.zip', filename):
                raise ProjectError('Arquivo de entrada inválido.')
            archive = BACKUP_ROOT / filename
            if archive.is_symlink() or not archive.is_file() or archive.stat().st_uid != 0 or archive.stat().st_mode & 0o077:
                raise ProjectError('ZIP recebido não é confiável.')
            with archive.open('rb') as content:
                actual_hash = hashlib.file_digest(content, 'sha256').hexdigest()
            if actual_hash != req.get('sha256'):
                raise ProjectError('SHA-256 do upload não corresponde à solicitação.')
        elif requested_mode == 'github':
            archive = BACKUP_ROOT / ('project-upload-' + op_id + '.zip')
            status(op_id, 'downloading', 'Consultando Release do GitHub', mode=requested_mode, repo=req.get('repo'))
            details = github_download(req.get('repo'), archive, op_id)
        else:
            raise ProjectError('Modo de atualização inválido.')
        status(op_id, 'validating', 'Validando caminhos, arquivos e versão do ZIP', mode=requested_mode, archive=archive.name if archive else requested_archive, repo=details.get('repo'))
        preview = validate_archive(archive)
        status(op_id, 'backup', 'Preparando backup do código alterado', version=preview['version'], mode=requested_mode, archive=archive.name if archive else requested_archive, repo=details.get('repo'))
        installed = deploy_archive(archive, update_status=lambda stage, message: status(op_id, stage, message, version=preview['version'], mode=requested_mode, archive=archive.name if archive else requested_archive, repo=details.get('repo')))
        status(op_id, 'complete', 'Atualização concluída e arquivos verificados', percent=100, result=installed, version=preview['version'], mode=requested_mode, archive=archive.name if archive else requested_archive, **details)
    except Exception as exc:
        status(op_id, 'failed', 'Falha na atualização: ' + str(exc)[:210], mode=requested_mode, repo=details.get('repo') or req.get('repo'), archive=archive.name if archive else requested_archive, sha256Prefix=requested_sha, version=preview['version'] if preview else None, errorType=type(exc).__name__)
        raise
    finally:
        if archive is not None and archive.name.startswith('project-upload-'):
            archive.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Falha na atualização do projeto:', str(exc)[:240], file=sys.stderr)
        sys.exit(1)
