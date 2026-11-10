#!/usr/bin/env bash
# AL Sistemas VPS 2.0.28: instalador Ubuntu 24.04 (uma VPS, sem multisservidor)
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
umask 027
BASE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN='' EMAIL='' PHP=0 MARIADB=0 UFW=0 PLAN=0 EXISTING=0 CORE_UPGRADE=0
while (($#)); do
  case "$1" in
    --domain) DOMAIN="${2:?Informe domínio}"; shift 2 ;;
    --email) EMAIL="${2:?Informe email}"; shift 2 ;;
    --with-php) PHP=1; shift ;;
    --with-mariadb) MARIADB=1; shift ;;
    --enable-ufw) UFW=1; shift ;;
    --allow-existing-host) EXISTING=1; shift ;;
    --core-upgrade) CORE_UPGRADE=1; shift ;;
    --plan) PLAN=1; shift ;;
    -h|--help) cat <<'HELP'
Uso: sudo ./instalar.sh [opções]
  --plan                   mostra verificação sem alterar o sistema
  --domain DOMINIO         requer --email, habilita HTTPS via Certbot
  --email EMAIL            e-mail para Let's Encrypt
  --with-php               instala PHP 8.3-FPM (opcional)
  --with-mariadb           instala MariaDB (opcional)
  --enable-ufw             habilita firewall somente após liberar SSH/HTTP/HTTPS
  --allow-existing-host    requer confirmação explícita em VPS com sites existentes
  --core-upgrade           atualização do painel já instalado, sem apt-get (uso do atualizador)
HELP
      exit 0;;
    *) echo "Opção não reconhecida: $1" >&2; exit 2;;
  esac
done
log(){ printf '\n[AL Sistemas] %s\n' "$*"; }
fail(){ echo "ERRO: $*" >&2; exit 1; }
[[ -f /etc/os-release ]] || fail 'Sistema operacional não detectado.'
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == 'ubuntu' && "${VERSION_ID:-}" == '24.04' ]] || fail 'Suporte inicialmente limitado ao Ubuntu 24.04 LTS.'
ARCH="$(dpkg --print-architecture)"
[[ "$ARCH" == 'amd64' || "$ARCH" == 'arm64' ]] || fail "Arquitetura não testada: $ARCH"
if (( CORE_UPGRADE )); then
  (( EXISTING )) || fail '--core-upgrade exige --allow-existing-host.'
  (( ! PHP && ! MARIADB && ! UFW )) || fail '--core-upgrade não aceita novos pacotes ou firewall.'
  [[ -z "$DOMAIN" && -z "$EMAIL" ]] || fail '--core-upgrade não configura HTTPS.'
fi
if [[ -n "$DOMAIN" || -n "$EMAIL" ]]; then
  [[ -n "$DOMAIN" && -n "$EMAIL" ]] || fail '--domain e --email devem ser usados juntos.'
  [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$ ]] || fail 'Domínio inválido.'
  [[ "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || fail 'E-mail inválido.'
fi
CPUS="$(nproc)"; MEM="$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)"; DISK="$(df -Pk / | awk 'NR==2 {print int($4/1024)}')"
log "Detectado $PRETTY_NAME, $ARCH, ${CPUS} CPU, RAM ${MEM} MiB, disco livre ${DISK} MiB"
((MEM >= 768)) || log 'AVISO: RAM abaixo de 768 MiB pode causar lentidão.'
((DISK >= 4096)) || log 'AVISO: menos de 4 GiB livres; instalação pode falhar.'
log 'Portas em escuta:'
command -v ss >/dev/null && ss -lnt '( sport = :22 or sport = :80 or sport = :443 or sport = :8181 )' || true
if ((PLAN)); then
  log "PLANO: Node.js >=22, Nginx, atualização do núcleo=$CORE_UPGRADE, PHP=$PHP, MariaDB=$MARIADB, UFW=$UFW, domínio=${DOMAIN:-nenhum}; sem alterações."
  exit 0
fi
((EUID == 0)) || fail 'Execute como root com sudo.'
((DISK >= 1024)) || fail 'Menos de 1 GiB de disco livre; instalação recusada por segurança.'
[[ -f "$BASE/vps/src/server.js" && -f "$BASE/vps/admin/helper.py" ]] || fail 'Pacote incompleto: pasta vps ausente.'
if [[ -d /var/www/projetos/iguatamaonline || -d /var/www/iguatama-teste ]]; then
  ((EXISTING)) || fail 'Sites preexistentes detectados. Faça backup e use --allow-existing-host após revisão das alterações previstas com --plan.'
  log 'Hospedagem existente detectada: nenhum dos dois sites protegidos será alterado.'
fi
log 'Instalando somente componentes necessários.'
if (( CORE_UPGRADE )); then
  command -v nginx >/dev/null && command -v python3 >/dev/null && command -v sudo >/dev/null && [[ -x /usr/bin/node ]] || fail 'Dependências do painel ausentes; use instalação completa.'
  /usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22) process.exit(1)' || fail 'Node.js >=22 necessário.'
else
apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx python3 sudo openssl unzip
node_major=0
if [[ -x /usr/bin/node ]]; then node_major="$(/usr/bin/node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; fi
if ((node_major < 22)); then
  log 'Adicionando repositório NodeSource com chave e signed-by; Node.js 24.'
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  chmod 0644 /usr/share/keyrings/nodesource.gpg
  cat > /etc/apt/sources.list.d/alsistemas-nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_24.x
Suites: nodistro
Components: main
Architectures: $ARCH
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF
  apt-get update -y
  apt-get install -y nodejs
fi
/usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22) process.exit(1)' || fail 'Node.js >=22 necessário.'
if ((PHP)); then apt-get install -y php8.3-fpm php8.3-cli php8.3-mbstring php8.3-xml php8.3-mysql php8.3-curl; systemctl enable --now php8.3-fpm; fi
if ((MARIADB)); then apt-get install -y mariadb-server; systemctl enable --now mariadb; fi
systemctl enable --now nginx
fi # CORE_UPGRADE: preserva dependências instaladas e evita apt-get no upgrade
if ! id -u alsistemas >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/alsistemas --create-home --shell /usr/sbin/nologin alsistemas
fi
[[ ! -L /var/lib/alsistemas ]] || fail 'Diretório de dados é um link simbólico; recusado.'
install -d -o alsistemas -g alsistemas -m 0700 /var/lib/alsistemas
# Primeira instalação e atualização do painel: o repositório público é padrão,
# mas configurações administrativas previamente salvas são preservadas.
[[ ! -L /var/lib/alsistemas/updates-config.json ]] || fail 'Configuração do GitHub é link simbólico; recusado.'
if [[ ! -e /var/lib/alsistemas/updates-config.json ]]; then
  printf '%s\n' '{"repo":"drilemoz/alsistemas"}' > /var/lib/alsistemas/updates-config.json
  chown alsistemas:alsistemas /var/lib/alsistemas/updates-config.json
  chmod 0600 /var/lib/alsistemas/updates-config.json
  log 'Repositório GitHub padrão registrado: drilemoz/alsistemas (Releases com SHA-256).'
fi
# Backups criptografados nunca devem ficar no webroot nem acessíveis ao Node sem sudo.
[[ ! -L /var/backups/alsistemas-vps && ! -L /var/backups/alsistemas ]] || fail 'Destino de backups é link simbólico; recusado.'
install -d -o root -g root -m 0700 /var/backups/alsistemas-vps /var/backups/alsistemas
# Não alterar as permissões de uma raiz de projetos que já exista.
if [[ ! -e /var/www/projetos ]]; then
  install -d -m 0755 /var/www/projetos
elif [[ ! -d /var/www/projetos || -L /var/www/projetos ]]; then
  fail 'Raiz /var/www/projetos não é um diretório regular seguro.'
fi
[[ ! -L /opt/alsistemas-vps && ! -L /opt/alsistemas-vps/current ]] || fail 'Diretório de instalação é um link simbólico; recusado.'
install -d -m 0755 /opt/alsistemas-vps /usr/local/libexec
# Um diretório incompleto nunca deve ser usado como a nova versão.
# Copie e valide todos os arquivos ANTES de substituir `current`.
STAGED_CORE="$(python3 "$BASE/vps/admin/core_switch.py" stage "$BASE/vps" /opt/alsistemas-vps "$BASE/tutorial-instalacao.html")" || fail 'Falha ao preparar núcleo em pasta separada.'
PREVIOUS_CORE=''
CORE_ACTIVATED=0
core_restore_on_error() {
  rc=$?
  trap - EXIT
  if (( rc != 0 && CORE_ACTIVATED )); then
    log 'Falha de instalação: tentando restaurar a pasta anterior de forma controlada.'
    if [[ -n "$PREVIOUS_CORE" && "$PREVIOUS_CORE" != '-' && -d "$PREVIOUS_CORE" ]]; then
      python3 "$BASE/vps/admin/core_switch.py" restore /opt/alsistemas-vps/current "$PREVIOUS_CORE" || log 'ALERTA: restauração automática falhou; cópia anterior mantida.'
      systemctl daemon-reload || true
      systemctl restart alsistemas-vps || true
    fi
  fi
  exit "$rc"
}
trap core_restore_on_error EXIT
# Backup de código de versões anteriores fora do diretório da versão ativa.
if [[ -f /opt/alsistemas-vps/current/src/server.js ]]; then
  backup="/var/backups/alsistemas/code-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
  tar -czf "$backup" -C /opt/alsistemas-vps/current .
  chmod 0600 "$backup"
  log "Backup do núcleo anterior: $backup"
fi
[[ ! -L /usr/local/libexec/alsistemas-helper ]] || fail 'Helper existente é um link simbólico; operação recusada.'
install -o root -g root -m 0700 "$BASE/vps/admin/helper.py" /usr/local/libexec/alsistemas-helper
# Rotinas isoladas de manutenção de projetos externos; somente o helper fixo usa sudo.
for candidate in project_maintenance.py project_updater.py other_project_permissions.py; do
  [[ ! -L "/usr/local/libexec/$candidate" ]] || fail 'Script de projeto existente é link simbólico.'
  install -o root -g root -m 0700 "$BASE/vps/admin/$candidate" "/usr/local/libexec/$candidate"
done
[[ -f "$BASE/vps/admin/updater.py" ]] || fail 'Atualizador administrativo não incluído no pacote.'
[[ ! -L /usr/local/libexec/alsistemas-updater ]] || fail 'Arquivo do atualizador é um link simbólico; recusado.'
install -o root -g root -m 0700 "$BASE/vps/admin/updater.py" /usr/local/libexec/alsistemas-updater
[[ ! -L /etc/sudoers.d/alsistemas-vps ]] || fail 'sudoers do painel é link simbólico; recusado.'
if [[ -e /etc/sudoers.d/alsistemas-vps ]]; then
  grep -Fqx '# A única elevação autorizada: helper root-owned, sem argumentos; dados via stdin.' /etc/sudoers.d/alsistemas-vps || fail 'sudoers do painel contém regras não reconhecidas; recusado.'
fi
cat > /etc/sudoers.d/alsistemas-vps <<'EOF'
# A única elevação autorizada: helper root-owned, sem argumentos; dados via stdin.
alsistemas ALL=(root) NOPASSWD: /usr/local/libexec/alsistemas-helper ""
EOF
chmod 0440 /etc/sudoers.d/alsistemas-vps
visudo -c -f /etc/sudoers.d/alsistemas-vps >/dev/null || fail 'sudoers inválido.'
if [[ ! -f /var/lib/alsistemas/admin.json && ! -f /var/lib/alsistemas/bootstrap-token ]]; then
  openssl rand -hex 24 > /var/lib/alsistemas/bootstrap-token
  chown alsistemas:alsistemas /var/lib/alsistemas/bootstrap-token
  chmod 0600 /var/lib/alsistemas/bootstrap-token
  log 'CÓDIGO DE CONFIGURAÇÃO INICIAL (mostrado uma vez):'
  cat /var/lib/alsistemas/bootstrap-token
  printf '\n'
fi
# Preserva acesso HTTPS na atualização, mesmo que --domain não seja repetido.
ORIGIN='http://localhost:8181'
if [[ -e /etc/systemd/system/alsistemas-vps.service ]]; then
  [[ ! -L /etc/systemd/system/alsistemas-vps.service ]] || fail 'Unit systemd é um link simbólico; recusado.'
  grep -Fq 'Description=AL Sistemas VPS (painel local)' /etc/systemd/system/alsistemas-vps.service || fail 'Unit existente não pertence ao painel.'
  previous_origin="$(sed -n 's/^Environment=ALS_ORIGIN=//p' /etc/systemd/system/alsistemas-vps.service | head -n 1)"
  if [[ "$previous_origin" =~ ^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63})$ ]]; then
    previous_domain="${BASH_REMATCH[1]}"
    panel_conf='/etc/nginx/sites-available/alsistemas-panel.conf'
    [[ -f "$panel_conf" && ! -L "$panel_conf" && "$(head -n 1 "$panel_conf")" == '# AL-SISTEMAS-MANAGED' ]] || fail 'Não foi possível validar o vhost HTTPS anterior; recusei redefinir a origem.'
    [[ -z "$DOMAIN" || "$DOMAIN" == "$previous_domain" ]] || fail 'Troca de domínio exige procedimento de migração próprio; origem antiga preservada.'
    ORIGIN="$previous_origin"
  fi
  install -d -m 0700 /var/backups/alsistemas
  cp -p /etc/systemd/system/alsistemas-vps.service "/var/backups/alsistemas/systemd-$(date -u +%Y%m%dT%H%M%SZ).service"
fi
cat > /etc/systemd/system/alsistemas-vps.service <<'EOF' 
[Unit]
Description=AL Sistemas VPS (painel local)
After=network.target
[Service]
Type=simple
User=alsistemas
Group=alsistemas
WorkingDirectory=/opt/alsistemas-vps/current
ExecStart=/usr/bin/node /opt/alsistemas-vps/current/src/server.js
Environment=NODE_ENV=production
Environment=ALS_DATA_DIR=/var/lib/alsistemas
Environment=ALS_PORT=8181
Restart=on-failure
RestartSec=5
UMask=0077
ProtectSystem=strict
ExecStartPre=+/usr/bin/install -d -o root -g root -m 0700 /run/alsistemas-vps
ReadWritePaths=/run/alsistemas-vps /var/lib/alsistemas /var/backups/alsistemas-vps /var/backups/alsistemas /var/www/projetos /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/alsistemas-vps
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
RestrictSUIDSGID=false
NoNewPrivileges=false
[Install]
WantedBy=multi-user.target
EOF
# O atualizador não precisa de chave privada ou pública de assinatura.
install -d -o root -g root -m 0755 /etc/alsistemas-vps
if [[ -e /etc/systemd/system/alsistemas-updater.service ]]; then
  [[ ! -L /etc/systemd/system/alsistemas-updater.service ]] || fail 'Unidade do atualizador é link simbólico.'
  if ! grep -Fq 'Description=AL Sistemas VPS - atualizador de Releases assinadas' /etc/systemd/system/alsistemas-updater.service && ! grep -Fq 'Description=AL Sistemas VPS - atualizador de Releases GitHub' /etc/systemd/system/alsistemas-updater.service; then
    fail 'Unidade existente do atualizador não pertence ao painel.'
  fi
fi
cat > /etc/systemd/system/alsistemas-updater.service <<'EOF'
[Unit]
Description=AL Sistemas VPS - atualizador de Releases GitHub
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/libexec/alsistemas-updater
UMask=0077
ProtectHome=true
PrivateTmp=true
TimeoutStartSec=600
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
EOF
# Instalações APT opcionais ocorrem em serviço root-owned, pacote restrito à allowlist.
PACKAGE_WORKER='/usr/local/libexec/alsistemas-packages'
[[ ! -L "$PACKAGE_WORKER" ]] || fail 'Executor de pacotes existente é link simbólico.'
install -o root -g root -m 0700 "$BASE/vps/admin/packages.py" "$PACKAGE_WORKER"
PACKAGE_UNIT='/etc/systemd/system/alsistemas-package-installer.service'
if [[ -e "$PACKAGE_UNIT" ]]; then
  [[ ! -L "$PACKAGE_UNIT" ]] || fail 'Unidade de pacotes é link simbólico.'
  grep -Fqx 'Description=AL Sistemas VPS - instalador de pacotes permitidos' "$PACKAGE_UNIT" || fail 'Unidade de pacotes não pertence ao painel.'
fi
cat > "$PACKAGE_UNIT" <<'PACKAGE_SERVICE'
[Unit]
Description=AL Sistemas VPS - instalador de pacotes permitidos
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/libexec/alsistemas-packages
TimeoutStartSec=540
UMask=0077
NoNewPrivileges=true
ProtectHome=true
PrivateTmp=true
PACKAGE_SERVICE
# Atualização do código do IguatamaOnline isolada do serviço do próprio painel.
PROJECT_UNIT='/etc/systemd/system/alsistemas-project-updater.service'
if [[ -e "$PROJECT_UNIT" ]]; then
  [[ ! -L "$PROJECT_UNIT" ]] || fail 'Unidade de atualização do projeto é link simbólico.'
  grep -Fqx 'Description=AL Sistemas VPS - atualizador restrito do IguatamaOnline' "$PROJECT_UNIT" || fail 'Unidade externa não pertence ao painel.'
fi
cat > "$PROJECT_UNIT" <<'PROJECT_SERVICE'
[Unit]
Description=AL Sistemas VPS - atualizador restrito do IguatamaOnline
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/libexec/project_updater.py
TimeoutStartSec=600
UMask=0077
NoNewPrivileges=true
ProtectHome=true
PrivateTmp=true
PROJECT_SERVICE
# Caixa de entrada root: soltar o ZIP em /var/lib/alsistemas-inbox atualiza o núcleo sem o painel.
INBOX_WORKER='/usr/local/libexec/alsistemas-inbox'
[[ ! -L "$INBOX_WORKER" ]] || fail 'Executor da caixa de entrada existente é link simbólico.'
install -o root -g root -m 0700 "$BASE/vps/admin/inbox.py" "$INBOX_WORKER"
[[ ! -L /var/lib/alsistemas-inbox ]] || fail 'Caixa de entrada é link simbólico; recusado.'
install -d -o root -g root -m 0700 /var/lib/alsistemas-inbox
INBOX_UNIT='/etc/systemd/system/alsistemas-inbox.service'
INBOX_PATH_UNIT='/etc/systemd/system/alsistemas-inbox.path'
for existing in "$INBOX_UNIT" "$INBOX_PATH_UNIT"; do
  if [[ -e "$existing" ]]; then
    [[ ! -L "$existing" ]] || fail 'Unidade da caixa de entrada é link simbólico.'
    grep -Fq 'Description=AL Sistemas VPS - caixa de entrada' "$existing" || fail 'Unidade da caixa de entrada não pertence ao painel.'
  fi
done
cat > "$INBOX_UNIT" <<'INBOX_SERVICE'
[Unit]
Description=AL Sistemas VPS - caixa de entrada de atualizacao do nucleo
After=local-fs.target
[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/libexec/alsistemas-inbox
TimeoutStartSec=240
UMask=0077
NoNewPrivileges=true
ProtectHome=true
PrivateTmp=true
INBOX_SERVICE
cat > "$INBOX_PATH_UNIT" <<'INBOX_PATH'
[Unit]
Description=AL Sistemas VPS - caixa de entrada: vigia da pasta
[Path]
DirectoryNotEmpty=/var/lib/alsistemas-inbox
Unit=alsistemas-inbox.service
[Install]
WantedBy=multi-user.target
INBOX_PATH
# O teste do Nginx não pode herdar o filesystem read-only da unidade Node.
# O systemd executa este comando fixo fora do sandbox web, sem argumentos do navegador.
NGINX_CHECK_UNIT='/etc/systemd/system/alsistemas-nginx-check.service'
if [[ -e "$NGINX_CHECK_UNIT" ]]; then
  [[ ! -L "$NGINX_CHECK_UNIT" ]] || fail 'Unidade de validação Nginx é link simbólico.'
  grep -Fqx 'Description=AL Sistemas VPS - verificacao isolada Nginx' "$NGINX_CHECK_UNIT" || fail 'Unidade de validação Nginx existente não pertence ao painel.'
fi
cat > "$NGINX_CHECK_UNIT" <<'NGINX_CHECK'
[Unit]
Description=AL Sistemas VPS - verificacao isolada Nginx
After=local-fs.target
[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/sbin/nginx -t
TimeoutStartSec=20
UMask=0027
NoNewPrivileges=true
ProtectHome=true
PrivateTmp=true
NGINX_CHECK
# Retira apenas o ajuste temporário EXATO, caso tenha sido aplicado durante testes da 2.0.3.
if [[ -f /etc/systemd/system/alsistemas-vps.service.d/lock.conf && ! -L /etc/systemd/system/alsistemas-vps.service.d/lock.conf ]]; then
  legacy="$(cat /etc/systemd/system/alsistemas-vps.service.d/lock.conf)"
  if [[ "$legacy" == $'[Service]\nReadWritePaths=/run/lock' ]]; then
    rm /etc/systemd/system/alsistemas-vps.service.d/lock.conf
    log 'Ajuste temporário amplo de /run/lock substituído pelo diretório restrito.'
  fi
fi
# Acesso restrito ao mutex: /run é root-owned, e este subdiretório é 0700.
[[ ! -L /run/alsistemas-vps ]] || fail 'Diretório runtime é um link simbólico; recusado.'
install -d -o root -g root -m 0700 /run/alsistemas-vps
# Preserva a origem em upgrades de instalações HTTPS existentes.
sed -i "/^Environment=ALS_PORT=/a Environment=ALS_ORIGIN=$ORIGIN" /etc/systemd/system/alsistemas-vps.service
# Troca por renomeação no mesmo filesystem, nunca por cp para a versão ativa.
# Caso falhe a ativação, a rotina de estágio restaura o diretório anterior.
PREVIOUS_CORE="$(python3 "$BASE/vps/admin/core_switch.py" activate "$STAGED_CORE" /opt/alsistemas-vps/current)" || fail 'Não foi possível ativar a versão preparada.'
CORE_ACTIVATED=1
systemctl daemon-reload
systemctl enable --now alsistemas-vps
systemctl restart alsistemas-vps
systemctl enable --now alsistemas-inbox.path || log 'Aviso: caixa de entrada não ativada; o painel e o atualizar-vps.sh seguem disponíveis.'
systemctl is-active --quiet alsistemas-vps || fail 'Serviço al-sistemas não iniciou; consulte journalctl -u alsistemas-vps.'
if [[ -n "$DOMAIN" ]]; then
  apt-get install -y certbot
  ACME_DIR='/var/lib/letsencrypt/alsistemas-webroot'
  install -d -m 0755 "$ACME_DIR/.well-known/acme-challenge"
  CONFFILE='/etc/nginx/sites-available/alsistemas-panel.conf'
  if [[ -L "$CONFFILE" ]]; then fail 'Vhost do painel é link simbólico; recusado.'; fi
  if [[ -e "$CONFFILE" && "$(head -n 1 "$CONFFILE")" != '# AL-SISTEMAS-MANAGED' ]]; then
    fail 'Arquivo de painel existente não pertence ao AL Sistemas. Operação interrompida.'
  fi
  ENABLED_PANEL='/etc/nginx/sites-enabled/alsistemas-panel.conf'
  if [[ -L "$ENABLED_PANEL" ]]; then
    [[ "$(readlink "$ENABLED_PANEL")" == "$CONFFILE" ]] || fail 'Link de painel existente aponta para configuração de terceiros; recusado.'
  elif [[ -e "$ENABLED_PANEL" ]]; then
    fail 'Existe vhost habilitado de terceiros com nome do painel; recusado.'
  fi
  # Nunca reivindicar domínio configurado por outros sites do host.
  for other in /etc/nginx/sites-available/* /etc/nginx/conf.d/*; do
    [[ -f "$other" && "$other" != "$CONFFILE" ]] || continue
    if grep -Fq -- "$DOMAIN" "$other"; then
      fail "Domínio já mencionado em $other; nenhuma configuração do painel aplicada."
    fi
  done
  PANEL_BACKUP=''
  PANEL_LINK_CREATED=0
  if [[ -e "$CONFFILE" ]]; then
    install -d -m 0700 /var/backups/alsistemas
    PANEL_BACKUP="$(mktemp /var/backups/alsistemas/panel-nginx-XXXXXXXX.conf)"
    cp -p "$CONFFILE" "$PANEL_BACKUP"
    chmod 0600 "$PANEL_BACKUP"
  fi
  restore_panel_nginx() {
    if [[ -n "$PANEL_BACKUP" ]]; then cp -p "$PANEL_BACKUP" "$CONFFILE"; else rm -f "$CONFFILE"; fi
    if ((PANEL_LINK_CREATED)); then rm -f "$ENABLED_PANEL"; fi
    if nginx -t >/dev/null 2>&1; then systemctl reload nginx || true; fi
    fail 'Nginx não aceitou a configuração do painel; vhost anterior restaurado.'
  }
  if [[ ! -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" || ! -s "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
    # Não substitui um vhost HTTPS válido por HTTP durante uma atualização.
    cat > "$CONFFILE" <<EOF
# AL-SISTEMAS-MANAGED
server {
 listen 80;
 server_name $DOMAIN;
 location ^~ /.well-known/acme-challenge/ { root $ACME_DIR; }
 location / { return 404; }
}
EOF
    if [[ ! -L "$ENABLED_PANEL" ]]; then ln -s "$CONFFILE" "$ENABLED_PANEL"; PANEL_LINK_CREATED=1; fi
    nginx -t || restore_panel_nginx
    systemctl reload nginx || restore_panel_nginx
    log 'Tentando emitir certificado. DNS e portas 80/443 devem estar corretos.'
    if ! certbot certonly --webroot --webroot-path "$ACME_DIR" --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN"; then
      log 'ATENÇÃO: certificado não emitido; o painel NÃO será publicado em HTTP. Use túnel SSH e revise DNS/firewall.'
    fi
  fi
  if [[ -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" && -s "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
    cat > "$CONFFILE" <<EOF
# AL-SISTEMAS-MANAGED
server {
 listen 80;
 server_name $DOMAIN;
 location ^~ /.well-known/acme-challenge/ { root $ACME_DIR; }
 location / { return 301 https://\$host\$request_uri; }
}
server {
 listen 443 ssl;
 server_name $DOMAIN;
 ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
 add_header Strict-Transport-Security "max-age=31536000" always;
 client_max_body_size 64k;
 # Somente os dois endpoints autenticados aceitam ZIPs de até 32 MiB.
 location = /api/updates/upload {
   client_max_body_size 32m;
   proxy_pass http://127.0.0.1:8181;
   proxy_set_header Host \$host;
   proxy_set_header X-Real-IP \$remote_addr;
   proxy_set_header X-Forwarded-Proto https;
   proxy_read_timeout 120s;
 }
 location = /api/projects/iguatamaonline/update/upload {
   client_max_body_size 32m;
   proxy_pass http://127.0.0.1:8181;
   proxy_set_header Host \$host;
   proxy_set_header X-Real-IP \$remote_addr;
   proxy_set_header X-Forwarded-Proto https;
   proxy_read_timeout 120s;
 }
 location / {
   proxy_pass http://127.0.0.1:8181;
   proxy_set_header Host \$host;
   proxy_set_header X-Real-IP \$remote_addr;
   proxy_set_header X-Forwarded-Proto https;
   proxy_read_timeout 30s;
 }
}
EOF
    if [[ ! -L "$ENABLED_PANEL" ]]; then ln -s "$CONFFILE" "$ENABLED_PANEL"; PANEL_LINK_CREATED=1; fi
    nginx -t || restore_panel_nginx
    systemctl reload nginx || restore_panel_nginx
    sed -i "s|^Environment=ALS_ORIGIN=.*|Environment=ALS_ORIGIN=https://$DOMAIN|" /etc/systemd/system/alsistemas-vps.service
    systemctl daemon-reload
    systemctl restart alsistemas-vps
    install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
    HOOK_PATH='/etc/letsencrypt/renewal-hooks/deploy/alsistemas-nginx'
    [[ ! -L "$HOOK_PATH" ]] || fail 'Hook de renovação é link simbólico; recusado.'
    if [[ -e "$HOOK_PATH" ]]; then
      grep -Fqx '/usr/sbin/nginx -t' "$HOOK_PATH" && grep -Fqx '/bin/systemctl reload nginx' "$HOOK_PATH" || fail 'Hook de renovação existente não pertence ao painel.'
    fi
    cat > "$HOOK_PATH" <<'HOOK'
#!/bin/sh
set -e
/usr/sbin/nginx -t
/bin/systemctl reload nginx
HOOK
    chmod 0755 "$HOOK_PATH"
    log "Acesso HTTPS previsto: https://$DOMAIN (confirme DNS e portas no provedor)."
  fi
fi
# Atualizações do núcleo normalmente não repetem --domain; migrar apenas o vhost
# com marcador do AL Sistemas. Nenhum vhost de terceiros será editado.
if ((CORE_UPGRADE)) && [[ -z "$DOMAIN" ]]; then
  PANEL_CONF='/etc/nginx/sites-available/alsistemas-panel.conf'
  if [[ -f "$PANEL_CONF" && ! -L "$PANEL_CONF" && "$(head -n 1 "$PANEL_CONF")" == '# AL-SISTEMAS-MANAGED' ]]; then
    PANEL_BACKUP="$(mktemp /var/backups/alsistemas/panel-upload-XXXXXXXX.conf)"
    cp -p "$PANEL_CONF" "$PANEL_BACKUP"
    # Um script puro e isolado evita alterações em configurações Nginx externas.
    if ! python3 "$BASE/vps/admin/nginx_upload.py" "$PANEL_CONF"; then
      cp -p "$PANEL_BACKUP" "$PANEL_CONF"
      fail 'Vhost do painel fora do formato conhecido; revisão manual necessária.'
    fi
    if ! nginx -t || ! systemctl reload nginx; then
      cp -p "$PANEL_BACKUP" "$PANEL_CONF"
      nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
      fail 'Nginx rejeitou mudança de upload, configuração anterior restaurada.'
    fi
    log 'Limite de 32 MiB aplicado apenas aos endpoints de atualização do painel.'
  else
    log 'AVISO: vhost do painel ausente ou não gerenciado; upload por ZIP exige configuração manual do proxy.'
  fi
fi
if ((UFW)); then
  apt-get install -y ufw
  if command -v sshd >/dev/null; then
    ports="$(sshd -T 2>/dev/null | awk '$1=="port" && $2~/^[0-9]+$/ {print $2}' | sort -un)"
  else ports=''; fi
  if [[ -z "$ports" ]]; then fail 'Porta SSH não identificada; UFW não será habilitado automaticamente.'; fi
  while read -r port; do [[ -n "$port" ]] && ufw allow "${port}/tcp"; done <<< "$ports"
  ufw allow 80/tcp; ufw allow 443/tcp
  ufw --force enable
fi
# Não considerar a instalação concluída só porque systemd respondeu active.
# A API deve responder com a versão efetivamente instalada.
EXPECTED_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' /opt/alsistemas-vps/current/package.json)"
if ! python3 - "$EXPECTED_VERSION" <<'HEALTH'
import json, sys, time, urllib.request
expected = sys.argv[1]
for i in range(35):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8181/api/health', timeout=2) as response:
            state = json.load(response)
            if state.get('ok') is True and state.get('version') == expected:
                sys.exit(0)
    except Exception:
        pass
    time.sleep(1)
sys.exit(1)
HEALTH
then
  fail 'A nova versão não respondeu ao teste de saúde; restauração do núcleo anterior acionada.'
fi
log 'Verificações finais:'
/usr/bin/node --version
nginx -t
systemctl --no-pager is-active nginx alsistemas-vps
if ((PHP)); then systemctl --no-pager is-active php8.3-fpm; fi
if ((MARIADB)); then systemctl --no-pager is-active mariadb; fi
log 'Painel escuta exclusivamente em 127.0.0.1:8181. Sem HTTPS, acesso via ssh -L 8181:127.0.0.1:8181 usuario@IP e http://localhost:8181.'
log 'Nunca exponha 8181 diretamente no Security Group da EC2 ou no firewall.'
