#!/usr/bin/env bash
# AL Sistemas VPS 2.0.9 — envio e instalação assistidos a partir do Termux.
# Nunca desabilita verificação da chave do host SSH nem publica a porta 8181.
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ZIP="$HOME/storage/downloads/AL-Sistemas-v2.0.9-VPS.zip"
HOST='' USER_NAME='ubuntu' KEY='' PORT='22'
SERVER_ARGS=() AUTO_YES=0
usage() {
  cat <<'HELP'
Uso: bash inicio-termux.sh --host IP_OU_DOMINIO [opções]
  --zip CAMINHO           ZIP completo (padrão: Downloads/AL-Sistemas-v2.0.9-VPS.zip)
  --key CAMINHO           chave SSH privada guardada no Termux
  --user USUARIO          usuário SSH (padrão: ubuntu)
  --ssh-port PORTA        porta do SSH (padrão: 22)
  --existing              permitir instalação em host com sites já existentes
  --with-php              instalar PHP-FPM 8.3
  --with-mariadb          instalar MariaDB
  --domain DOMINIO        junto com --email, instalar HTTPS
  --email ENDERECO        junto com --domain
  --enable-ufw            habilitar UFW após configurar regras
  --yes                   não pedir confirmação após --plan (uso consciente)

O script envia o ZIP e bootstrap-vps.sh, imprime o plano sem alterações e
só executa sudo instalar.sh após confirmação (ou --yes explícito).
HELP
}
while (($#)); do
  case "$1" in
    --host) HOST="${2:?Informe host}"; shift 2 ;;
    --zip) ZIP="${2:?Informe ZIP}"; shift 2 ;;
    --key) KEY="${2:?Informe chave}"; shift 2 ;;
    --user) USER_NAME="${2:?Informe usuário}"; shift 2 ;;
    --ssh-port) PORT="${2:?Informe porta}"; shift 2 ;;
    --existing) SERVER_ARGS+=(--allow-existing-host); shift ;;
    --with-php|--with-mariadb|--enable-ufw) SERVER_ARGS+=("$1"); shift ;;
    --domain|--email) SERVER_ARGS+=("$1" "${2:?Informe valor}"); shift 2 ;;
    --yes) AUTO_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ && "$HOST" != *..* ]] || { echo 'Host obrigatório/inválido.' >&2; exit 2; }
[[ "$USER_NAME" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || { echo 'Usuário SSH inválido.' >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT >= 1 && 10#$PORT <= 65535)) || { echo 'Porta SSH inválida.' >&2; exit 2; }
[[ -f "$ZIP" && ! -L "$ZIP" ]] || { echo "ZIP não encontrado: $ZIP" >&2; exit 1; }
NAME="${ZIP##*/}"
[[ "$NAME" =~ ^AL-Sistemas-v[0-9]+\.[0-9]+\.[0-9]+-VPS\.zip$ ]] || { echo 'Nome de ZIP inesperado.' >&2; exit 2; }
[[ -f "$ROOT/bootstrap-vps.sh" ]] || { echo 'bootstrap-vps.sh ausente: extraia o ZIP inteiro no Termux.' >&2; exit 1; }
if [[ -n "$KEY" ]]; then
  [[ -f "$KEY" && ! -L "$KEY" ]] || { echo 'Chave SSH ausente ou link simbólico.' >&2; exit 1; }
fi
# A extração e o CRC são validados no Ubuntu antes de qualquer sudo.
# O Termux precisa apenas de openssh e unzip para extrair estes scripts do ZIP.
echo '[AL Sistemas] Iniciando transferência por SCP; o pacote será validado na VPS.'
SCP_OPTS=(-P "$PORT")
SSH_OPTS=(-p "$PORT")
if [[ -n "$KEY" ]]; then SCP_OPTS+=(-i "$KEY"); SSH_OPTS+=(-i "$KEY"); fi
TARGET="$USER_NAME@$HOST"
scp "${SCP_OPTS[@]}" -- "$ZIP" "$ROOT/bootstrap-vps.sh" "$TARGET:~/"
# Apenas argumentos validados são incorporados; printf %q protege a linha remota.
REMOTE=("$NAME" "${SERVER_ARGS[@]}")
if ((AUTO_YES)); then REMOTE+=(--yes); fi
printf -v QUOTED '%q ' "${REMOTE[@]}"
echo '[AL Sistemas] SSH será usado para diagnóstico e instalação.'
ssh -tt "${SSH_OPTS[@]}" "$TARGET" "bash ~/bootstrap-vps.sh $QUOTED"
