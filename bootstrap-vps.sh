#!/usr/bin/env bash
# Bootstrap remoto do AL Sistemas. Executado no Ubuntu via SSH após cópia do ZIP.
set -Eeuo pipefail
umask 077
[[ $# -ge 1 ]] || { echo 'Nome do ZIP obrigatório.' >&2; exit 2; }
ZIP_NAME="$1"; shift
[[ "$ZIP_NAME" =~ ^AL-Sistemas-v[0-9]+\.[0-9]+\.[0-9]+-VPS\.zip$ ]] || { echo 'ZIP inválido.' >&2; exit 2; }
FLAGS=() YES=0
while (($#)); do
 case "$1" in
   --yes) YES=1; shift ;;
   --allow-existing-host|--with-php|--with-mariadb|--enable-ufw) FLAGS+=("$1"); shift ;;
   --domain|--email)
     [[ $# -ge 2 ]] || { echo 'Faltou argumento para opção.' >&2; exit 2; }
     FLAGS+=("$1" "$2"); shift 2 ;;
   *) echo "Argumento não permitido: $1" >&2; exit 2 ;;
 esac
done
command -v python3 >/dev/null || { echo 'Python 3 ausente; instale python3 antes.' >&2; exit 1; }
DIR="$(mktemp -d "$HOME/al-sistemas-release.XXXXXXXX")"
python3 - "$HOME/$ZIP_NAME" "$DIR" <<'PY'
import sys,zipfile,pathlib,stat
archive_path,out=sys.argv[1:]
with zipfile.ZipFile(archive_path) as archive:
    names=set()
    for info in archive.infolist():
        p=pathlib.PurePosixPath(info.filename)
        if p.is_absolute() or '..' in p.parts or '\\' in info.filename or not p.parts: raise SystemExit('Caminho inseguro no ZIP')
        mode=info.external_attr >> 16
        if stat.S_ISLNK(mode): raise SystemExit('Link simbólico no pacote: '+info.filename)
        if info.filename in names: raise SystemExit('Entrada duplicada no ZIP')
        names.add(info.filename)
    if not {'instalar.sh','vps/src/server.js','vps/admin/helper.py'}.issubset(names): raise SystemExit('Pacote incompleto')
    if archive.testzip() is not None: raise SystemExit('Erro de CRC no ZIP')
    archive.extractall(out)
PY
cd "$DIR"
echo "[AL Sistemas] Pacote extraído em: $DIR"
bash instalar.sh --plan "${FLAGS[@]}"
if (( !YES )); then
  echo
  read -r -p 'Executar instalação com sudo nesta VPS? [s/N] ' REPLY
  [[ "$REPLY" == 's' || "$REPLY" == 'S' ]] || { echo 'Instalação cancelada sem alterações no servidor.'; exit 0; }
fi
sudo bash instalar.sh "${FLAGS[@]}"
echo
printf '%s\n' '[AL Sistemas] Instalação finalizada. Se não configurou domínio, acesse por túnel SSH (na sessão local do Termux):'
printf '%s\n' 'ssh -N -L 8181:127.0.0.1:8181 usuario@IP_DA_VPS'
printf '%s\n' 'Chrome: http://localhost:8181'
