# ⚙️ AL Sistemas — Núcleo de Hospedagem VPS 2.0.12 + legado preservado

A versão 2.0.12 simplifica o atualizador: não há SHA-256 nem chave pública na VPS. A instalação ocorre com sessão autenticada, CSRF, senha, ZIP de Release e SHA-256, com backup e tentativa de rollback. O GitHub Actions gera automaticamente ZIP e manifesto quando o arquivo VERSION muda em main. Mantém a Central de APIs/Spaceship, gestão de projetos, serviços e painel móvel.

**Repositório padrão de atualizações:** `drilemoz/alsistemas` (sem chave de assinatura; publica Releases automaticamente pela workflow).

**Instalação rápida em nova VPS Ubuntu 24.04:** extraia os scripts `inicio-termux.sh` e `bootstrap-vps.sh` do ZIP na pasta do Termux; execute `bash inicio-termux.sh --host IP --key ~/.ssh/CHAVE.pem`. O script transfere o ZIP, valida o plano e pede confirmação antes do `sudo`. Leia o [tutorial HTML](tutorial-instalacao.html), seção Instalação rápida.

**Atualização da VPS existente:** use o mesmo `instalar.sh` após extrair o ZIP na VPS; em host com sites preexistentes, `--allow-existing-host`. Não executar na EC2 sem inspeção/snapshot quando necessário.

Stack do legado, separado do núcleo VPS: **React + Vite + Tailwind** (frontend), **Node.js + Express + MongoDB + Cloudinary** (backend).

---

> **Guia de atualização 2.0.12:** [vps/docs/ATUALIZACAO-2.0.12.md](vps/docs/ATUALIZACAO-2.0.12.md).

> **Histórico 2.0.4:** leia [vps/docs/ATUALIZACAO-2.0.4.md](vps/docs/ATUALIZACAO-2.0.4.md).

> **Tutorial completo e offline:** [tutorial-instalacao.html](tutorial-instalacao.html) na pasta principal.

> **Histórico 2.0.3:** leia [vps/docs/ATUALIZACAO-2.0.3.md](vps/docs/ATUALIZACAO-2.0.3.md).

> **Histórico 2.0.2:** leia [vps/docs/ATUALIZACAO-2.0.2.md](vps/docs/ATUALIZACAO-2.0.2.md).

> **Instalação segura:** leia [vps/docs/INSTALACAO.md](vps/docs/INSTALACAO.md) antes de executar qualquer comando na VPS. O instalador não é executado automaticamente.

> **Segurança:** o `backend/seed.js` legado era destrutivo e continha senha padrão. Na versão 2.0.1 ele exige confirmação explícita e senha segura; **não execute em banco de produção**.

## 🌐 URLs do sistema legado (não usadas pelo novo núcleo VPS)

| Serviço   | URL                                         |
|-----------|---------------------------------------------|
| Frontend  | https://alsistemas.vercel.app               |
| Backend   | https://alsistemas.onrender.com             |
| API       | https://alsistemas.onrender.com/api         |
| APK       | GitHub → Actions → Artifacts                |

---

## ✨ Funcionalidades

- **Painel admin** com multi-tema (light, dark, ocean, rose)
- **Gestão de notícias** com editor Markdown, categorias e badges coloridos
- **Módulo GitHub** — visualização de repositórios e commits em tempo real
- **Projetos locais** — sync e acompanhamento de projetos internos
- **IA Assistant** — integração com Groq (llama-3.3) para análise de conteúdo
- **RSS Importer** — importação automática de feeds com scheduler
- **Infraestrutura** — monitoramento de MongoDB, Cloudinary e Redis pelo painel
- **Backup & Restore** — exportação e restauração de dados via interface
- **Audit Log** — registro de todas as ações dos usuários
- **Newsletter** — gestão de assinantes
- **App Android** — build via Capacitor + GitHub Actions

---

## 📁 Estrutura do projeto

```
alsistemas/
├── backend/          → Servidor Node.js (Express + MongoDB + Cloudinary)
│   ├── .env          → Credenciais (não commitar)
│   ├── render.yaml   → Blueprint de deploy no Render (vars já preenchidas)
│   ├── seed.js       → Cria admin e dados iniciais
│   └── src/
│       ├── server.js
│       ├── config/   → MongoDB, Cloudinary, env (Zod)
│       ├── models/   → Mongoose schemas
│       ├── routes/   → auth, noticias, categorias, fontes, upload, extras…
│       ├── middleware/ → auth JWT, upload Cloudinary, audit log…
│       └── utils/    → cache Redis, logger pino
├── frontend/         → React + Vite + Tailwind
│   ├── .env          → VITE_API_URL (aponta para o Render)
│   ├── capacitor.config.ts → Config do app Android
│   └── src/
│       ├── services/ → cliente HTTP centralizado + módulos por domínio
│       ├── context/  → AuthContext · ThemeContext (multi-skin)
│       ├── themes/   → tokens.js + dark / light / ocean / rose
│       ├── styles/   → base.css · public.css · admin.css
│       ├── components/admin/ui/ → AdminIcon (50+ SVGs) · ForcaSenha
│       ├── pages/    → Home, Login, Eventos, HorárioÔnibus…
│       └── pages/admin/ → Dashboard, Noticias, Categorias, GitHub, Projetos…
└── render.yaml       → Deploy com 1 clique no Render
```

---

## 🚀 Rodando local (desenvolvimento)

### Pré-requisitos

- Node.js v18+
- Conta no [MongoDB Atlas](https://cloud.mongodb.com) (gratuita)
- Conta no [Cloudinary](https://cloudinary.com) (gratuita)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # preencha com suas credenciais
npm run seed           # cria admin + dados iniciais
npm run dev            # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
# Para dev local: edite .env e troque VITE_API_URL por http://localhost:3001/api
npm run dev            # http://localhost:5173
```

### Credenciais padrão

- **Não há credenciais padrão no novo painel.** O instalador fornece um código temporário de configuração, seguido de senha forte e TOTP.

---

## ☁️ Deploy em produção

### Backend — Render

Use o `render.yaml` incluído na raiz do repositório:

1. No Render: **New → Blueprint** → conecte o repositório
2. Clique em **Apply** — todas as variáveis já estão preenchidas

Ou configure manualmente no painel **Environment**:

| Variável                | Valor                                      |
|-------------------------|--------------------------------------------|
| `NODE_ENV`              | `production`                               |
| `FRONTEND_URL`          | `https://alsistemas.vercel.app`            |
| `MONGO_URI`             | string de conexão do MongoDB Atlas         |
| `JWT_SECRET`            | chave secreta longa (mín. 64 caracteres)   |
| `CLOUDINARY_CLOUD_NAME` | cloud name do Cloudinary                   |
| `CLOUDINARY_API_KEY`    | API key do Cloudinary                      |
| `CLOUDINARY_API_SECRET` | API secret do Cloudinary                   |
| `GROQ_API_KEY`          | chave da API Groq                          |
| `GITHUB_TOKEN`          | Personal Access Token do GitHub            |

### Frontend — Vercel

| Variável       | Valor                                       |
|----------------|---------------------------------------------|
| `VITE_API_URL` | `https://alsistemas.onrender.com/api`       |

### APK Android

O APK debug é gerado automaticamente via GitHub Actions a cada push na `main`.  
Consulte o [CAPACITOR.md](./CAPACITOR.md) para build manual.

---

## ⚠️ Plano gratuito do Render

O serviço "adormece" após 15 minutos sem uso — a primeira requisição pode levar 30–60 s.  
Use o [UptimeRobot](https://uptimerobot.com) para pingar `/api/health` a cada 14 minutos e manter sempre ativo.

## Recursos de versões anteriores preservados

- **Nginx:** unit systemd `alsistemas-nginx-check.service` executa `/usr/sbin/nginx -t` fora do isolamento de montagem do backend, sem conceder privilégios adicionais ao Node. A operação continua somente leitura em relação aos arquivos de configuração.
- **Dependências:** inventário real com `dpkg-query` e instalação opcional de um catálogo limitado (PHP 8.3 cURL, mbstring, XML, MySQL, ZIP, GD, Intl e Composer) pelo serviço dedicado `alsistemas-package-installer.service`, exigindo senha e um TOTP novo. Não executa comandos livres, nem instala npm/pip arbitrários.
- **GitHub:** repositório padrão `drilemoz/alsistemas`, aviso amigável para ausência de Releases e workflow automático que publica Releases com SHA-256 quando VERSION muda. Não são necessários Secrets de assinatura.
- **Testes:** validações locais de SHA-256 e adulteração, código de retorno do verificador Nginx, lista de pacotes, esquemas e verificações de segurança.

Leia `vps/docs/RELEASES-ASSINADAS.md` e `vps/docs/PACOTES.md`. Não execute o atualizador em produção sem homologar uma Release com SHA-256 em uma VPS de teste.


### Correções da 2.0.12
A Central de APIs agora carrega o script no servidor (HTTP 200), usa o endpoint oficial da Spaceship e a paginação obrigatória. O tutorial de configuração pelo botão ? foi mantido e ganhou acesso direto ao API Manager. Provisionamento automático e escrita DNS ainda não foram implementados.
