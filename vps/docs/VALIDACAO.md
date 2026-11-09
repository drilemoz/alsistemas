# Validação — AL Sistemas VPS 2.0.10

Data: 2026-11-09. Código auditado a partir da versão 2.0.9. **Nenhuma alteração foi aplicada na EC2.**

## Diagnóstico do workflow fornecido

O arquivo `alsistemas-AL-Sistemas-VPS-validacao-2-logs.zip` aponta 4 falhas na execução do runner sem root: um teste de propriedade do pedido APT e três consequências das verificações de propriedade root da chave pública Ed25519 em arquivos temporários. A aplicação em produção exige essas propriedades por razões de segurança.

## Alterações

- Teste de pedido APT usa simulação de `st_uid=0` somente no escopo do mock e testa recusa de permissões fracas e de proprietário não-root.
- Testes de assinatura e rollback isolam a verificação de proprietário root dos arquivos temporários, mas continuam usando OpenSSL Ed25519 real. A regra `trusted_public_key()` é testada separadamente: arquivo regular, único hardlink, proprietário root, sem escrita de grupo/outros, tamanho limitado.
- Versão e identidade raiz para GitHub Manager: `github-manager.json`, `app_identity.json`, `VERSION` e os três `package.json`.

## Resultados locais

- 30/30 testes Node.js aprovados (Node 22.16 local, CI configurado para Node 24), incluindo requisições HTTP reais para os scripts da interface e simulação da Spaceship com contrato oficial.
- 27/27 testes Python aprovados **como usuário não privilegiado**, simulando o runner GitHub Actions (Python 3.13 local; workflow Ubuntu 24.04 usa Python 3.12).
- Sintaxe JavaScript, Bash e cópia do tutorial HTML confirmadas.
- Integridade do ZIP e manifesto `SHA256SUMS.txt` verificados localmente; API Spaceship não consultada com credenciais de produção.

## Ainda pendente

- Rodar o workflow corrigido no GitHub Actions e registrar novo run de sucesso.
- Testar a instalação da 2.0.10 e atualização de Release assinada no Ubuntu 24.04 real.
- Confirmar no GitHub Manager que o ZIP e a branch `main` mostram versão após publicar os arquivos novos.
- Nenhum pacote APT, atualização de VPS, alteração de site ou migração de bancos foi executada por estes testes.

## Erros encontrados na versão 2.0.9

- `/integrations.js` retornava HTTP 404, impedindo a inicialização da Central de APIs.
- Endpoint configurado como `https://api.spaceship.com` em vez de `https://spaceship.dev/api`.
- Requisição DNS não incluía `take` e `skip`, exigidos pela documentação do provedor.
- Guia de atualização da 2.0.9 era referenciado em README, mas não existia sob esse nome.

Todos foram corrigidos na 2.0.10, sem alterar a configuração ou os dados da EC2. Testes Ubuntu real, atualização pelo GitHub e conexão autenticada com Spaceship permanecem pendentes.
