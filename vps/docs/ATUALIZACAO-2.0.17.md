# AL Sistemas VPS 2.0.17 — atualização por GitHub ou arquivo

## Migração inicial a partir de versões anteriores

O recurso **Atualizar por arquivo ZIP** só aparece após instalar 2.0.17. Se o painel antigo não consegue atualizar pela Release, faça implantação manual via SSH com um ZIP de origem verificada, usando cópia de segurança e o instalador oficial. No diretório extraído do pacote:

```bash
sudo bash ./instalar.sh --plan
sudo bash ./instalar.sh --allow-existing-host
```

O instalador exige Ubuntu 24.04, valida opções e não modifica `/var/www/iguatama-teste/` nem `/var/www/projetos/iguatamaonline/`. **Antes de instalar:** faça snapshots externos da EC2 e dos dados. Confirme os serviços Nginx e Node depois. Não execute a partir de uma pasta incompleta ou sem verificar a origem do ZIP.

## Fluxo pelo painel

1. Em **Atualizações**, selecione **Verificar GitHub** e **Atualizar pelo GitHub**, ou toque em **Atualizar por arquivo ZIP** e selecione o ZIP oficial.
2. Confirme a senha administrativa. O ZIP deve ter tamanho entre 512 B e 32 MiB, estrutura válida e versão superior.
3. A janela exibe as etapas reais: solicitação, download/upload (com porcentagem de bytes quando disponível), validação, backup, instalação, verificação e conclusão ou falha. Durante o reinício do serviço podem ocorrer erros transitórios de conexão ou expiração de sessão.
4. Ao concluir, clique em **Atualizar página** e entre novamente se a sessão tiver sido perdida.

A operação é identificada por um ID único e seu estado fica em `/var/lib/alsistemas/update-status.json`. O serviço privilegiado lê a solicitação root-only em `/etc/alsistemas-vps/update-request.json`. ZIPs enviados são copiados para `/var/backups/alsistemas/` com permissões restritas e removidos após a operação. Para problemas:

```bash
sudo systemctl status alsistemas-updater.service --no-pager
sudo journalctl -u alsistemas-updater.service -n 120 --no-pager
sudo journalctl -u alsistemas-vps.service -n 120 --no-pager
```

Não remova arquivos temporários nem reinicie o atualizador enquanto ele estiver ativo. Se a operação não progredir após 15 minutos, consulte os logs e confira seu estado no systemd antes de tentar de novo. SHA-256 verifica integridade, não autentica autoria; nunca carregue ZIP obtido de fontes desconhecidas.
