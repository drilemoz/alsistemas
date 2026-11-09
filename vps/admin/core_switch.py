#!/usr/bin/python3
"""Troca controlada do núcleo do AL Sistemas.

Somente instalador local executado como root chama este script. Dados e sites
hospedados não fazem parte das pastas substituídas.
"""
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import uuid
from pathlib import Path


def _dir_regular(path):
    if path.is_symlink() or (path.exists() and not path.is_dir()):
        raise RuntimeError(f'Caminho de instalação inseguro: {path}')


def _contents_ok(folder):
    for required in ('src/server.js', 'public/index.html', 'public/app.js', 'package.json'):
        dest = folder / required
        if dest.is_symlink() or not dest.is_file():
            raise RuntimeError(f'Núcleo incompleto: {required}')
    pkg = json.loads((folder / 'package.json').read_text(encoding='utf-8'))
    version = pkg.get('version')
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise RuntimeError('Versão interna inválida')
    return version


def stage_core(source, install_root, tutorial=None):
    source = Path(source)
    install_root = Path(install_root)
    _dir_regular(install_root)
    install_root.mkdir(mode=0o755, parents=True, exist_ok=True)
    if install_root.is_symlink():
        raise RuntimeError('Instalação não pode ser link simbólico')
    tmp = Path(tempfile.mkdtemp(prefix='.stage-core-', dir=install_root))
    try:
        for segment in ('src', 'public'):
            shutil.copytree(source / segment, tmp / segment, symlinks=False)
        shutil.copyfile(source / 'package.json', tmp / 'package.json')
        if tutorial is not None and Path(tutorial).is_file():
            shutil.copyfile(tutorial, tmp / 'public' / 'tutorial-instalacao.html')
        _contents_ok(tmp)
        for current, dirs, files in os.walk(tmp, followlinks=False):
            for name in dirs:
                dest = Path(current) / name
                if dest.is_symlink():
                    raise RuntimeError('Link simbólico inesperado no estágio')
                dest.chmod(0o755)
            for name in files:
                dest = Path(current) / name
                if dest.is_symlink() or not stat.S_ISREG(dest.stat().st_mode):
                    raise RuntimeError('Arquivo especial inesperado no estágio')
                dest.chmod(0o644)
        tmp.chmod(0o755)
        return tmp
    except Exception:
        shutil.rmtree(tmp)
        raise


def activate_core(stage, current):
    stage, current = Path(stage), Path(current)
    parent = current.parent
    if stage.parent != parent or not stage.name.startswith('.stage-core-'):
        raise RuntimeError('Pasta de estágio fora do destino autorizado')
    _dir_regular(current)
    _contents_ok(stage)
    previous = parent / f'.previous-core-{uuid.uuid4().hex}'
    had_current = current.exists()
    if had_current:
        os.rename(current, previous)
    try:
        os.rename(stage, current)
    except Exception:
        if had_current:
            os.rename(previous, current)
        raise
    return previous if had_current else None


def restore_core(current, previous):
    current, previous = Path(current), Path(previous)
    if previous.parent != current.parent or not previous.name.startswith('.previous-core-'):
        raise RuntimeError('Caminho de reversão não autorizado')
    _dir_regular(previous)
    if not previous.is_dir():
        raise RuntimeError('Cópia anterior indisponível; versão atual preservada')
    failed = current.parent / f'.failed-core-{uuid.uuid4().hex}'
    if current.is_symlink() or not current.is_dir():
        raise RuntimeError('Instalação ativa inconsistente; reversão manual necessária')
    os.rename(current, failed)
    try:
        os.rename(previous, current)
    except Exception:
        os.rename(failed, current)
        raise
    return failed


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Somente root pode substituir o núcleo instalado')
    cmd, *args = sys.argv[1:]
    if cmd == 'stage' and len(args) == 3:
        print(stage_core(*args))
    elif cmd == 'activate' and len(args) == 2:
        print(activate_core(*args) or '-')
    elif cmd == 'restore' and len(args) == 2:
        print(restore_core(*args))
    else:
        raise RuntimeError('Operação de implantação inválida')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Erro na substituição do núcleo: {exc}', file=sys.stderr)
        sys.exit(1)
