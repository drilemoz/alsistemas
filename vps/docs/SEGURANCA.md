# Segurança do núcleo de hospedagem AL Sistemas VPS 2.0.27

## Superfícies e permissões

O núcleo HTTP é um único processo Node.js sem root, ligado apenas ao loopback IPv4. Não há endpoint que execute comandos arbitrários. As requisições administrativas têm sessão aleatória cujo token é guardado somente por hash SHA-256 no arquivo privado de sessões (expira em 8h), cookie HttpOnly/SameSite=Strict e Secure sob HTTPS; o token CSRF é exigido em mutações. Origem é comparada com `ALS_ORIGIN`. A conta única exige senha com scrypt e TOTP no login em dispositivos não confiáveis (janela +-30 s), bloqueio de reutilização de códigos de login e limitação de tentativas por origem de socket. Depois do login, toda alteração usa somente a sessão e o token CSRF; não há reautenticação adicional, inclusive para ações privilegiadas. Reinícios normais preservam sessões ainda válidas; logout e revogação geral as invalidam.

Ações privilegiadas passam por `sudo -n /usr/local/libexec/alsistemas-helper` com **nenhum argumento de linha de comando** e JSON pelo stdin. O sudoers restringe o binário exato. O helper é root-owned e somente root o modifica. As operações permitidas são `create_project`, `set_site_state`, `validate_nginx`, `backup_project` e `list_backups`: a primeira não permite sobrescrever caminhos existentes, rejeita nomes reservados (incluindo `iguatamaonline` e `alsistemas`), nega traversal, valida domínio, recusa configuração Nginx existente e testa Nginx antes de recarregar. A segunda só altera links de vhosts **gerenciados** e pertencentes ao root, preserva o projeto físico e restaura o estado anterior em erros simulados. Para operações via helper, um mutex `flock` serializa modificações Nginx feitas pelo painel.

O serviço systemd requer `NoNewPrivileges=false` para usar o sudoers restrito. Isso é um risco residual: o sudo ainda deve ser tratado como superfície de privilégio e exige revisão em sistema real. `ProtectSystem=strict` limita escritas a diretórios declarados. Recomenda-se migrar futuramente para executor sob demanda via systemd/polkit/socket sem manter sudo no usuário da aplicação.

## Proteção de sites existentes

A API de descoberta só lista diretórios; não altera conteúdo. Projetos externos nunca recebem botões de alteração; essa distinção visual não substitui a verificação de permissão do helper root. Criação falha quando a pasta já existe, sem sobrescrever. O instalador não muda `/var/www/projetos/iguatamaonline/` nem `/var/www/iguatama-teste/`. Também bloqueia instalações em hospedagem conhecida até liberação consciente. Não execute scripts antigos de seed no MongoDB de produção.

## Limites conhecidos

- Uma única conta administradora; sem RBAC, códigos de recuperação TOTP nem recuperação assistida. O backup público é criptografado, mas backup completo ainda não existe.
- Arquivos administrativos (hash/TOTP) são protegidos por permissões Linux, mas não por criptografia independente do sistema de arquivos. Não copie `admin.json` para armazenamento público nem para backup sem criptografia.
- Auditoria local não é imutável. Ainda precisa de exportação segura/off-host, assinaturas e alertas.
- A criação PHP usa o pool padrão do PHP-FPM (`www-data`), não um pool isolado por site. Não é apropriado a hospedagem de clientes não confiáveis nesta etapa.
- Instalação e Nginx exigem teste real de permissões, DNS, compatibilidade systemd, UFW e Certbot em VPS de homologação.
- A criação de projeto com domínio publica HTTP do site; certificado e redirect HTTPS para novos sites não estão implementados nesta versão. Não publique dados sensíveis antes de instalar HTTPS.
- Instalar/atualizar pacotes pode reiniciar serviços do host; faça snapshot e janela de manutenção quando houver sites ativos.
- O legado Express/MongoDB continua preservado, mas não é exposto nem executado pelo serviço VPS. Seu modelo de segurança é distinto e ainda precisa de migração de CSRF/TOTP e endurecimento para funcionar como painel Linux.

## Operações e exposição

Apenas 22/tcp (ou porta SSH escolhida), 80/tcp e 443/tcp, quando necessários, devem ser abertos por Security Group e UFW. **Nunca abra 8181/tcp na rede externa.** O `--enable-ufw` é opt-in e tenta liberar a(s) porta(s) SSH antes de habilitar UFW. Confirme separadamente as regras do provedor (AWS/Outros) e use SSH com chave e MFA do provedor quando disponível.

Faça backup completo fora da VPS antes de atualizar. Não crie hosts multiusuário/compartilhados neste núcleo inicial. Em caso de perda da autenticação, use console/SSH de root e um procedimento de recuperação auditável, não endpoints de recuperação públicos.

## Notas 2.0.2

- HTTPS anteriormente configurado é mantido no serviço systemd durante atualização sem a opção `--domain`. Alteração de domínio é recusada, exigindo procedimento dedicado.
- O instalador valida vínculos simbólicos do painel e recusa substituí-los caso apontem a terceiros. Configuração Nginx do painel é restaurada se `nginx -t` ou reload falhar.
- Não há acesso root irrestrito, exclusão de sites, editor de arquivos ou terminal remoto via interface.
- O segredo TOTP ainda fica em arquivo protegido por permissões Unix e não existe recuperação automática nem RBAC.

## Backups criptografados (2.0.3)

- O helper executado via sudo recebe a frase secreta no **stdin do processo**, nunca como argumento de linha de comando; o Node não grava a frase na auditoria. O navegador só aceita fluxo HTTPS ou túnel SSH localhost. A frase **não é armazenada**: a perda inviabiliza a restauração.
- GPG AES-256 simétrico, S2K SHA-256 com contagem alta, diretório root-owned `0700`, arquivos cifrados e sidecars `0600`. Manifesto com hash SHA-256 dos arquivos está dentro do TAR criptografado; hash SHA-256 do contêiner cifrado é registrado em sidecar.
- O backup cobre **apenas a pasta public/** do projeto e **pode conter credenciais se estas estiverem dentro do público**. Portanto nunca copie o arquivo `.tar.gpg` já decifrado sem revisão. O backup não inclui configurações, bancos, outros diretórios, histórico completo ou recuperação automática. Não há upload externo nem retenção automática.
- O helper recusa projetos externos, links/hardlinks, dispositivos e diretórios graváveis por grupo/outros, mas um projeto alterado enquanto é copiado pode gerar uma snapshot inconsistente. Prefira quiescência e restauração manual em ambiente isolado.
- O usuário `alsistemas` não tem leitura direta do repositório de backups. Só a rota autenticada utiliza o helper limitado para inventário e criação. As limitações de `sudo` e sandbox ainda exigem testes reais em Ubuntu.


## Novos controles 2.0.4

- Dispositivos confiáveis: cookie aleatório de 256 bits, `HttpOnly`, `SameSite=Strict` e `Secure` quando HTTPS. O backend armazena somente SHA-256 do token em `trusted-devices.json` (0600), data, prazo de 30 dias e descrição reduzida do navegador. O token **não** é sessão nem dispensa senha. Máximo de cinco dispositivos, com revogação local autenticada ou revogação geral pela sessão e token CSRF. Compartilhar cookies ou controlar o aparelho desbloqueado continua sendo um risco.
- O atualizador privilegiado é executado por serviço systemd separado, não pelo processo web como root. Recebe somente repositório validado e manifesto Ed25519 assinado por chave pública fixada no servidor, compara SHA-256 e valida ZIP antes de executar o instalador. Nunca publica a chave privada. O rollback é de código/serviço, não inclui bancos, configurações de terceiros ou transações de apt. Teste primeiro em VPS de homologação.
- Lock das tarefas em `/run/alsistemas-vps/tasks.lock` com subdiretório root-owned 0700, criado pelo systemd; evita liberar toda a pasta `/run/lock` para escrita ao serviço. Remoção do ajuste temporário antigo somente quando exatamente reconhecido.
- Testes locais cobrem TOTP, sessão, CSRF, cookie confiável, revogação, URLs GitHub, ZIP com traversal/symlink e assinatura Ed25519 real; ainda não foram feitos testes de integração da atualização no systemd de Ubuntu real.

## Refinamentos 2.0.5

- Formulários administrativos da interface foram movidos para modais, sem alterar a validação e a autenticação do backend.
- O repositório padrão `drilemoz/alsistemas` não dispensa assinatura Ed25519 nem validação SHA-256 de uma Release.
- O bootstrap via Termux mantém verificação de host SSH ativa, usa lista de opções permitidas, valida pacote ZIP na VPS antes de executar e solicita confirmação após `--plan`.
- Nenhum token nem senha SSH é incluído no ZIP.

## 2.0.11: serviços privilegiados de função única

O helper web continua sendo executado com sudoers limitado. As verificações Nginx usam `systemctl start alsistemas-nginx-check.service`, unidade estática root-owned com `ExecStart=/usr/sbin/nginx -t`. O backend não define comandos.

O serviço APT lê `/run/alsistemas-vps/package-request.json` com propriedade root e modo 0600, valida a lista de pacotes e executa `apt-get install` somente com argumentos estáticos. Desde 2.0.25, a instalação exige somente sessão autenticada e CSRF; não há campo genérico para pacotes. A interface informa início e resultado, não percentual fictício. Pacotes APT podem alterar serviços; preferir testes.

O fluxo atual de Releases usa ZIP e manifesto SHA-256 (sem assinatura Ed25519). A identidade do publicador não é comprovada por assinatura, portanto use repositório confiável e valide a procedência do pacote.

## Alteração 2.0.25: uma verificação de identidade por sessão

Senha e TOTP são exigidos somente no login (e no cadastro inicial da conta); não há step-up para DNS, repositório, pacotes, manutenção de arquivos e revogações. Isso **reduz a segurança** caso uma sessão ativa seja capturada ou usada indevidamente. Permanecem cookie protegido, CSRF, origem, auditoria, rate limiting, confirmações de ações, allowlists de pacotes e as verificações do helper root. O backup cifrado continua exigindo a frase secreta para criptografia.

## 2.0.26: preenchimento automático do login

Dispositivos confiáveis continuam exigindo a senha correta, mas **não** exigem TOTP no login durante a validade do token confiável. O frontend desativa o input TOTP quando oculto, impedindo que um código preenchido pelo navegador seja incluído por FormData; a API também ignora códigos antigos/inesperados quando o cookie confiável é validado. Dispositivos não confiáveis continuam exigindo TOTP novo, com controle de reutilização. Cookies e segredos não são escritos em logs. Se a senha salva não corresponder ao hash do administrador, o login continua recusado.

## 2.0.27: sessões após reinício e atualização móvel

O hash SHA-256 dos cookies de sessão, CSRF e expiração de oito horas são armazenados em `sessions.json`, no diretório privado do serviço (`/var/lib/alsistemas` em produção, modo 0600). O cookie em claro não é persistido. O arquivo é substituído de forma atômica pelo usuário do painel. A revogação geral apaga as sessões, inclusive as persistidas; a senha e TOTP continuam obrigatórios apenas no login. Os indicadores de progresso de atualização refletem etapas recebidas do servidor, separando falhas de conexão de falhas do instalador.
