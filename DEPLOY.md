> **Núcleo VPS 2.0.27:** leia `tutorial-instalacao.html` e `vps/docs/ATUALIZACAO-2.0.27.md`. Este DEPLOY contém orientações do legado; não use como substituto do instalador VPS.

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
