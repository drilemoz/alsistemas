# AL Sistemas VPS 2.0.19 — Ajustes da aba Atualizações

## Interface

1. Verificar GitHub consulta as Releases e ativa o botão de ajuda `?` quando há notas publicadas. Esse botão abre as novidades; `Ler README.md` abre outro pop-up.
2. Os controles GitHub, Arquivo ZIP e Andamento ficam na mesma linha. Andamento também mostra o último estado, inclusive falha.
3. Ao falhar, use Relatório do erro → Copiar ou Baixar .txt. O relatório contém os dados que o painel recebeu, não um despejo automático de journal. Remova informações privadas antes de compartilhar.

## Por que o upload de 2.0.18 falhava (HTTP 413)

O `vps/src/server.js` já permitia 32 MiB, mas o vhost HTTPS do painel gerado por `instalar.sh` mantinha `client_max_body_size 64k`. O Nginx recusava o ZIP antes de chegar ao Node. A v2.0.19 adiciona limites de `32m` exclusivamente às rotas autenticadas de upload. O vhost atual é migrado automaticamente pelo instalador `--core-upgrade`, desde que seja o modelo gerenciado pelo AL Sistemas. Para um Nginx/proxy externo, é necessária revisão manual da configuração daquele proxy. A verificação de Nginx não foi executada em uma VPS real.

## A atualização de 2.0.17 para 2.0.19

**Atenção:** o instalador corrigido só pode alterar o limite do Nginx após chegar à EC2. Enquanto a configuração antiga estiver ativa, o botão Arquivo ZIP continuará sujeito a HTTP 413. O método GitHub não depende desse limite, mas o usuário já observou falha na verificação de saúde com reversão. Não repita cegamente essa operação.

Preferir instalação assistida via SSH depois de snapshot da EC2, usando `instalar.sh --plan --core-upgrade --allow-existing-host` e, após conferir o plano, `sudo bash instalar.sh --core-upgrade --allow-existing-host`. Não usar esses comandos na pasta de produção do IguatamaOnline. A pasta correta é a raiz extraída do ZIP do **AL Sistemas**.

Depois, verificar:

```bash
curl -fsS http://127.0.0.1:8181/api/health
sudo systemctl is-active alsistemas-vps
sudo nginx -t
sudo journalctl -u alsistemas-vps -u alsistemas-updater.service -n 80 --no-pager
```

## TOTP

- Atualizar o próprio AL Sistemas: sessão autenticada, CSRF e confirmação de senha, sem solicitar novo TOTP nesta versão.
- Reconfigurar o repositório GitHub: confirmação com senha e código TOTP não reutilizado.
- Ações de manutenção do IguatamaOnline: senha + código TOTP não reutilizado para iniciar a operação. O progresso não solicita TOTP adicional.

## Escopo de proteção

A migração de upload age somente no vhost do painel identificado pelo marcador `# AL-SISTEMAS-MANAGED`. Em layout desconhecido, a execução é recusada, preservando arquivos de terceiros. Não modifica ` /var/www/projetos/iguatamaonline/`, banco de dados, uploads do portal nem ` /var/www/iguatama-teste/`.

**Limites:** testes automatizados locais não confirmam uma implantação real ou a causa original da reversão por falta dos logs da EC2.
