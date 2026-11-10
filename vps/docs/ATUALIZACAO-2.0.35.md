# AL Sistemas VPS 2.0.35 — Backups e recuperação por projeto

## Mudanças

- Em **Projetos → [projeto] → Backups e recuperação**, mostra somente as cópias referentes ao projeto.
- Em projetos gerenciados, permite criar backup criptografado do conteúdo `public/`, com a frase secreta fornecida pelo administrador, preservando a rotina existente.
- Para cópias criptografadas `public-only`, botão **Verificar SHA-256** compara o conteúdo armazenado com o hash gravado no manifesto, sem descriptografar nem modificar arquivos.
- Para o IguatamaOnline, o acesso à página de backup e restauração de **código** já existente foi mantido.
- Projetos externos que não foram cadastrados como gerenciados exibem explicitamente ausência de operação de backup autorizada.

## Limites e segurança

- O SHA-256 comprova igualdade dos bytes com o manifesto disponível; não comprova recuperabilidade, disponibilidade externa, integridade criptográfica da frase secreta nem autenticidade se arquivo e manifesto tiverem sido alterados conjuntamente.
- Backup criptografado do `public/` não inclui automaticamente banco, outros diretórios e uploads externos. Ainda não existe backup/restauração SQL pelo painel para todos os projetos.
- Não há novas permissões de escrita no Nginx/PHP, alterações nos bancos ou exclusão automática de backups.
- Para recuperação real, mantenha cópia fora da EC2 e execute um teste de restauração isolado com o arquivo e a senha correta.
- A API de verificação exige sessão, CSRF, nome exato do projeto e arquivo autorizado. O helper rejeita links, metadados inconsistentes e tamanhos inesperados.

## Validação ainda pendente

Requer instalação na EC2 e teste com backups de produção; os testes automatizados locais usam arquivos temporários e não equivalem à recuperação real.
