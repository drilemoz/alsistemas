# AL Sistemas VPS 2.0.30 — Manutenção AWS mais clara

## Páginas redesenhadas

1. **Permissões**: um único botão **Abrir gerenciador** em vez de três caminhos iguais. O gerenciador da 2.0.29 permanece com escolha de arquivos e usuário PHP, salvar, liberar e restaurar.
2. **Atualizações**: cartão de versão, envio ZIP e GitHub separados. Status em português e acesso ao andamento detalhado. No botão **i**, limites, cobertura do backup e advertências.
3. **Backups**: ação de criar backup e restauração visualmente distintas. Restaurar só fica habilitado após selecionar backup disponível. Seleção preservada em consultas de inspeção quando a cópia continua disponível.
4. **Histórico**: eventos com data, status e motivo (quando retornados pelo servidor). Informações brutas e exportação TXT ficam em diálogo técnico. O painel não inventa atualizações ausentes.

## Limites, segurança e validação

Esta versão não muda a lógica privilegiada do backend nem a política de permissão. Não abre pastas inteiras, nem retira CSRF, sessão e confirmações críticas. A conta PHP tem de corresponder ao pool correto. As cópias de código não incluem banco de dados e uploads; faça backups separados/snapshot EBS antes de ações destrutivas.

A interface deve ser testada após instalar na EC2 e abrir no Chrome Android, sobretudo fluxo de seleção ZIP, atualização e histórico. Os testes do código não executaram alterações de produção.
