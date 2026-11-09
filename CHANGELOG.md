## 2.0.17 — Atualizador acompanhado e upload ZIP (09/11/2026)

- Atualizações pelo GitHub agora registram uma operação única com estados persistidos e progresso de download medido em bytes; a interface exibe janela de acompanhamento até a conclusão, falha ou reversão.
- Atualização alternativa por arquivo ZIP enviado do dispositivo, com confirmação por senha, limite de 32 MiB, verificação SHA-256 local, validação de estrutura e versão superior.
- O arquivo enviado passa por cópia restrita root-only antes da instalação; não são executados caminhos fornecidos pelo navegador.
- Backup anterior à instalação, espera da saúde da versão instalada, reversão de código, unidades systemd e helper em falha.
- Ao concluir, a interface mostra o botão **Atualizar página**. Progresso numérico aparece apenas quando há contagem real de bytes, não na instalação de tempo imprevisível.
- Persistência do identificador da operação na aba do navegador e acompanhamento após novo login, com aviso de falta de resposta prolongada.
- **Atenção:** SHA-256 de um arquivo local não autentica quem o produziu. Instale apenas ZIPs de origem verificada. A instalação na EC2 e os testes com reinicialização real ainda precisam de validação operacional.

## 2.0.16 — Escrita DNS controlada na Spaceship (09/11/2026)

- Gerenciamento de registros DNS A, CNAME e TXT com criação, alteração do TTL e exclusão de registros personalizados.
- Prévia por janela, confirmação e senha administrativa; sessões e CSRF obrigatórios.
- Proteção dos nomes essenciais da hospedagem, leitura de preflight, bloqueio contra mudanças concorrentes e zonas paginadas.
- Requisições PUT/DELETE no formato oficial da Spaceship, sem `force: true`.
- Registro de auditoria das operações sem expor API Key, API Secret ou valores de registros.
- Interface compatível com smartphone e tutorial `?` revisado. Não modifica DNS real nesta entrega.

## 2.0.15 — Projetos e sites navegáveis
- Cartões de projeto com ícones, detalhes acessíveis e links HTTPS para domínios identificados.
- Descoberta conservadora de domínios Nginx existentes em modo somente leitura, sem assumir gerenciamento de sites externos.
- Nenhuma mudança em DNS, arquivos ou permissões dos projetos existentes.

## 2.0.15 — Central de APIs em modais e consulta DNS visual (09/11/2026)

- Central de APIs apresenta integração Spaceship em cartão compacto com indicação confiável de credenciais configuradas.
- Modal próprio para cadastro, substituição e remoção da API Key e da API Secret; campos intencionalmente vazios e mensagem explícita de que as credenciais já estão salvas.
- Botões Gerenciar e Testar DNS independentes; consulta autorizada em uma segunda janela, com domínio validado, contagem, erros detalhados e estados de carregamento.
- Registros DNS organizados em cartões com ícones por tipo, nome, valor, TTL e ação para copiar valor, exibindo texto externo via `textContent` e sem HTML executável.
- Tutorial ? atualizado conforme novo fluxo; interface adaptável à tela do celular, mantendo os temas claro e escuro.
- API Spaceship preservada em somente leitura (`dnsrecords:read`); nenhuma operação DNS de escrita ou mudança no provisionamento de projetos.
- Mantidos mecanismos existentes de autenticação, criptografia, CSRF, atualização GitHub com SHA-256 e backup. Sem implantação direta na EC2.

## 2.0.13 — Auditoria, experiência mobile e notas de atualização (09/11/2026)

- Auditoria com ícones por evento, filtros de acesso/sistema, estados visuais e correção de registros `undefined` na gravação e na apresentação do histórico legado.
- Notificações transitórias desaparecem após sete segundos e ao mudar de módulo, sem perder mensagens de erro enquanto a aba não mudar.
- Cartões com ícones, nomes amigáveis e status para Nginx, PHP-FPM, MariaDB e AL Sistemas, na visão geral e em Serviços.
- Dependências com ícones, explicações técnicas resumidas e indicação de instalação; nenhuma nova operação administrativa ou atualização de pacotes foi adicionada.
- Dispositivos confiáveis com resumo de navegador/sistema, identificação do dispositivo atual e agente completo expansível (identificação aproximada).
- Ao verificar uma Release, consulta facultativa do `README.md` e da seção da versão no `CHANGELOG.md` da tag correspondente; exibe também as notas de Release como texto seguro, sem bloquear a verificação se os documentos não existirem.
- Teste de replay TOTP estabilizado contra troca de janela entre requisições; metadados e testes de regressão atualizados. Sem edição de DNS, reinícios remotos de serviços ou mudanças nos projetos existentes.

## 2.0.12 — Atualizações GitHub com senha e SHA-256 (09/11/2026)

- Removida a exigência de assinatura Ed25519 e de chave pública no painel e no serviço privilegiado de atualização.
- Instalação de Release autenticada na sessão administrativa, com proteção CSRF, confirmação no navegador e senha do administrador.
- ZIP e manifesto SHA-256 são gerados automaticamente por GitHub Actions quando VERSION muda na branch main, sem Secret de assinatura.
- Verificação da versão, do arquivo, do SHA-256, estrutura ZIP, tamanho, origem HTTPS e rollback de código/serviços.
- Backup adicional dos dados administrativos do AL Sistemas antes da atualização, sem sobrescrever instalações/sites existentes.
- A versão em produção 2.0.5 precisa de atualização inicial manual, pois o código instalado ainda exige assinatura; após essa migração, usar a interface.
- Segurança: o SHA-256 verifica integridade, mas **não autentica a autoria** contra comprometimento do repositório GitHub; proteger conta e branch.

## 2.0.11 — 09/11/2026 — Diagnóstico de 404 em atualizações GitHub

- HTTP 404 em `releases/latest` agora verifica também se o repositório existe e é acessível, distinguindo ausência de Release pública de repositório ausente/privado.
- Limite de API (HTTP 403 com cota esgotada) ganha mensagem específica; falha de rede não é disfarçada de versão inexistente.
- Tela de Atualizações mostra link para Releases e tutorial de assinatura Ed25519.
- Não instala ZIP de branch não assinado: manifesto, assinatura e chave pública continuam obrigatórios.
- Testes automatizados para os caminhos de erro e regressão; não houve instalação na EC2 nem publicação remota de Release.

## 2.0.10 — 09/11/2026 — Correções verificadas de implantação e Spaceship

- Corrigido HTTP 404 na entrega de `integrations.js`, que impedia o funcionamento da Central de APIs após abrir o painel.
- Base HTTPS da Spaceship corrigida conforme documentação oficial; consulta DNS agora envia `take` e `skip` obrigatórios.
- Respostas HTTP da Spaceship têm erros específicos e timeout; limite de 500 registros por página informado ao usuário.
- Melhoria na apresentação de valores dos registros DNS, sem `innerHTML` de conteúdo externo.
- Testes de recurso público real, contrato de consulta DNS, respostas de erro, sintaxe e documentação.
- Versões e arquivos ZIP sincronizados em 2.0.10; nenhuma alteração foi aplicada na AWS EC2.

## 2.0.9 — 09/11/2026
- Central de APIs: tutorial contextual da Spaceship com botão ? e passo a passo.
- Exibição segura de registros DNS, status de consulta e diagnóstico de erros sem imprimir credenciais.
- Alternância para visualizar credenciais digitadas, confirmação de remoção e melhorias de acessibilidade.
- Testes automatizados de criptografia, validação de domínio e consulta simulada da Spaceship.
- Mantida consulta DNS somente leitura; implantação automática ainda não implementada.

## 2.0.8 — Central de APIs e Spaceship (fase inicial)

Menu APIs e Integrações, armazenamento AES-256-GCM local de credenciais da Spaceship, remoção e consulta DNS autenticada, sem escrita DNS ou implantação automática nesta versão.

## 2.0.7 — compatibilidade com GitHub Manager e correção do workflow de validação

- Corrigidos os testes Python em runners GitHub Actions sem privilégios root: fixtures de pedidos de APT e chaves Ed25519 simulam propriedade root exclusivamente no escopo de testes.
- Validação de chave pública explicitada em `trusted_public_key`: arquivo regular, proprietário root, um único hardlink, sem escrita para grupo/outros e tamanho limitado. As verificações de produção continuam obrigatórias.
- Acrescentados na raiz `VERSION`, `github-manager.json` e `app_identity.json`, com nome e versão consistentes, para identificação confiável pelo GitHub Manager do ZIP e da branch `main` depois do envio.
- Versões de núcleo VPS, frontend legado, backend legado, lockfiles, instalador, ajuda e documentação sincronizadas em `2.0.9`.
- Acrescentados testes de regras de confiança e consistência de identidade; testes de atualização assinada e rollback continuam isolados do servidor real.
- Sem alteração de credenciais, TOTP, configuração existente de Nginx, serviços ou dados da VPS.

## 2.0.6 — 2026-11-09 — Diagnóstico Nginx, pacotes e publicação assinada

- Corrigido o falso negativo potencial de `nginx -t`: o backend protegido não executa mais essa verificação dentro do namespace read-only. Uma unidade root-owned fixa `alsistemas-nginx-check.service` executa o teste em ambiente separado. O mesmo teste é usado ao criar/ativar sites gerenciados.
- Adicionado catálogo real de oito pacotes APT permitidos: extensões PHP 8.3 (cURL, mbstring, XML, MySQL, ZIP, GD e Intl) e Composer. Instalação assíncrona via systemd, com senha e TOTP novo, sem argumentos de shell do navegador.
- Consultas ao GitHub mostram mensagem informativa quando não há Release; implementado workflow manual de Release assinada por Secret, script de assinatura reforçado e testes de integridade/assinatura.
- Não foi publicada Release no GitHub nem alterada a EC2 durante o desenvolvimento. `drilemoz/alsistemas` estava na 2.0.3 no momento da consulta e sem Releases publicadas.
- Frontend, núcleo VPS, backend legado, lockfiles, tutoriais e documentação sincronizados para 2.0.6.

## 2.0.5 — 2026-11-09 — Refinamento da interface e instalação simplificada

- Interface VPS compactada para Android: tipografia, margens e cabeçalho reduzidos; botão de tema abre pop-up, sem quebra de linhas.
- Visão geral com ícones locais SVG para métricas; ações de serviços mais discretas.
- Novo projeto passou para botão e modal com confirmação de criação real pelo executor existente.
- Menu Outros módulos redesenhado com ícones, botão fechar no canto superior e botão Fechar à direita.
- Atualizações agora têm engrenagem de configuração em modal; `drilemoz/alsistemas` vem como repositório padrão, preservando escolha previamente salva e assinatura Ed25519 obrigatória.
- Índice do tutorial HTML reorganizado em cartões responsivos com ícones e navegação por âncora; seção Instalação rápida e voltar ao índice.
- `inicio-termux.sh` + `bootstrap-vps.sh`: fluxo de instalação assistida com SCP, validação ZIP, `--plan`, confirmação antes do sudo e sem liberar 8181; funciona sem domínio em Ubuntu 24.04.
- Installer provisona repositório padrão apenas quando não há configuração existente. Preserva `admin.json`, TOTP, backups, sites e dados existentes.
- Testes Node.js, Python, Bash e verificações de UI, documentação e ZIP; nenhum deploy na EC2 efetuado por esta entrega.

# Changelog — AL Sistemas

## 2.0.4 — 2026-11-09 — Interface modular, dispositivos confiáveis e atualizações assinadas

- Reorganizada interface leve VPS por módulos (Visão geral, Projetos, Serviços, Backups, Atualizações, Segurança, Auditoria e Ajuda), com navegação inferior compacta no Android, lateral em desktop e temas sistema/claro/escuro.
- Login com mostrar/ocultar senha e opção opt-in para confiar no dispositivo por 30 dias: exige senha sempre, TOTP no cadastro inicial, em novos dispositivos e para operações sensíveis; tokens aleatórios ficam como hashes em arquivo protegido, cookie HttpOnly/SameSite Strict, revogação individual do dispositivo atual ou de todos com confirmação TOTP.
- Implementado módulo de atualização via GitHub Releases, com configuração autenticada de repositório, consulta sob demanda e executor de atualização em serviço root separado. Só instala ZIP de versão superior acompanhado de manifesto Ed25519 assinado e SHA-256 válido. Chave pública Ed25519 precisa ser provisionada uma vez no servidor pelo administrador; a privada nunca entra no painel nem no ZIP.
- Atualizador usa origem GitHub allowlist, rejeita travessia de caminhos e links no ZIP, verifica integridade, salva cópia do núcleo/serviço e tenta rollback se a instalação ou verificação de saúde falhar. Não migra bancos, sites ou certificados e não garante rollback completo de alterações feitas pelo apt.
- Corrigido o erro real observado em EC2 (2.0.3) de lock em /run/lock com ProtectSystem=strict: agora usa subdiretório restrito /run/alsistemas-vps, criado pelo systemd como root e liberado por ReadWritePaths específico; remove apenas o override temporário exato da 2.0.3.
- Incluído `tutorial-instalacao.html` autossuficiente na raiz do ZIP, também acessível pela Ajuda, cobrindo instalação via Termux e SSH, sem domínio, DNS/HTTPS, TOTP, chaves de assinatura, GitHub Releases, backups, diagnóstico e recuperação.
- Legado React/Express mantido, versões e lockfiles sincronizados, testes Node e Python ampliados, workflow GitHub Actions atualizado. Nenhuma alteração foi executada diretamente na EC2 pelo processo de desenvolvimento.

## 2.0.3 — 2026-11-09 — Diagnóstico de serviços e backups locais criptografados

- Nova tela de diagnóstico sob demanda dos serviços fixos Nginx, PHP-FPM, MariaDB e ALS VPS; lê `ActiveState`, `SubState`, `UnitFileState` via `systemctl show` sem ações de controle.
- Nova tarefa `validate_nginx`: executa somente `nginx -t`, sem reload, sem permitir argumentos arbitrários e sem exibir conteúdo potencialmente sensível dos erros do servidor.
- Backups manuais da pasta `public/` de projetos **criados e marcados pelo AL Sistemas**, via helper root allowlist e GPG AES-256, com frase secreta fornecida pelo usuário e não armazenada, manifesto SHA-256 por arquivo e hash do arquivo criptografado.
- Inventário local de backups encriptados, privado ao root em `/var/backups/alsistemas-vps/`; limites de 64 MiB de conteúdo, 1500 arquivos, 12 níveis e cinco backups por projeto. Não há exclusão automática.
- Proteção contra backup de sites externos, links simbólicos e hardlinks, arquivos especiais e diretórios graváveis por terceiros; temporários são limpos em falhas.
- Instalador cria diretório privado de backups e permite acesso de escrita exclusivamente ao executor root no sandbox systemd. Mantida separação do backend Node sem root.
- Esta etapa **não** inclui bancos MariaDB, restauração web, backups completos, cópia off-site nem instalação comprovada em Ubuntu real.
- Código legado e dependências preservados, versões e lockfiles sincronizados; regressões e GPG de ida e volta cobertos por testes locais.

## 2.0.2 — 2026-11-09 — Controle seguro de vhosts e atualização

- Adicionada ativação/desativação de sites estáticos/PHP gerenciados, somente para configuração de Nginx root-owned marcada e vinculada ao projeto. Sites externos continuam estritamente somente leitura.
- Executor root agora serializa mudanças via `flock`, rejeita campos extras e links inesperados e restaura vhost anterior se teste/reload do Nginx falhar. Pastas e conteúdo dos sites são preservados.
- Interface Android responsiva: estado do site e ação controlada com diálogo de confirmação e feedback real; não disponibiliza exclusão ou edição indiscriminada.
- Segurança: impede reutilização de código TOTP em logins posteriores e impõe limite explícito às sessões em memória.
- Instalador: preserva origem HTTPS de instalação existente, recusa mudanças de domínio sem migração, verifica links simbólicos de configuração e restaura vhost do painel quando a validação do Nginx falha.
- Mantém o código legado completo; frontend, backend, núcleo e lockfiles sincronizados em 2.0.2.
- Testes locais: 7 Node e 9 Python aprovados; testes reais Ubuntu/Nginx/systemd/Certbot e navegador Android permanecem pendentes.


## 2.0.1 — 2026-11-09 — Primeira etapa de hospedagem VPS

- Analisado o ZIP real, identificado backend principal em `backend/` e duplicação parcial em `alsistemas/backend/`.
- Adicionado núcleo independente `vps/` sem dependências npm de produção, com setup por código temporário, senha scrypt, TOTP obrigatório, cookie seguro, sessão, CSRF e auditoria.
- Dashboard leve: CPU/carga, RAM, swap, disco, uptime, serviços Nginx/PHP/MariaDB e detecção de projetos em `/var/www/projetos/`.
- Criado executor Python root allowlist para **criar apenas projetos estáticos/PHP novos**, com validação, recusa de nomes existentes, Nginx test/reload e rollback se falhar.
- Instalador Ubuntu 24.04 LTS com plano sem alterações, pacotes opcionais, Node.js 24 quando necessário, Nginx, systemd, sudoers restrito, fluxo Let's Encrypt webroot e UFW opt-in.
- Backend legado: ordem de import do plugin Mongoose corrigida, `seed.js` protegido contra limpeza acidental e senha padrão removida.
- Documentação de diagnóstico, instalação, segurança e migração planejada; testes Node/Python e workflow GitHub Actions.
- Não houve instalação, upload ou alteração na AWS EC2 atual durante o desenvolvimento.

## Legado

Alterações anteriores constavam na versão 2.0.0 e em documentação histórica, preservada neste ZIP.
