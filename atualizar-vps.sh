#!/usr/bin/env bash
# Atualização manual do núcleo AL Sistemas VPS (SSH/Termux), sem passar pelo painel.
# Uso: sudo bash atualizar-vps.sh /caminho/AL-Sistemas-vX.Y.Z-VPS.zip
# Faça um snapshot EBS antes. O instalador mantém o backup do código e restaura
# o núcleo anterior se a nova versão falhar; este script confere a saúde no fim.
set -Eeuo pipefail
fail() { echo "ERRO: $*" >&2; exit 1; }
ZIP="${1:-}"
[[ $EUID -eq 0 ]] || fail 'execute com sudo.'
[[ -n "$ZIP" && -f "$ZIP" && ! -L "$ZIP" ]] || fail 'uso: sudo bash atualizar-vps.sh /caminho/AL-Sistemas-vX.Y.Z-VPS.zip'
size="$(stat -c %s "$ZIP")"
(( size >= 512 && size <= 33554432 )) || fail 'o ZIP precisa ter entre 512 bytes e 32 MiB.'
unzip -tq "$ZIP" >/dev/null || fail 'ZIP corrompido.'
if unzip -Z1 "$ZIP" | grep -Eq '(^/|(^|/)\.\.(/|$)|\\|:)'; then fail 'caminho inseguro dentro do ZIP.'; fi
install -d -m 0700 /var/backups/alsistemas
WORK="$(mktemp -d /var/backups/alsistemas/manual-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
unzip -q "$ZIP" -d "$WORK"
for needed in instalar.sh vps/src/server.js vps/admin/helper.py vps/admin/updater.py vps/package.json; do
  [[ -f "$WORK/$needed" ]] || fail "pacote incompleto: falta $needed"
done
version_of() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$1"; }
NEW="$(version_of "$WORK/vps/package.json")"
OLD="$(version_of /opt/alsistemas-vps/current/package.json 2>/dev/null || echo 0.0.0)"
python3 - "$OLD" "$NEW" <<'PY' || fail "a versão $NEW não é superior à instalada ($OLD)."
import re, sys
old, new = sys.argv[1:3]
ok = all(re.fullmatch(r'\d+\.\d+\.\d+', v) for v in (old, new))
sys.exit(0 if ok and tuple(map(int, new.split('.'))) > tuple(map(int, old.split('.'))) else 1)
PY
echo "Atualizando $OLD -> $NEW ..."
( cd "$WORK" && bash instalar.sh --allow-existing-host --core-upgrade )
python3 - "$NEW" <<'PY' || fail 'o painel não respondeu como saudável na versão esperada; veja: journalctl -u alsistemas-vps -n 80'
import json, sys, time, urllib.request
deadline = time.monotonic() + 65
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen('http://127.0.0.1:8181/api/health', timeout=3) as r:
            data = json.loads(r.read(4096))
            if data.get('ok') is True and data.get('version') == sys.argv[1]:
                sys.exit(0)
    except Exception:
        pass
    time.sleep(2)
sys.exit(1)
PY
echo "Concluído: AL Sistemas VPS $NEW ativo. Atualize a página do painel (pode pedir novo login)."
