# AL Sistemas VPS 2.0.10 — correções de implantação Spaceship

## Corrigido

- O servidor agora entrega `/integrations.js` com `Content-Type` JavaScript e CSP local. A versão 2.0.9 retornava 404 e impedia o funcionamento da interface.
- Corrigida a URL para a API oficial `https://spaceship.dev/api/v1/dns/records/{domain}`.
- Enviados `take=500&skip=0`, parâmetros obrigatórios da API. A interface sinaliza quando há registros além dos 500 da primeira página.
- Erros 401, 403, 404, 429 e tempo limite agora têm mensagens específicas; não expõem credenciais.
- Exibição DNS legível para registros com campos como `address`, `ttl`, `value`, etc.
- Criados testes HTTP do script servido, consulta DNS simulada e paginação.

## Atualização preservando dados

1. Faça backup seguro de `/var/lib/alsistemas` (incluindo `integrations.key` e `integrations-spaceship.json`) **fora da VPS** e das configurações do painel. Nunca envie as chaves para o GitHub.
2. Valide o ZIP e confira o caminho da pasta.
3. Para atualização manual de instalação existente no Ubuntu 24.04, execute o instalador do pacote seguindo `vps/docs/INSTALACAO.md` e utilizando `--allow-existing-host`; preserve o domínio HTTPS anterior.
4. Verifique `systemctl is-active alsistemas-vps`, `nginx -t` e `https://painel.iguatama.online/api/health`.
5. No navegador autenticado, abra **APIs e Integrações** e consulte um domínio da sua conta Spaceship.
6. Se o painel continuar com JavaScript antigo após a atualização, recarregue a página ignorando o cache.

A versão 2.0.10 **não** cria nem altera registros DNS, sites, permissões ou bancos de dados. Não houve instalação automática na EC2 durante a criação deste ZIP.
