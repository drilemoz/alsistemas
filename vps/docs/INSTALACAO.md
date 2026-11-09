## Instalação rápida com Termux (2.0.11)

O caminho mais curto depois de configurar o primeiro SSH e baixar o ZIP no Android é:

```bash
pkg install -y openssh unzip
termux-setup-storage
mkdir -p ~/als-instalador
unzip -oq ~/storage/downloads/AL-Sistemas-v2.0.11-VPS.zip inicio-termux.sh bootstrap-vps.sh -d ~/als-instalador
bash ~/als-instalador/inicio-termux.sh --host IP_DA_VPS --key ~/.ssh/minha-chave.pem
```

A transferência ocorre por SCP. O script remoto usa Python 3 pré-instalado no Ubuntu 24.04 para validar integridade e extrair o ZIP, exibe `--plan` e solicita confirmação antes do `sudo`. Use `--existing` se já existir um dos sites protegidos, `--with-php` e `--with-mariadb` para pacotes opcionais. O script não cria chaves SSH, não abre 8181 à internet e não configura um domínio sem os parâmetros próprios. Se a VPS não oferecer Python 3 ou SSH, configure-os primeiro. Sem domínio, acesse por túnel SSH. As etapas detalhadas continuam abaixo e no `tutorial-instalacao.html`.

# AL Sistemas VPS 2.0.11 — Instalação Ubuntu Server 24.04 LTS

> **Estado da validação:** instalador testado com `bash -n` e revisão estática. Ainda não executado em uma VPS Ubuntu 24.04 real; instale primeiro em uma VPS de homologação ou snapshot restaurável. O comando `--plan` não altera nada.

## Arquitetura e pré-requisitos

- Uma VPS Ubuntu Server 24.04 LTS amd64 ou arm64 com systemd, apt, acesso SSH funcional e sudo.
- Nginx e Node.js >=22 são essenciais. O instalador usa NodeSource 24 LTS se `/usr/bin/node` não estiver instalado ou for antigo.
- PHP 8.3-FPM e MariaDB 10.11 são **opcionais**. A criação de projetos PHP exige PHP-FPM previamente instalado.
- O núcleo `vps/` funciona sem `npm install` e sem MongoDB. SQLite está planejado para módulos futuros; por ora uma conta admin e auditoria usam arquivos locais protegidos.
- O servidor Node escuta **somente 127.0.0.1:8181**; o navegador o acessa por túnel SSH ou Nginx HTTPS. Nunca exponha a porta 8181 no firewall do provedor.
- Recomenda-se snapshot antes de qualquer instalação no servidor com sites existentes.

## Envio pelo Termux

Envie o ZIP para o home de um usuário com acesso SSH usando `scp`, extraia num diretório temporário e confirme que existe `instalar.sh` na raiz do ZIP.

```bash
# exemplo genérico: substitua IP/usuário pelo da VPS autorizada
scp AL-Sistemas-v2.0.4-VPS.zip usuario@IP_DA_VPS:~/
ssh usuario@IP_DA_VPS
unzip AL-Sistemas-v2.0.4-VPS.zip -d ~/al-sistemas-release
cd ~/al-sistemas-release
bash instalar.sh --plan
```

**Instalação nova mínima, inicialmente somente por túnel SSH:**

```bash
sudo ./instalar.sh
```

**Servidor com PHP e MariaDB opcionais, domínio e HTTPS (exemplo):**

```bash
sudo ./instalar.sh --with-php --with-mariadb \
  --domain painel.exemplo.com --email admin@exemplo.com
```

O instalador verifica SO/arquitetura, CPU/RAM/disco/portas, instala componentes escolhidos, cria conta não privilegiada, helper com sudo restrito, serviço systemd e vhost isolado. Se a VPS contiver `/var/www/projetos/iguatamaonline/` ou `/var/www/iguatama-teste/`, o instalador **recusa a execução por padrão**. Não use `--allow-existing-host` sem snapshot e revisão manual. O código nunca apaga nem chown recursivamente esses caminhos.

Se `--domain` for informado, o Nginx HTTP permite só os desafios Let's Encrypt até conseguir o certificado. O login **não é publicado em HTTP**. Sem certificado, use túnel SSH e corrija DNS / portas (80/443) antes de repetir a instalação. Para um domínio válido, registre DNS A (e AAAA se usar IPv6) no provedor escolhido, inclusive Spaceship. AWS Security Groups continuam configurados fora deste instalador.

**Sem HTTPS, acesse de forma segura pelo Termux:**

```bash
ssh -L 8181:127.0.0.1:8181 usuario@IP_DA_VPS
```

Mantenha o SSH conectado e acesse `http://localhost:8181` no navegador do dispositivo com o túnel ativo. Caso Termux e Chrome estejam no mesmo Android, ambos podem usar esse endereço local. O código de configuração inicial aparece **uma vez no terminal** e fica no arquivo protegido `/var/lib/alsistemas/bootstrap-token` até concluir a ativação.

O setup web exige um código temporário, uma senha forte e um código TOTP de aplicativo autenticador. **Guarde cópia segura da chave TOTP**: esta versão não tem recuperação pela interface. A ausência de TOTP implica recuperação manual sob controle do root e restauração de backups.

## Estrutura no servidor

| Caminho | Finalidade |
|---|---|
| `/var/www/projetos/<nome>/` | projetos hospedados, não alterados na descoberta |
| `/opt/alsistemas-vps/current/` | núcleo ativo (código e frontend leve) |
| `/var/lib/alsistemas/admin.json` | hash da senha e segredo TOTP; modo 0600, propriedade do serviço |
| `/var/lib/alsistemas/audit.jsonl` | auditoria local com rotação ~1 MiB |
| `/var/backups/alsistemas/` | backups de código antes de atualizações do núcleo |
| `/etc/systemd/system/alsistemas-vps.service` | serviço Node sem root |
| `/usr/local/libexec/alsistemas-helper` | operações limitadas, executadas como root |
| `/etc/sudoers.d/alsistemas-vps` | única execução privilegiada autorizada |
| `/etc/nginx/sites-available/alsistemas-panel.conf` | apenas vhost do painel, quando configurado |

## Comandos úteis

```bash
sudo systemctl status alsistemas-vps
sudo journalctl -u alsistemas-vps -n 80 --no-pager
sudo nginx -t
sudo systemctl status nginx
curl --fail http://127.0.0.1:8181/api/health
```

## Atualização e idempotência

Para a primeira atualização da 2.0.3 para 2.0.4, comece por `bash instalar.sh --plan`, confira um snapshot e leia [ATUALIZACAO-2.0.4.md](ATUALIZACAO-2.0.4.md). Envie o ZIP 2.0.4, revise as mudanças e execute `sudo ./instalar.sh` com as opções apropriadas. Versões futuras podem usar o módulo GitHub somente após configurar chave pública e publicar uma Release assinada. Em VPS com IguatamaOnline ou `/var/www/iguatama-teste/`, é necessário `--allow-existing-host` consciente, **sem alteração desses sites pelo instalador**. O instalador reutiliza o usuário e os diretórios existentes, não refaz a conta admin e salva backup de código em `/var/backups/alsistemas/` quando encontra versão anterior. **Não restaura automaticamente** dados alterados por administradores.

As versões de código só devem avançar sequencialmente. O código legado (`backend/` e `alsistemas/`) não é iniciado pelo instalador VPS.

## O que esta versão ainda não faz

- Criar/alterar bancos e usuários MariaDB pela interface.
- Implantar projetos Node.js, editor de arquivos, restaurar backups completos de projetos e bancos, SSL por site ou migração assistida. A atualização do núcleo via GitHub exige releases assinadas e configuração prévia de chave pública.
- Migrar automaticamente o backend legado MongoDB/Cloudinary para SQLite.
- Gerenciar usuários Linux por projeto, PHP-FPM pools isolados, backups externos ou rollback automático total de sistema.

Estas funções devem ser implementadas em versões futuras com testes de integração em VPS descartável. Não use os módulos legados como substitutos de funções administrativas Linux.

## Operação segura de sites na versão 2.0.2

O painel agora permite **ativar ou desativar** apenas vhosts de projetos gerados pelo próprio AL Sistemas, com confirmação, validação de marca/posse da configuração, `nginx -t`, `systemctl reload nginx` e restauração do link quando a operação falha. A pasta do projeto e seus arquivos nunca são removidos por essa operação. Projetos externos, incluindo IguatamaOnline, são **somente leitura**. Projetos sem domínio não possuem vhost para ativar/desativar. Projetos criados na 2.0.1 com a antiga marcação são reconhecidos.

Após um login TOTP bem-sucedido, o mesmo intervalo de código não pode ser usado outra vez; em caso de novo login, espere o próximo código do autenticador. A atualização preserva a conta do painel.

Referência de suporte ao repositório NodeSource `nodistro` (Ubuntu 24.04/amd64/arm64): https://github.com/nodesource/distributions/blob/master/DEV_README.md .


## Novidade 2.0.4: cópias locais criptografadas

O instalador prepara `/var/backups/alsistemas-vps/` (root:root, 0700), exige GPG e mantém o Node sem root. No painel autenticado, clique em **Backup criptografado** de um projeto criado pelo AL Sistemas, informe frase secreta de 16–128 caracteres e aguarde o retorno. O sistema salva `.tar.gpg` e `.json` (inventário) no diretório acima, com SHA-256. Não há transferência externa ou restauração via interface nesta versão.

Para conferir arquivos pelo SSH sem publicar o segredo:

```bash
sudo ls -lh /var/backups/alsistemas-vps/*.tar.gpg
sudo sha256sum /var/backups/alsistemas-vps/ARQUIVO.tar.gpg
```

Para **testar uma restauração fora da produção**, copie o `.tar.gpg` para local privado e use GPG para descriptografar em arquivo temporário, verificando conteúdo do TAR sem extraí-lo diretamente no sistema de produção. O manifesto `alsistemas-manifest.json` vem dentro do TAR. Nunca use `tar -x` com privilégios e conteúdo não inspecionado. Faça backup completo independente incluindo bancos, usuários e configuração Nginx; o novo recurso não substitui isso. Salve sua frase secreta em local seguro fora da VPS.


## Novidade 2.0.4

Leia o arquivo principal `tutorial-instalacao.html` e `ATUALIZACAO-2.0.4.md` para atualização da versão já instalada. Sem domínio, continue usando túnel SSH. A conta existente em `/var/lib/alsistemas/admin.json` é preservada; no primeiro login da versão nova, marque **Confiar neste dispositivo por 30 dias** e confirme o TOTP para poder usar apenas a senha nas próximas entradas pelo mesmo navegador. A opção não dispensa a senha nem operações sensíveis.

O arquivo root-owned `/etc/alsistemas-vps/update-public-key.pem` é opcional e deve receber apenas a chave pública Ed25519 de Releases assinadas. A aplicação não cria, armazena nem recebe a chave privada. A atualização tem serviço systemd próprio, com logs em `journalctl -u alsistemas-updater`.
