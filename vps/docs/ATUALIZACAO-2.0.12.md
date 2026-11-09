# AL Sistemas VPS 2.0.12 — atualização inicial e fluxo automático

## 1. Primeira migração da 2.0.5

A 2.0.5 **não consegue instalar** esta versão pelo botão Atualizar, porque ainda exige assinatura Ed25519. A migração deve ser feita uma vez via SSH/Termux, sem excluir os dados.

1. Faça backup externo de `/var/lib/alsistemas`, `/opt/alsistemas-vps/current` e arquivos Nginx. Não exclua a instalação antiga.
2. Baixe o ZIP 2.0.12 do Google Drive ou da Release publicada no GitHub e envie para a VPS.
3. Extraia em diretório temporário e rode `bash instalar.sh --plan` para inspecionar as ações.
4. Na pasta extraída, execute `sudo bash instalar.sh --allow-existing-host`. O instalador reutiliza `/var/lib/alsistemas`, preserva projetos já existentes e mantém Nginx/HTTPS previamente configurados, sem novo `--domain`.
5. Verifique `sudo systemctl status alsistemas-vps` e `curl -fsS http://127.0.0.1:8181/api/health`. O JSON deve mostrar `version: 2.0.12`.

**Nunca** rode o instalador como se fosse uma máquina limpa com `--domain` e `--enable-ufw` sem revisar o host. Não apague `/var/www/projetos/iguatamaonline/` nem `/var/www/iguatama-teste/`.

## 2. Próximas versões pelo painel

1. Atualize o arquivo `VERSION` e versões dos módulos em cada nova entrega, envie tudo ao repositório `drilemoz/alsistemas` via GitHub Manager.
2. O workflow `.github/workflows/vps-signed-release.yml` (nome legado) valida os testes e publica automaticamente a Release `vX.Y.Z` com dois assets: ZIP e `update-manifest.json`. Não requer Secrets.
3. No painel vá a **Atualizações → Verificar GitHub → Instalar atualização**, confirme a senha e acompanhe o status.
4. O atualizador verifica SHA-256, versão, estrutura ZIP, grava cópia do código e dos dados administrativos, inicia instalador restrito e tenta rollback se a verificação de saúde falhar.

**Limites:** SHA-256 não prova a autoria; uma conta GitHub ou branch comprometida pode publicar código malicioso. Use 2FA e restrições de escrita na branch. A primeira migração e funcionamento completo com a EC2 real ainda exigem teste de produção.

## 3. Comandos de verificação após atualização

```bash
sudo systemctl is-active alsistemas-vps
curl -fsS http://127.0.0.1:8181/api/health
sudo journalctl -u alsistemas-vps -n 30 --no-pager
```

Não rode novamente `--domain` se o HTTPS já estiver funcionando. Se o workflow não conseguir publicar, confira as permissões de `GITHUB_TOKEN` (Actions: Read and write permissions) e o resultado dos testes em Actions.
