# AL Sistemas VPS 2.0.2 — atualização segura a partir da 2.0.1

> **Estado:** código e testes locais prontos, **sem execução real em Ubuntu 24.04/EC2**. Preferir VPS descartável ou snapshot restaurável. Não instalar diretamente no IguatamaOnline em produção sem ensaio e revisão.

## Mudanças e compatibilidade

- Conta, arquivo `admin.json`, segredo TOTP e dados locais são preservados pelo instalador.
- Atualização de núcleo continua sem `npm install`, MongoDB ou serviços extras.
- Os vhosts `als-<nome>.conf` produzidos pela 2.0.1 com cabeçalho anterior continuam reconhecidos, mas vhosts de terceiros são bloqueados.
- A ação de ativar/desativar apenas cria ou remove um link `sites-enabled/als-<nome>.conf`; não apaga o projeto, arquivos ou banco.
- Atualizações com HTTPS existente preservam `Environment=ALS_ORIGIN=https://...` mesmo sem `--domain`, evitando perda de sessão por diferença de origem.
- A ativação/reativação **não emite certificados para sites**: site novo com domínio continua HTTP até configurar SSL separadamente.

## Procedimento recomendado

1. Faça snapshot/backup independente **dos sites, bancos e configurações**, confirme espaço livre e teste recuperação. O backup interno da atualização cobre somente o **código do painel**.
2. Transfira/extrai a versão 2.0.2 em diretório novo pelo Termux/SSH. Confirme o hash SHA-256 do ZIP e revise o `instalar.sh`.
3. Execute `bash instalar.sh --plan` e confira os serviços e diretórios detectados. Nenhuma alteração ocorre com `--plan`.
4. Em VPS de homologação Ubuntu 24.04, execute `sudo ./instalar.sh` usando as opções adequadas. Apenas para VPS com sites preexistentes conhecidos, após backup e revisão, inclua `--allow-existing-host`. **Não use a opção como atalho de instalação em produção.**
5. Verifique `sudo nginx -t`, `sudo systemctl status alsistemas-vps nginx`, `curl http://127.0.0.1:8181/api/health` (na própria VPS) e um login HTTPS ou via túnel SSH.
6. Teste com **site descartável criado pelo AL Sistemas**, primeiro desativando/reativando. Confirme o Nginx e acesso de rede. Não use o IguatamaOnline para esse teste.
7. Em caso de falha, restaure o snapshot ou a versão anterior de `/var/backups/alsistemas/` em ambiente de recuperação. A versão 2.0.2 não contém ferramenta automática de rollback integral do servidor.

## Limitações

Ainda não foram implementados banco MariaDB pela UI, upload/edição de arquivos, PHP-FPM por projeto, GitHub deploy, backup de projetos, HTTPS por site ou migração completa entre VPS. Não criar projetos hospedando código PHP de terceiros não confiáveis no pool compartilhado.
