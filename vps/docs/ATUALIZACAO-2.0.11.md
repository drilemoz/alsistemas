# AL Sistemas VPS 2.0.11 — correção de diagnóstico GitHub HTTP 404

## Motivo do 404 mostrado no painel 2.0.5

O endpoint GitHub `/repos/{owner}/{repo}/releases/latest` devolve HTTP 404 quando não existe Release estável pública, mesmo que o repositório seja acessível. Não é possível atualizar automaticamente apenas enviando código para a branch `main`. A tela original da VPS permanece na versão 2.0.5 até você instalar uma atualização válida.

## Melhorias

- Quando `/releases/latest` devolve 404, uma segunda consulta à API verifica o repositório.
- Repositório disponível sem Release estável: mostra aviso claro, mantém atualização bloqueada.
- Repositório não encontrado/privado: indica revisar configurações e acesso.
- Cota de API esgotada: informa limite de requisições, sem confundir com 404.
- A tela oferece link direto para Releases e para o tutorial de assinatura.

## Como realmente habilitar atualizações

1. Salve backup de `/var/lib/alsistemas` e confira as configurações e dados existentes.
2. Instale manualmente a 2.0.11 pela rotina documentada em `vps/docs/INSTALACAO.md` caso ainda esteja na 2.0.5. Não execute instaladores desconhecidos no servidor de produção.
3. Fora da VPS, gere um par Ed25519, guarde a chave privada em local seguro e instale apenas a pública no servidor via `--update-key-file`, conforme `vps/docs/RELEASES-ASSINADAS.md`.
4. Envie o código-fonte completo da mesma versão ao GitHub e publique a Release assinada com ZIP, `update-manifest.json` e `update-manifest.json.sig`.
5. Verifique a Release no GitHub e use o painel. Não desative a assinatura nem use ZIPs não confiáveis da branch.

**Pendente:** não houve publicação de Release, SSH na VPS ou teste de atualização real.
