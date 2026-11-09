#!/usr/bin/env bash
# Gera apenas assets públicos de uma Release; chave privada nunca é copiada.
# Uso: ./tools/assinar-release.sh CHAVE_PRIVADA.pem AL-Sistemas-vX.Y.Z-VPS.zip [DIRETORIO_SAIDA]
set -Eeuo pipefail
umask 077
[[ $# -ge 2 && $# -le 3 ]] || { echo 'Uso: assinar-release.sh CHAVE_PRIVADA.pem AL-Sistemas-vX.Y.Z-VPS.zip [DIR_SAIDA]' >&2; exit 2; }
[[ -f "$1" && ! -L "$1" && -f "$2" && ! -L "$2" ]] || { echo 'Chave/ZIP inexistente ou link simbólico recusado' >&2; exit 2; }
key="$(realpath -- "$1")"
zip="$(realpath -- "$2")"
archive="$(basename -- "$zip")"
[[ "$archive" =~ ^AL-Sistemas-v([0-9]+\.[0-9]+\.[0-9]+)-VPS\.zip$ ]] || { echo 'Nome do pacote inválido' >&2; exit 2; }
version="${BASH_REMATCH[1]}"
# Evita assinar um ZIP com versionamento divergente ou caminhos perigosos.
python3 - "$zip" "$version" <<'PY'
import json, sys, zipfile
from pathlib import Path
zip_path, version = sys.argv[1:]
with zipfile.ZipFile(zip_path) as z:
    if len(z.infolist()) > 1800: raise SystemExit('ZIP com mais de 1800 entradas')
    total = 0
    for i in z.infolist():
        name = i.filename
        if not name or name.startswith('/') or '\\' in name or ':' in name or any(x in ('.','..','') for x in name.rstrip('/').split('/')):
            raise SystemExit('ZIP contém caminho inseguro')
        mode = (i.external_attr >> 16) & 0o170000
        if mode not in (0, 0o100000, 0o040000): raise SystemExit('ZIP contém link ou arquivo especial')
        total += i.file_size
        if total > 120*1024*1024: raise SystemExit('ZIP extraído excede 120 MiB')
    pkg = json.loads(z.read('vps/package.json'))
    if pkg.get('version') != version: raise SystemExit('Versão interna do ZIP não coincide com nome')
if Path(zip_path).stat().st_size > 32*1024*1024: raise SystemExit('ZIP excede 32 MiB')
PY
if ! openssl pkey -in "$key" -noout -text 2>/dev/null | grep -q 'ED25519'; then
  echo 'A chave precisa ser Ed25519 PEM privada' >&2; exit 2
fi
out="${3:-$(dirname -- "$zip")/assets-release-$version}"
[[ ! -L "$out" ]] || { echo 'Destino é link simbólico' >&2; exit 2; }
mkdir -p -- "$out"
out="$(realpath -- "$out")"
[[ "$out" != "$(dirname "$key")" ]] || { echo 'Não coloque assets no diretório da chave privada.' >&2; exit 2; }
[[ "$out/$archive" != "$zip" ]] && cp -- "$zip" "$out/$archive"
sha="$(sha256sum -- "$zip" | awk '{print $1}')"
printf '{"schema":1,"version":"%s","asset":"%s","sha256":"%s"}\n' "$version" "$archive" "$sha" > "$out/update-manifest.json"
openssl pkeyutl -sign -inkey "$key" -rawin -in "$out/update-manifest.json" -out "$out/update-manifest.json.sig"
pub="$(mktemp)"
trap 'rm -f "$pub"' EXIT
openssl pkey -in "$key" -pubout -out "$pub" >/dev/null 2>&1
openssl pkeyutl -verify -pubin -inkey "$pub" -rawin -in "$out/update-manifest.json" -sigfile "$out/update-manifest.json.sig" >/dev/null
echo "Release v$version preparada e assinada: $out"
echo 'Publique exatamente o ZIP, update-manifest.json e update-manifest.json.sig.'
echo 'Nunca publique a chave privada.'
