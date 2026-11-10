# AL Sistemas VPS 2.0.25 — Senha e TOTP apenas na entrada

Nesta atualização, o formulário inicial de configuração e o **login** continuam exigindo a senha e, quando aplicável, o código TOTP. Após o login, todas as ações administrativas do painel VPS usam somente a sessão ativa e o token CSRF, sem pedir credenciais adicionais.

Áreas ajustadas: manutenção, backup e restauração de código do IguatamaOnline; atualização do projeto por GitHub e ZIP; instalação de dependências; alteração do repositório GitHub do painel; alteração DNS da Spaceship e revogação geral de dispositivos. O atualizador do próprio AL Sistemas já usava a sessão.

Confirmações de operações perigosas continuam visíveis, mas não pedem credenciais. A frase secreta para **criptografar backup** permanece porque é material criptográfico independente, não uma reautenticação.

**Efeito de segurança:** qualquer pessoa que obtenha uma sessão ativa válida poderá executar essas ações sem uma segunda verificação. Por isso foram mantidos cookies HttpOnly/SameSite, expiração de 8 horas, exigência de mesma origem, CSRF, logs de auditoria, limites e validação/escopo das operações e do helper privilegiado. Saia do painel em dispositivos compartilhados.

A trava de propriedade do diretório do IguatamaOnline não foi alterada. A instalação deve ser feita pela atualização do painel, com backup e checagem dos serviços. Testes locais não comprovam deploy real na EC2.
