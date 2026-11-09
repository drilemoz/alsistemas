# Diagnóstico do ZIP original (2.0.1) e evolução até 2.0.4

Origem: `alsistemas-20261109-012120-main.zip` (288 entradas; ~2,76 MiB descompactados).

## Inventário do código observado

- `backend/` na raiz: implementação Node.js/Express/Mongoose principal com 70 arquivos em `src/`, rotas de notícia, usuários, GitHub, projetos, backup, MongoDB, Cloudinary e jobs RSS. Tem `package.json` / `package-lock.json`, Jest e migrations.
- `alsistemas/`: frontend React 18/Vite 5, rotas e telas admin, serviços por domínio, temas; `package.json` / lockfile. Também tem uma cópia **parcial** em `alsistemas/backend/` (8 arquivos de código), com dezenas de importações ausentes. O backend raiz é a referência correta.
- `README.md` e `DEPLOY.md` descrevem versões antigas Render/Vercel/MongoDB/Cloudinary e caminhos inconsistentes com a estrutura real. São documentação histórica, não instruções de VPS.

## Achados prioritários

1. O legado é centrado em MongoDB e integrações externas; não gerencia Nginx, PHP-FPM, systemd, SSH, backup de site ou sistema operacional.
2. O `backend/seed.js` recriava coleções por exclusão e tinha fallback `admin123`, além de registrar a senha em log. Foi limitado por confirmação explícita, senha obrigatória e log sem senha, mas **não deve ser usado em ambiente de produção existente**.
3. O plugin Mongoose de serialização era registrado no corpo de `backend/src/server.js`, após a avaliação dos modelos ESM; passou para import inicial de `src/plugins/mongoosePlugin.js`.
4. O backend e frontend legados estavam em versões divergentes. Núcleo, lockfiles, exemplo de versão e changelog foram sincronizados em 2.0.1 para este pacote.
5. `backend/` usa cookies HttpOnly, mas não havia proteção CSRF/TOTP suficiente para usar suas rotas diretamente como painel Linux de root. Por isso não foram ligados ao executor privilegiado.
6. Algumas páginas antigas mostram módulos e APIs remotas, não operações reais sobre uma VPS. Nova interface exibe apenas operações ligadas a endpoints implementados.

## Arquitetura adotada nesta etapa

O núcleo `vps/` foi adicionado sem remover o legado. Ele usa `node:http` nativo e arquivos JSON locais, evitando dependências MongoDB e npm de runtime. A escolha de não ligar o antigo Express à operação privilegiada foi deliberada por isolamento de segurança e leveza. A migração de funções úteis do legado para o núcleo fica para as próximas etapas, após avaliação de autenticação, schemas, recursos e testes. Não há alegação de que o legado inteiro esteja compilável ou migrado.

## Testes feitos neste ambiente

- `node --check` no núcleo e no backend corrigido.
- `npm test` no núcleo: TOTP, scrypt, setup, login, logout, CSRF, rota de tarefas não autorizada.
- `python3 -m unittest`: validação de nomes e domínios, criação de projeto em diretório temporário, não sobrescrita e rollback de Nginx simulado.
- `bash -n` no instalador.
- Integridade do pacote ZIP após geração.

**Não foram testados nesta etapa:** `apt`, instalação de pacotes, systemd, sudoers real, Nginx real, Certbot, DNS, UFW, Chrome Android, t3.small AWS ou backup/restore. As métricas do painel são reais quando executado em Linux, mas nenhum consumo de RAM da aplicação em t3.small foi medido.

## Etapa 2.0.2

A estrutura original foi mantida. O núcleo VPS ganhou `set_site_state` com verificação explícita de vhosts e rollback; o instalador protege links Nginx e preserva origens HTTPS durante atualizações; novas regressões ampliam a cobertura do executor. Ainda não há alegação de instalação validada numa VPS real.


## Etapa 2.0.4

Adicionou leitura de status `systemctl show` da allowlist, `nginx -t` sob demanda e snapshot GPG do público de projetos que **o AL Sistemas criou**, sem se intrometer em sites externos. Os metadados de backup não são backup de banco ou de host. O projeto legado permanece intacto.
