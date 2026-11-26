## 2.0.61 — Diagnóstico de migração e atualização

- Relatório do IguatamaOnline compara schema declarado e real via PHP CLI sem privilégios, sem migração ou dump durante a consulta; mostra estado do backup privado.
- Progresso e falha do worker registram revisões de schema, manifesto e etapa; coleta inclui logs do worker do painel.
- Mantidos backup SQL obrigatório, lock e bloqueio de saltos de schema não validados. Não substitui o atualizador próprio do portal.

## 2.0.60 — Reparo assistido
Na central de diagnóstico, selecione o reparo e confirme. Os serviços compartilhados só recebem pedido de início se estiverem parados ou falhos; Nginx e PHP-FPM são validados previamente. O resultado distingue solicitação de início e estado ativo. O timer dedicado permanece exclusivo do IguatamaOnline. Não são removidos locks nem alteradas permissões ou schemas.

## 2.0.59 — Terminal VPS

- Módulo global em Mais → Terminal VPS no celular e menu lateral no desktop. Bash real em PTY, com comandos livres, Ctrl+C/D, último comando, cópia e TXT.
- Transporte HTTP autenticado, mesma origem, CSRF em todas as operações, HTTPS obrigatório e confirmação de abertura. Sem nova senha após login. Uma sessão por login, até duas na VPS, 30 min totais e 10 min sem entrada; encerra com logout/revogação. Saída limitada a 256 KiB e exibida como texto, sem interpretar ANSI.
- Socket Unix privado e unidade systemd com usuário dinâmico separado, sem sudo, sistema de arquivos protegido e diretórios privados do painel inacessíveis. O terminal não substitui SSH root; programas de tela cheia não são renderizados. O bloqueio de metadados AWS por IP depende do suporte do kernel/systemd. Operações privilegiadas continuam nos módulos predefinidos.
- Instalador ativa o socket sem adicionar dependências NPM/Python, regras sudo ou alterações ao Nginx. Se o socket não iniciar, o painel permanece disponível. Diagnóstico de serviços inclui o socket e eventos recentes do worker/timer do IguatamaOnline (redação básica, revisar antes de compartilhar). Atalhos preenchem comandos de consulta sem executá-los automaticamente.
- Nenhuma migração do site, alteração de donos ou desbloqueio automático nesta versão. Revisar saída antes de compartilhar.

## 2.0.58 — Central de diagnóstico e reparo

- Consultas administrativas por projeto não protegido com seleção de grupos e exportação TXT.
- Coleta independente de histórico, logs e diagnóstico, com limite ampliado de resposta.
- Vistoria do lock e do worker, serviços, Nginx, PHP, MariaDB local e recursos da VPS.
- Reparo pontual: ativação do timer de implantação já instalado; não instala unidades, não altera donos nem remove locks.
- Console de consultas predefinidas; não oferece shell Bash livre ou PTY.
- MariaDB: verifica conexão local, não associa banco ao projeto nem lê credenciais; migrações automáticas permanecem fora desta versão.

## 2.0.57 — Diagnóstico de implantação

Relatório técnico do IguatamaOnline inclui metadados de permissões, lock, serviços, limites declarados e contagem de erros Nginx. Consulta somente leitura; terminal interativo e reparos automáticos não incluídos.

## Atualização 2.0.56

Em Projetos → Configurações do servidor, aplique 80 MiB Nginx, 64 MiB upload PHP e 80 MiB POST. Vhosts personalizados incompatíveis são recusados. Limites específicos de localização são preservados. Não altera php.ini global.

## Atualização 2.0.55 — Compatibilidade com o worker do portal

Instale o painel atualizado primeiro. Preserve `iguanews-deploy` como proprietário da raiz, `app/` e `public/`; não use `chown -R ubuntu` nem libere escrita ao PHP-FPM. Em instalações com essa conta, o AL Sistemas usa o mesmo `.code.lock` privado do atualizador do site. Se o controle estiver ausente ou houver recuperação pendente, investigue antes de continuar; não apague o lock nem o marcador. Arquivos novos usam dono/grupo da raiz; arquivos existentes preservam os atributos anteriores. Verifique a vistoria do portal antes e depois da atualização e não inicie duas atualizações simultaneamente.

Diagnóstico por SSH (sem alterar código existente):

```bash
sudo systemctl status iguatama-deploy.timer --no-pager
sudo -u iguanews-deploy env IGUA_DEPLOY_VPS=1 /usr/bin/php8.3 /var/www/projetos/iguatamaonline/bin/aws-deploy-check.php
```

Se a vistoria falhar, examine o resultado antes de ajustar permissões. O painel não altera o worker próprio do site. As restrições de schema, backups e integridade permanecem. Validação local não substitui teste na EC2.

## Atualização 2.0.54 — Atualizador do portal

Atualize o painel antes do portal. Abra Projetos → IguatamaOnline → Atualizar site. A fonte padrão é `drilemoz/Meu-Site`. Consulte a Release pública estável, confirme a versão e acompanhe o progresso. ZIP oficial continua disponível como alternativa. Os bloqueios de schema e backups da 2.0.53 permanecem.

## Atualização 2.0.53 — Portal IguatamaOnline e schema

1. Atualize o AL Sistemas antes do portal. Use o ZIP de atualização oficial gerado no checkout do portal por `python3 tools/build_update_package.py --output /tmp/portal-update.zip`, não o ZIP de código-fonte. O manifesto é verificado por SHA-256, mas a autoria/assinatura Ed25519 não é verificada pelo AL Sistemas: use somente pacote de origem confiável.
2. Faça snapshot externo EBS e cópia de storage/uploads antes do primeiro uso. Confira o banco local configurado em `storage/config.php` (sem exibir senhas), acesso do usuário PHP CLI, `php` com pdo_mysql e `/usr/bin/mariadb-dump` (pacote Ubuntu `mariadb-client`). O usuário do banco precisa das permissões de leitura/exportação e DDL do portal. O painel não instala dependências automaticamente.
3. Confira que não há atualização pelo worker próprio do portal, cron de migração/backup ou administração concorrente. O marcador de manutenção do portal não bloqueia todas as rotas administrativas; suspenda acessos administrativos e jobs externos durante a operação. Não use o atualizador com banco remoto, TLS, tabelas não InnoDB ou schema divergente.
4. Em Projetos > IguatamaOnline > Atualizar site, selecione o pacote oficial. O processo verifica a revisão corrente, ativa manutenção, exporta SQL (limite 512 MiB, com margem de disco), copia os arquivos a modificar e executa a migração com o usuário PHP. Só aceita revisão igual ou incremento de uma unidade. Confere revisão e, no schema 38, as colunas de sugestões.
5. Consulte o progresso, abra o portal e faça teste real de envio e moderação. Não é um teste HTTP automatizado.

### Falha e recuperação

Backups privados em `/var/backups/alsistemas-vps/iguatamaonline/code-*` contêm `metadata.json`, arquivos anteriores e, quando aplicável, `database.sql` com tamanho e SHA-256 no manifesto. O marcador `schema-recovery.json` impede novas atualizações e restauração isolada até revisão humana. A reversão automática antes de DDL tenta restaurar o código; depois do início da migração não há importação SQL automática, pois ela pode apagar gravações posteriores ao dump e DDL MariaDB não é transacional.

Em recuperação, isole o portal de tráfego e jobs, faça outro snapshot externo do estado atual, confira SHA-256 do dump e as entradas do manifesto, e teste o dump em banco isolado. Se a migração foi aplicada, prefira terminar a migração no código novo. Se for necessário retornar, restaure **juntos** o banco anterior e os arquivos/atributos de `metadata.json` (remova somente entradas marcadas `existed=false`). Confirme revisão e versão coincidentes; só então remova o marcador de manutenção `storage/.update-maintenance` e `schema-recovery.json`, libere tráfego e faça teste funcional. Não importe dump automaticamente sobre produção. Backups manuais de código só podem ser restaurados quando compatíveis com a revisão real.

A operação não garante isolamento de clientes SQL externos, não é backup completo de uploads e não substitui snapshot EBS.

## Atualização 2.0.52 — Ícones nos dados da VPS e da Amazon EC2

Instale o ZIP em **Mais → Atualizar → Arquivo ZIP**. Confira as janelas **Dados da VPS** e **Amazon EC2** em **Início**. Nenhuma configuração adicional é necessária para a mudança visual.

## Atualização 2.0.51 — Snapshots EBS no painel da Amazon EC2

Instale o ZIP em **Mais → Atualizar → Arquivo ZIP**. Depois abra **Início → Ações da VPS → Amazon EC2**. Veja o [guia de configuração](vps/docs/ATUALIZACAO-2.0.51.md).

## Atualização 2.0.50 — Dados da Amazon EC2

Instale o ZIP em **Mais → Atualizar → Arquivo ZIP**. Depois abra **Início → Dados da VPS → Amazon EC2**. Veja [configuração e validação](vps/docs/ATUALIZACAO-2.0.50.md).

## Atualização 2.0.49 — Correção do boot da VPS

Se o painel estiver em 502 e o journal indicar 226/NAMESPACE para /run/alsistemas-vps, siga primeiro a [recuperação por SSH](vps/docs/ATUALIZACAO-2.0.49.md). Depois instale o ZIP e confira a regra de boot.

## Atualização 2.0.48 — Atualizações e acompanhamento de reinício

Envie o ZIP em **Mais → Atualizar → Arquivo ZIP**. A instalação reinicia o serviço do painel. O recurso de reiniciar a VPS permanece uma ação separada, com confirmação. Consulte [o guia](vps/docs/ATUALIZACAO-2.0.48.md).

## Atualização 2.0.47 — Correção das métricas da VPS

Abra **Mais → Atualizar → Arquivo ZIP** e envie o pacote da 2.0.47. A atualização reinstala a unidade do painel, sem solicitar reinício do Linux. Veja o [guia da correção](vps/docs/ATUALIZACAO-2.0.47.md).

## Atualização 2.0.46 — Ajuda contextual e janelas de detalhe

No AL Sistemas VPS, abra **Mais → Atualizar → Arquivo ZIP** e selecione o pacote da 2.0.46. A publicação de sites mantém suas etapas em uma única janela. A atualização não solicita reinício do Linux. Veja o [guia da versão](vps/docs/ATUALIZACAO-2.0.46.md).

## Atualização 2.0.45 — Visão geral e reinício

Instale em **Mais → Atualizar → Arquivo ZIP**. O instalador registra um timer de reinício que fica desativado até uma solicitação explícita. Instalar a atualização não reinicia o Linux. Consulte [o guia](vps/docs/ATUALIZACAO-2.0.45.md).

## Atualização 2.0.44 — Busca e histórico do APT

Atualize em **Mais → Atualizar → Arquivo ZIP**. Depois, abra **Dependências** para buscar, filtrar e consultar o histórico. O histórico é salvo no servidor e começa a ser registrado após a atualização. Consulte [o guia](vps/docs/ATUALIZACAO-2.0.44.md).

## Atualização 2.0.43 — Serviços e pacotes

Atualize em **Mais → Atualizar → Arquivo ZIP**. Em **Serviços** consulte ou controle unidades suportadas. Em **Dependências** instale ou remova pacotes do catálogo, com acompanhamento do APT. A atualização não instala novos componentes por conta própria. Consulte o [guia de administração](vps/docs/ATUALIZACAO-2.0.43.md).

## Atualização 2.0.42 — Publicação em uma janela

Atualize em **Mais → Atualizar → Arquivo ZIP**. Para publicar conteúdo, use **Projetos → Publicação e domínio → Adicionar ZIP**. O ZIP do site não deve ser enviado ao atualizador do painel. Confira o [novo fluxo](vps/docs/ATUALIZACAO-2.0.42.md).

## Atualização 2.0.41 — Dependências

Atualize em **Mais → Atualizar → Arquivo ZIP**. Depois, abra **Mais → Dependências**. Atualizar o painel não instala os pacotes do catálogo. Cada instalação exige confirmação. Consulte o [guia de dependências](vps/docs/ATUALIZACAO-2.0.41.md).

## Atualização 2.0.40 — Assistente de hospedagem e DNS

Instale em **Mais → Atualizar → Arquivo ZIP**. Configure a chave Spaceship com leitura de domínios e leitura/escrita de DNS. Em **Projetos → Novo projeto**, confirme o IPv4 público fixo no formulário. O painel não muda automaticamente o domínio raiz, nameservers ou projetos existentes. Consulte o [guia de publicação](vps/docs/ATUALIZACAO-2.0.40.md).

## Atualização 2.0.39 — Pop-ups e diagnóstico

Atualize pelo menu **Mais → Atualizar → Arquivo ZIP** no celular. A escrita temporária fica em **Arquivos → Informações → Escrita temporária**. Não é necessário refazer configurações de DNS ou permissões.

## Atualização 2.0.38 — Navegação no celular

Na 2.0.37, instale o ZIP em **Atualizar → Arquivo ZIP**. Na 2.0.38, as próximas atualizações ficam em **Mais → Atualizar** e Domínios ganha acesso direto na barra inferior.

## Atualização 2.0.37 — Domínios

Na 2.0.37, use **Mais → Domínios** no celular. A partir da 2.0.38, use **Domínios** na barra inferior. Para abrir o catálogo, a chave Spaceship precisa de `domains:read`. Os redirecionamentos usam um novo módulo isolado do helper Nginx, instalado automaticamente pelo pacote. Consulte [escopos, diagnóstico e HTTPS no guia](vps/docs/ATUALIZACAO-2.0.37.md).

## Atualização 2.0.36 — Projetos e Ficha técnica

Após atualizar o painel, abra **Projetos → projeto → Ficha técnica**. A versão e o tamanho vêm da leitura da VPS, sem confundir configuração Nginx com disponibilidade pública. Atualização e backups de código do IguatamaOnline continuam isolados da atualização do painel. Consulte [o guia da 2.0.36](vps/docs/ATUALIZACAO-2.0.36.md).

## Atualização 2.0.35 — Inventário de backups por projeto

Após atualizar o painel, abra Projetos → projeto → Backups e recuperação. Para projetos criados pelo AL Sistemas, a cópia criptografada cobre apenas `public/`, e a verificação SHA-256 confere o arquivo criptografado frente ao manifesto local. A confirmação não testa recuperação nem substitui cópia externa. O IguatamaOnline mantém seu backup privado de código na Manutenção AWS. Banco de dados e uploads exigem backups independentes. Não habilite permissões globais para fazer a verificação funcionar. Consulte `vps/docs/ATUALIZACAO-2.0.35.md`.

## Atualização 2.0.34 — Logs e erros de projetos

Novo leitor restrito de logs de projeto, somente leitura. Após instalar, abra Projetos → seu projeto → Logs e erros. Se aparecer “nenhum log” ou “sem permissão”, não altere permissões globais de `/var/log` nem do PHP; configure um log dedicado por vhost de maneira independente e consciente. O recurso não lê logs globais, não garante ocultar todos os dados sensíveis e não verifica disponibilidade pública. Veja `vps/docs/ATUALIZACAO-2.0.34.md`.

## Atualização 2.0.33 — Centro de Projetos

Atualização do núcleo e interface do AL Sistemas, sem necessidade de mudanças nos diretórios de hospedagem. Confirme backup/snapshot recuperável e acesso SSH antes da instalação. Depois de atualizar, abra Projetos → projeto e teste as páginas Diagnóstico e Histórico. Um teste HTTP não garante que o site esteja disponível pela Internet. Os novos recursos são de leitura; operações de escrita e backup seguem fluxos anteriores. Veja `vps/docs/ATUALIZACAO-2.0.33.md`.

## Atualização 2.0.32 — Arquivos em tela única

A partir da 2.0.31, não muda o conjunto de scripts administrativos. A 2.0.32 reorganiza a seleção de arquivos elegíveis e usuário PHP no próprio explorador. O servidor continua verificando o perfil na API de permissões e bloqueia escrita fora dos arquivos selecionados. Depois da atualização, confirme a versão em `/api/health`, teste a seleção e a restauração no projeto autorizado. Faça backup/snapshot antes de conceder escrita em produção.

## Atualização 2.0.31 — Permissões tipo Explorer

Antes de instalar, guarde backup e confirme acesso SSH para recuperação, pois alterações de `chmod` podem bloquear Nginx ou PHP. A atualização do painel deve copiar também `project_explorer.py` para `/usr/local/libexec/` (incluído no `instalar.sh`), com proprietário root e modo 0700. Os endpoints ficam protegidos pela sessão e pelo CSRF. O explorador lista **metadados** e permite apenas mudar modos Unix em arquivos/pastas permitidos; ele não abre, edita, move, remove nem faz download do conteúdo. A pasta de testes `iguatama-teste` é bloqueada.

Após a instalação, abra Projetos → projeto → Permissões, entre numa pasta, toque em um arquivo e teste inicialmente uma mudança não destrutiva. Confira que o site continua funcionando. A suíte de testes roda sem alterar a VPS real.

## Atualização 2.0.30

Aplicar somente depois de verificar o ZIP, ter backup e confirmar acesso de recuperação. Usa o atualizador normal do AL Sistemas. As mudanças desta versão são no frontend da manutenção AWS; não alteram serviços ou permissões da EC2 até a instalação. O gerenciador de permissões da 2.0.29 permanece no backend. Para validar, entre em Projetos → IguatamaOnline → Manutenção na AWS e verifique os quatro pop-ups ⓘ e o histórico legível.

> **Núcleo VPS 2.0.29:** use o instalador da nova versão. O cadastro de arquivos e permissões agora é feito diretamente pelo painel. Consulte `vps/docs/ATUALIZACAO-2.0.29.md`.

> **Núcleo VPS 2.0.28:** leia `tutorial-instalacao.html` e `vps/docs/ATUALIZACAO-2.0.28.md`. Este DEPLOY contém orientações do legado; não use como substituto do instalador VPS.

# 🚀 Deploy legado — Render (Backend) + Vercel (Frontend)

> **DOCUMENTAÇÃO HISTÓRICA.** Não use este procedimento para instalar o painel de VPS. Consulte `vps/docs/INSTALACAO.md`. O script `backend/seed.js` é destrutivo e exige confirmação explícita; não o utilize em banco de dados com conteúdo.

## Arquitetura

```
GitHub ──push──► Render  → Backend Node.js  (api.seudominio.com)
                 Vercel  → Frontend Vite     (seudominio.com)
                 MongoDB Atlas               (banco de dados)
                 Cloudinary                  (upload de imagens)
                 Redis Upstash (opcional)    (cache)
```

---

## 1. Pré-requisitos — crie as contas antes de começar

| Serviço | URL | Plano gratuito |
|---|---|---|
| MongoDB Atlas | https://cloud.mongodb.com | ✅ 512 MB |
| Cloudinary | https://cloudinary.com | ✅ 25 créditos/mês |
| Render | https://render.com | ✅ (spin-down após 15 min sem acesso) |
| Vercel | https://vercel.com | ✅ ilimitado para projetos pessoais |
| Redis Upstash | https://upstash.com | ✅ 10.000 req/dia — **opcional** |

---

## 2. MongoDB Atlas

1. Crie uma conta → **Create a cluster** → escolha o tier gratuito (M0).
2. Em **Database Access**: crie um usuário com a role `readWrite`.
3. Em **Network Access**: adicione `0.0.0.0/0` (necessário para o Render acessar).
4. Clique em **Connect → Drivers** e copie a connection string:
   ```
   mongodb+srv://<usuario>:<senha>@cluster0.xxxxx.mongodb.net/al-sistemas?retryWrites=true&w=majority
   ```
5. Guarde essa string — ela será o valor de `MONGO_URI`.

---

## 3. Backend no Render

### 3.1 Criar o serviço

1. Acesse https://dashboard.render.com → **New → Web Service**
2. Conecte seu repositório GitHub e selecione-o
3. Preencha os campos:

| Campo | Valor |
|---|---|
| Name | `alsistemas-backend` |
| **Root Directory** | `backend` |
| Runtime | Node |
| Build Command | `npm ci --omit=dev` |
| Start Command | `node src/server.js` |
| Plan | Free |

> ⚡ Se preferir usar o `render.yaml` incluso no projeto:
> No dashboard → **New → Blueprint** → selecione o repositório.
> O Render lerá o arquivo automaticamente e pré-preencherá os campos.

### 3.2 Variáveis de ambiente

Na aba **Environment**, adicione todas estas variáveis:

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://<usuario>:<senha>@cluster0.xxxxx.mongodb.net/al-sistemas?retryWrites=true&w=majority
JWT_SECRET=<gere com: openssl rand -hex 64>
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=<seu cloud name>
CLOUDINARY_API_KEY=<sua api key>
CLOUDINARY_API_SECRET=<sua api secret>
FRONTEND_URL=https://SEU-PROJETO.vercel.app
AI_PROVIDER=groq
GROQ_API_KEY=<sua key em console.groq.com>
AI_MAX_TOKENS=1000
GITHUB_TOKEN=<seu Personal Access Token>
GITHUB_USER=<seu usuário GitHub>
```

> **Redis é opcional.** O backend detecta automaticamente a ausência do Redis
> e usa cache em memória como fallback. Se quiser Redis real (persiste entre
> restarts), crie um banco gratuito no Upstash e adicione `REDIS_URL`.

### 3.3 Health check e auto-deploy

- O Render monitora `/api/health` automaticamente — se falhar, reverte o deploy.
- Marque **Auto-Deploy** para que cada push na `main` atualize o backend.
- Anote a URL gerada, ex: `https://alsistemas-backend.onrender.com`

---

## 4. Frontend no Vercel

### 4.1 Importar o projeto

1. Acesse https://vercel.com/new
2. Importe o mesmo repositório GitHub
3. Configure:

| Campo | Valor |
|---|---|
| **Root Directory** | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

### 4.2 Variáveis de ambiente

Em **Settings → Environment Variables**:

```env
VITE_API_URL=https://alsistemas-backend.onrender.com/api
VITE_APP_NAME=AL Sistemas
VITE_APP_TAGLINE=Painel de Gerenciamento
VITE_APP_VERSION=2.0.0
VITE_APP_ENV=production
VITE_MODULE_PORTAL=true
VITE_MODULE_GITHUB=true
```

> ⚠️ Variáveis `VITE_*` são embutidas no bundle durante o build.
> Qualquer alteração requer um **redeploy** (Deployments → Redeploy).

### 4.3 Roteamento SPA

O arquivo `frontend/vercel.json` já está configurado:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
Não altere — ele garante que rotas como `/admin/dashboard` funcionem
após recarregar a página.

---

## 5. Conectar backend ↔ frontend (CORS)

Após saber a URL do Vercel, atualize no Render:
```
FRONTEND_URL=https://SEU-PROJETO.vercel.app
```
O backend usa essa variável para liberar o CORS. Sem isso, o frontend
receberá erro de bloqueio nas requisições.

---

## 6. Primeiro acesso — criar o usuário admin

Após o backend estar no ar, crie o admin via seed:

**Pelo Shell do Render** (aba Shell no serviço):
```bash
## NÃO executar em banco existente: o seed antigo apaga coleções.
## Consulte backend/seed.js e faça backup e revisão antes de qualquer uso.
```

Ou adicione as variáveis no dashboard e rode:
```bash
node seed.js
```

Depois acesse `/login` no frontend e entre com as credenciais criadas.

---

## 7. Migrations do banco (se necessário)

Para aplicar migrations pendentes pelo Shell do Render:
```bash
npm run migrate
npm run migrate:status   # verifica quais foram aplicadas
```

---

## 8. Otimizações de performance

### Backend (Render)

| O que | Solução |
|---|---|
| Evitar spin-down no plano free | Configure um ping a cada 14 min via [UptimeRobot](https://uptimerobot.com) apontando para `/api/health` |
| Cache persistente entre restarts | Adicione `REDIS_URL` do Upstash |
| Compressão Brotli | Já ativo via `compression()` — sem configuração adicional |
| Logs estruturados | Pino já configurado — visíveis na aba Logs do Render |

### Frontend (Vercel)

| O que | Solução |
|---|---|
| Cache de assets estáticos | Vite gera hashes nos nomes dos arquivos; Vercel aplica `max-age=31536000` automaticamente |
| Service Worker | `public/sw.js` com versionamento automático por build |
| Build mais rápido | Vite já usa esbuild internamente — sem configuração adicional |

---

## 9. Domínio personalizado

**Vercel:** Settings → Domains → Add Domain
**Render:** Settings → Custom Domains → Add Custom Domain

Ambos emitem certificado TLS (HTTPS) automaticamente via Let's Encrypt.
Após configurar domínio no Vercel, atualize `FRONTEND_URL` no Render com o novo domínio.

---

## 10. Checklist antes de ir a produção

- [ ] `JWT_SECRET` gerado com `openssl rand -hex 64` (mínimo 16 chars, validado pelo Zod)
- [ ] `ADMIN_SENHA` é uma senha forte e única
- [ ] Nenhum `.env` real está commitado no repositório (verificar com `git status`)
- [ ] `FRONTEND_URL` no Render aponta para a URL real do Vercel
- [ ] `VITE_API_URL` no Vercel aponta para a URL real do Render + `/api`
- [ ] MongoDB Network Access configurado (0.0.0.0/0 ou IPs fixos do Render)
- [ ] Auto-Deploy habilitado no Render e no Vercel
