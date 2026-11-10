# AL Sistemas VPS 2.0.34 — Logs e erros por projeto

## Escopo

Novo atalho **Projetos → projeto → Logs e erros**. Lê caudas limitadas de arquivos PHP com nomes conhecidos (`storage/logs/*.log` e `logs/*.log` com allowlist restrita) e, quando houver configuração explícita em bloco de servidor Nginx com `root` do projeto, `error_log /var/log/nginx/<nome>.log`. `error.log` global do Nginx é omitido.

A interface permite escolher origem, filtrar erro/aviso/informativo, pesquisar, copiar e baixar TXT. O backend devolve no máximo 8 fontes, 48 KiB e 70 linhas por fonte. O acesso é autenticado; não é feita nenhuma mudança de permissão, leitura de banco de dados, execução de scripts ou acesso a logs de outro projeto.

Se não houver log dedicado/legível, o painel informa indisponibilidade. A sessão do serviço `alsistemas` não recebe privilégios adicionais nesta versão. Arquivos sensíveis e links simbólicos não são seguidos. O texto passa por ocultação limitada de dados comuns, porém **pode conter informações privadas** e deve ser revisado antes de compartilhar ou exportar.

## Instalação e validação

1. Realize um snapshot/backup recuperável da VPS e preserve a instalação existente.
2. Instale o ZIP de versão superior pelo mecanismo do painel ou pelo procedimento Termux validado, conforme seu ambiente. A v2.0.34 inclui o novo arquivo `vps/src/project_logs.js` e a interface atualizada.
3. Confira `/api/health` com `version: 2.0.34` e teste os logs de um projeto com arquivo próprio e de outro sem log. Não confundir testes locais com deploy real.

Pendente: teste real de leitura em PHP-FPM/Nginx na EC2. Logs globais, rotação de arquivos, alertas automáticos, download integral de logs e rastreamento público de uptime **não** são implementados.
