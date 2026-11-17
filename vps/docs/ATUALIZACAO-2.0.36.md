# AL Sistemas VPS 2.0.36 — Projetos e Ficha técnica

## Usar no painel

1. Abra **Projetos**. Cada linha mostra nome, domínio identificado e tipo de acesso. Com cinco ou mais projetos, a busca filtra nomes e domínios. Atualize a lista pelo ícone de recarga.
2. Abra um projeto e toque em **Ficha técnica**, ao lado do nome. O pop-up mostra tecnologia, acesso, versão instalada, configuração do Nginx e domínios. Em **Arquivos e armazenamento**, é possível copiar o caminho e conferir a quantidade e o tamanho dos arquivos observados. Valores parciais são sinalizados.
3. Use **Arquivos**, **Diagnóstico**, **Logs e erros**, **Histórico** e **Backups** conforme a capacidade do projeto. No IguatamaOnline, **Atualizar site** abre ZIP/GitHub diretamente. A vistoria específica da produção está em **Diagnóstico** e o relatório da última atualização está em **Histórico**. Os atalhos antigos para Manutenção AWS continuam válidos.
4. Em projetos gerenciados, **Backups** mostra o inventário de cópias criptografadas verificáveis de `public/` e o limite de cinco. Isso não representa backup do banco nem garante recuperação. No IguatamaOnline, o atalho abre a rotina já existente de backup e restauração de código.

## Implementação e limites

- A lista de Projetos não depende da consulta de métricas, auditoria ou backups gerais. Falhas de carregamento aparecem na seção correspondente e não invalidam uma sessão válida.
- Confirmações genéricas só aprovam pelo botão explícito. Fechar ou cancelar a janela não reaproveita a resposta anterior.
- Catálogo, Ficha técnica e diagnóstico usam a mesma descoberta de configurações locais do Nginx. A associação considera `server_name` e `root` literais do mesmo bloco `server`. Includes dinâmicos, variáveis, aliases de raiz e configurações fora de `sites-enabled`/`sites-available` não são inferidos. O protocolo detectado e a habilitação local não comprovam acesso pela internet nem validade do certificado. O teste HTTP local exige configuração HTTP identificada na porta 80.
- A medição detalhada começa ao abrir Ficha técnica ou Diagnóstico. O frontend reaproveita a consulta concluída por até 30 segundos, enquanto **Atualizar** no Diagnóstico força nova leitura. As operações de varredura e consultas de PHP/MariaDB no diagnóstico são assíncronas e limitadas.
- A interface oculta ferramentas indisponíveis e preserva as restrições existentes das APIs e do executor. Nenhuma operação nova de escrita, restauração, alteração de configuração Nginx ou backups de banco foi adicionada. A EC2 não foi modificada.

## Conferência após instalar

Abra o painel no Android e confirme a Ficha técnica do IguatamaOnline e de um site HTTP. Confira se Arquivos volta à origem correta. Verifique os domínios que a VPS realmente reconheceu antes de interpretar status do Nginx. Teste operações sensíveis apenas com um projeto descartável.
