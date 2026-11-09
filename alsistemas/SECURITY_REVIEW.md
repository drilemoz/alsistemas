# Revisão geral de segurança — AL Sistemas

## Melhorias aplicadas nesta revisão

- Centro de Segurança em `/admin/seguranca`.
- Registro persistente de padrões repetidos de respostas 401, 403, 404 e 429.
- Pontuação preventiva baseada em configuração e alertas recentes.
- Triagem de eventos de segurança pelo painel.
- Tokens de redefinição de senha armazenados como SHA-256, não mais em texto puro.
- Sanitização recursiva do audit log para senha, token, secret, API key, cookies, Authorization e URI do MongoDB.
- Nenhum conteúdo de requisição é gravado pelo monitor de segurança.

## Pontos positivos encontrados

- JWT entregue em cookie HttpOnly.
- CORS com lista explícita de origens.
- Helmet, rate limit de login, bloqueio por tentativas e validação de senha.
- Cofre de credenciais com AES-256-GCM.
- Whitelist no editor de arquivos e proteção por autenticação/permissão.
- Auditoria administrativa e IDs de requisição.
- Uploads e operações administrativas separados em rotas próprias.

## Prioridade alta para a próxima etapa

1. Implementar autenticação em dois fatores com códigos de recuperação.
2. Criar tela de sessões/dispositivos e revogação individual.
3. Rotacionar JWT por sessão e registrar `jti` para revogação imediata.
4. Adicionar proteção CSRF explícita para cookies cross-site.
5. Aplicar permissões específicas em todas as rotas GitHub, projetos e infraestrutura; autenticação isolada é insuficiente.
6. Desativar Swagger em produção ou restringi-lo ao superadmin.
7. Exigir `METRICS_TOKEN` em produção, sem modo opcional.
8. Adicionar política CSP ajustada ao frontend e remover origens desnecessárias.
9. Definir retenção automática para logs de erro, auditoria e segurança.
10. Incluir varredura de dependências e segredos no GitHub Actions.

## Proposta do módulo antifurto de dados

### Prevenção

- Inventário de dados sensíveis por coleção, arquivo e integração.
- Classificação: público, interno, confidencial e segredo.
- Varredura de tokens, chaves privadas, senhas e URLs com credenciais em commits, ZIPs e uploads.
- Limites de exportação e download por usuário.
- Confirmação adicional para backups, exclusões e downloads em massa.
- Mascaramento de dados no frontend e no audit log.

### Detecção

- Alertas por volume anormal de leitura, download ou exportação.
- Detecção de muitos acessos negados, enumeração de rotas e troca incomum de IP/User-Agent.
- Comparação com comportamento habitual por usuário.
- Correlação entre login, alteração de credencial, backup e download.

### Resposta

- Revogar sessão suspeita.
- Bloquear temporariamente conta, IP ou operação de exportação.
- Rotacionar credenciais afetadas.
- Preservar evidências com hash e linha do tempo.
- Alertar por e-mail, Telegram ou webhook.

### Cuidados

O bloqueio automático deve começar em modo observação. Depois de calibrado, ações automáticas podem ser habilitadas por regra, evitando falsos positivos que bloqueiem o próprio administrador.
