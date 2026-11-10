# AL Sistemas VPS 2.0.23 — Atualizador corrigido e atualização por fora

## O que estava errado

Ao enviar o ZIP, o painel chama o helper root (`sudo`), que grava o pedido em `/etc/alsistemas-vps/update-request.json` e inicia `alsistemas-updater.service`. O helper herda a sandbox de `alsistemas-vps.service` (`ProtectSystem=strict`), e `/etc/alsistemas-vps` não estava em `ReadWritePaths`: a gravação falhava com *Read-only file system* e o painel respondia **HTTP 500 — Falha interna**. O atualizador nunca chegava a iniciar (relatório: "Operação: não iniciada").

Confirme em instalações antigas: `sudo journalctl -u alsistemas-vps -n 80 | grep -i "read-only"`.

## Como instalar a 2.0.23 pela primeira vez

O atualizador 2.0.22 instalado na VPS ainda tem o defeito. Use **um** destes caminhos:

1. **Por SSH/Termux (recomendado):**
   ```
   scp AL-Sistemas-v2.0.23-VPS.zip usuario@IP:~/
   ssh usuario@IP
   sudo mkdir -p /tmp/als && sudo unzip -q -o ~/AL-Sistemas-v2.0.23-VPS.zip atualizar-vps.sh -d /tmp/als
   sudo bash /tmp/als/atualizar-vps.sh ~/AL-Sistemas-v2.0.23-VPS.zip
   ```
2. **Correção mínima e depois pelo painel:**
   ```
   sudo mkdir -p /etc/systemd/system/alsistemas-vps.service.d
   printf '[Service]\nReadWritePaths=/etc/alsistemas-vps\n' | sudo tee /etc/systemd/system/alsistemas-vps.service.d/update-request.conf
   sudo systemctl daemon-reload && sudo systemctl restart alsistemas-vps
   ```
   Entre de novo no painel e envie o ZIP na aba Atualizações. (O drop-in pode ser removido depois; a 2.0.23 já traz o caminho no serviço.)

Faça snapshot EBS antes. Depois da 2.0.23, as três formas abaixo ficam disponíveis.

## Formas de atualizar a partir da 2.0.23

| Forma | Quando usar |
| --- | --- |
| Painel → Atualizações (GitHub ou ZIP) | Dia a dia. Mostra o motivo real se falhar. |
| Caixa de entrada | Painel fora do ar ou sem navegador. |
| `atualizar-vps.sh` | Atualização direta por SSH/Termux. |

### Caixa de entrada

```
scp AL-Sistemas-vX.Y.Z-VPS.zip usuario@IP:~/
ssh usuario@IP 'sudo mv ~/AL-Sistemas-vX.Y.Z-VPS.zip /var/lib/alsistemas-inbox/'
journalctl -u alsistemas-inbox -u alsistemas-updater -f
```

- Pasta `root:root 0700`: o painel Node não enxerga nem grava ali. Quem solta o arquivo já é root, então a confiança é a de rodar o instalador à mão.
- O nome precisa ser `AL-Sistemas-vX.Y.Z-VPS.zip`. Qualquer outra coisa vai para `/var/backups/alsistemas/inbox-rejected/` com um `.motivo.txt`.
- O ZIP é copiado para a área root-only e entregue ao mesmo `alsistemas-updater.service`: versão estritamente superior, SHA-256, backup, rollback e `/api/health`.
- Se `alsistemas-inbox.path` não estiver ativo: `sudo systemctl enable --now alsistemas-inbox.path`.

## Limitações

- Não foi possível testar systemd, sudo e Nginx reais fora da EC2; os testes cobrem a lógica Python/Node e o conteúdo do instalador.
- ZIP local não tem assinatura de origem; o SHA-256 só detecta corrupção.
- `atualizar-vps.sh` não faz rollback próprio além do que o `instalar.sh` já restaura em caso de falha.
