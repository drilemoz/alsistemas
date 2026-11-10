**Novo na 2.0.31:** tela **Projetos → Permissões** transformada em explorador de pastas/arquivos com botões de propriedades e grade `r/w/x` para dono, grupo e outros. Mantém ferramenta de escrita PHP temporária na seção avançada; não altera conteúdo de arquivos. Veja `vps/docs/ATUALIZACAO-2.0.31.md`.

**Novo na 2.0.30:** telas de Permissões, Atualizações, Backups e Histórico da manutenção AWS reorganizadas, com ícones, cores moderadas, pop-ups ⓘ e textos curtos. Permissões têm apenas um atalho ao gerenciador; histórico mostra eventos legíveis e mantém relatório JSON para copiar/baixar. Veja `vps/docs/ATUALIZACAO-2.0.30.md`.

**Novo na 2.0.29:** o gerente de permissões agora é configurável pelo próprio painel. Selecione projeto → Permissões do projeto → arquivos → usuário PHP → Salvar seleção → Liberar escrita. IguatamaOnline: Manutenção na AWS → Permissões. Consulte `vps/docs/ATUALIZACAO-2.0.29.md`.

**Novo na 2.0.28:** tela de projetos simplificada (três cartões), Ficha técnica ao lado do nome, Diretório em pop-up e diagnóstico com estados claros/ajuda. Permissões em outros projetos aceitam perfis de arquivos pré-aprovados, sem edição livre de pastas. Consulte `vps/docs/ATUALIZACAO-2.0.28.md`.

**Novo na 2.0.26:** corrigido o login com senha salva no navegador para dispositivos confiáveis: o campo TOTP fica desativado quando oculto e o servidor ignora códigos TOTP antigos enviados nesse caso. A senha correta continua obrigatória; em dispositivos não confiáveis o TOTP novo continua obrigatório. Veja `vps/docs/ATUALIZACAO-2.0.26.md`.

**Novo na 2.0.25:** após o login, a sessão autenticada autoriza todas as ações do painel VPS sem solicitar novamente senha administrativa ou TOTP. Confirmações de ações e a frase secreta de criptografia de backups permanecem. Permanecem proteção CSRF, verificação de origem, escopos restritos, auditoria e travas de propriedade de diretórios.

**Histórico da 2.0.24 (superado pela 2.0.25):** as ações críticas do IguatamaOnline deixavam de pedir a senha novamente (mantinham sessão + CSRF + TOTP novo); a vistoria de permissões informa o proprietário real e impede solicitar TOTP quando a correção está bloqueada. **A propriedade da pasta na EC2 ainda deve ser conferida por SSH antes de qualquer mudança root.**

**Novo na 2.0.22:** ajustes visuais no login e nas páginas de projeto, com botão **Mostrar** alinhado corretamente, seletor de ZIP com rótulo personalizado e ficha técnica do projeto em pop-up. A tela interna do projeto ganhou visual mais estiloso com resumo rápido e atalhos melhores. O relatório de falha da atualização do painel agora tenta reunir o máximo de contexto disponível, incluindo versão anterior, arquivo/Release, snapshot de backup, diagnóstico de saúde e detalhes do instalador/reversão quando existirem. Veja `vps/docs/ATUALIZACAO-2.0.22.md`.

**Novo na 2.0.20:** o módulo Projetos usa páginas navegáveis em vez de janelas de detalhes. Cada projeto possui Visão geral e detalhes técnicos opcionais. O IguatamaOnline dispõe de página Manutenção na AWS com cinco categorias independentes: Diagnóstico, Permissões, Atualizações, Backups e Logs/relatórios, além da página Andamento. Na versão original, ações críticas pediam senha e TOTP na confirmação; isso foi removido na 2.0.25. Navegação pelo histórico do navegador e links internos. Nenhum privilégio novo foi concedido aos demais projetos externos e o backend de instalação/segurança permanece restrito. Veja `vps/docs/ATUALIZACAO-2.0.20.md`.

**Novo na 2.0.19:** na aba **Atualizações**, o botão `?` abre as novidades em pop-up, com outro pop-up para o README. Os botões **GitHub**, **Arquivo ZIP** e **Andamento** aparecem lado a lado em dispositivos móveis. Quando uma atualização falha, o acompanhamento oferece relatório de erro em janela própria, com copiar e baixar TXT. Corrigido o Nginx para aceitar ZIPs de até 32 MiB apenas nas duas rotas autenticadas, mantendo 64 KiB nas demais; upgrades do núcleo também migrarão o vhost já gerenciado. Falhas de saúde passam a registrar um diagnóstico resumido da versão, serviço e endpoint. Nenhuma alteração foi executada na EC2; veja `vps/docs/ATUALIZACAO-2.0.19.md`.

# ⚙️ AL Sistemas — Núcleo de Hospedagem VPS 2.0.31 + legado preservado

A versão **2.0.16** adicionou gerenciamento DNS controlado à Spaceship: criar registros A, CNAME e TXT; editar apenas o TTL de registros personalizados; e excluir registros personalizados não protegidos. Antes de escrever, o servidor consulta a zona novamente e valida os registros; requer login, token CSRF e confirmação; a senha adicional foi removida na 2.0.25. Nomes críticos (`@`, `painel`, `www`, `mail`, `migrar` e outros) ficam bloqueados. A versão 2.0.16 **não** alterava automaticamente DNS ao criar projetos, nem permite alterar valores de registros existentes. A API exige `dnsrecords:read` e `dnsrecords:write` para essas ações. Nenhuma mudança DNS foi executada em produção durante o desenvolvimento.

**Novo na 2.0.18:** em **Projetos → IguatamaOnline → Manutenção na AWS**, vistoria restrita do código, estimativa da conta PHP padrão, correção de escrita temporária exclusivamente para `VERSION`, `app/updater.php` e `public/admin.php` com registro das permissões originais, restauração, backup privado de código, atualização por ZIP ou Release pública do GitHub, status persistente e reversão de arquivos. Naquela versão as operações críticas exigiam senha administrativa e TOTP novo, exigência removida na 2.0.25; não modificam o banco ou os uploads e recusam diretórios inseguros. **A presença de PHP-FPM em pool específico e a segurança do atualizador PHP devem ser verificadas no servidor real; nenhuma correção foi aplicada à EC2**. A atualização do projeto NÃO deve ser confundida com a atualização do AL Sistemas. Ver `vps/docs/ATUALIZACAO-2.0.18.md`.

**Na 2.0.17:** atualizações pelo GitHub ou por ZIP local via painel, com pop-up de progresso, backup, verificação de saúde, rollback e botão de recarregar quando concluído. O envio aceita até 32 MiB, exige sessão e CSRF (a senha extra foi removida na 2.0.25). ZIP local não possui prova criptográfica da identidade do autor, portanto verifique sua procedência antes de instalar. O primeiro uso exige que o painel já esteja atualizado para a 2.0.17; veja `vps/docs/ATUALIZACAO-2.0.17.md`.


A versão 2.0.15 reorganiza a Central de APIs: Spaceship em cartão compacto, gerenciamento de credenciais em janela própria, consulta DNS em modal com ícones, status claro de configuração e cópia segura dos valores. Mantém consultas somente leitura; credenciais já salvas não são expostas nem precisam ser digitadas novamente. As melhorias de auditoria, serviços, dependências, dispositivos e notas de atualizações da 2.0.13 continuam presentes. O atualizador usa sessão autenticada, proteção CSRF, SHA-256 e backup (senha extra removida na 2.0.25); a publicação pelo GitHub Actions depende de permissões no repositório.

**Repositório padrão de atualizações:** `drilemoz/alsistemas` (sem chave Ed25519; a Release depende da execução bem-sucedida do workflow do GitHub Actions).

**Instalação rápida em nova VPS Ubuntu 24.04:** extraia os scripts `inicio-termux.sh` e `bootstrap-vps.sh` do ZIP na pasta do Termux; execute `bash inicio-termux.sh --host IP --key ~/.ssh/CHAVE.pem`. O script transfere o ZIP, valida o plano e pede confirmação antes do `sudo`. Leia o [tutorial HTML](tutorial-instalacao.html), seção Instalação rápida.

**Atualização da VPS existente:** use o mesmo `instalar.sh` após extrair o ZIP na VPS; em host com sites preexistentes, `--allow-existing-host`. Não executar na EC2 sem inspeção/snapshot quando necessário.

Stack do legado, separado do núcleo VPS: **React + Vite + Tailwind** (frontend), **Node.js + Express + MongoDB + Cloudinary** (backend).

---

> **Guia de atualização 2.0.18:** [vps/docs/ATUALIZACAO-2.0.18.md](vps/docs/ATUALIZACAO-2.0.18.md).

> **Guia de atualização 2.0.17:** [vps/docs/ATUALIZACAO-2.0.17.md](vps/docs/ATUALIZACAO-2.0.17.md).

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
- **Dependências:** inventário real com `dpkg-query` e instalação opcional de um catálogo limitado (PHP 8.3 cURL, mbstring, XML, MySQL, ZIP, GD, Intl e Composer) pelo serviço dedicado `alsistemas-package-installer.service`, exigindo apenas sessão autenticada e CSRF desde a 2.0.25. Não executa comandos livres, nem instala npm/pip arbitrários.
- **GitHub:** repositório padrão `drilemoz/alsistemas`, aviso amigável para ausência de Releases e workflow automático que publica Releases com SHA-256 quando VERSION muda. Não são necessários Secrets de assinatura.
- **Testes:** validações locais de SHA-256 e adulteração, código de retorno do verificador Nginx, lista de pacotes, esquemas e verificações de segurança.

Para esta versão, consulte `vps/docs/ATUALIZACAO-2.0.17.md` e `vps/docs/PACOTES.md`. O arquivo `RELEASES-ASSINADAS.md` é histórico e não descreve o mecanismo atual. Não execute o atualizador em produção sem testar uma Release e seu SHA-256 em ambiente controlado.


### Melhorias da 2.0.15

- Central de APIs em lista compacta, com modais independentes Gerenciar Spaceship e Testar DNS.
- Consulta DNS com cartões, ícones por tipo, TTL, cópia de valor e status da sessão.
- Credenciais salvas continuam armazenadas na VPS; os campos de substituição ficam intencionalmente vazios.
Auditoria com ícones, filtros e correção de valores indefinidos; cartões visuais para serviços, dependências e dispositivos. A busca de atualização lê notas da Release, seção correspondente do CHANGELOG e README da tag, quando disponíveis. A integração Spaceship continua somente leitura; edição DNS e provisionamento automático ainda não foram implementados.

### Integração Spaceship — interface 2.0.15

Em **APIs e Integrações**, selecione **Gerenciar** para consultar o estado das credenciais, substituí-las ou removê-las. Quando configurada, selecione **Testar DNS** para abrir uma janela de consulta por domínio, com registros organizados por tipo, ícones e botão para copiar valores. Campos vazios na janela Gerenciar **não** indicam perda de credenciais: o segredo criptografado não retorna ao navegador. Não há ações de criação/edição/exclusão de DNS nesta versão.

### Gerenciamento DNS — 2.0.17

Abra **APIs e Integrações → Testar DNS**, consulte o domínio e use **Adicionar DNS**, **Editar TTL** ou **Excluir** nos registros A/CNAME/TXT personalizados. O servidor recusa edições se a zona mudou desde a consulta, se houver mais de 500 registros ou se o nome pertencer à lista de nomes protegidos. Toda alteração exige senha novamente. A chamada é enviada com `force: false`; 204 significa aceitação pela API, não propagação imediata. Para alterar o valor de um registro existente, utilize a Spaceship diretamente enquanto não houver um fluxo de substituição seguro.
