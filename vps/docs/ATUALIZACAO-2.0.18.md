# AL Sistemas VPS 2.0.18 — Manutenção do IguatamaOnline

## Instalação inicial

Atualize o AL Sistemas **a partir de um ZIP verificado do próprio AL Sistemas** em Atualizações, ou via SSH com:

```bash
sudo bash instalar.sh --plan --core-upgrade --allow-existing-host
sudo bash instalar.sh --core-upgrade --allow-existing-host
```

O instalador instala dois módulos root-owned e uma unidade systemd adicional (`alsistemas-project-updater.service`).
Não altera `/var/www/projetos/iguatamaonline/` nem `/var/www/iguatama-teste/` durante a instalação do painel.
Antes, crie snapshot EBS/backup externo e confira o plano. Não use ZIPs de origem desconhecida.

## Menu de projeto

Em **Projetos → IguatamaOnline → Ver detalhes → Manutenção na AWS**:

1. **Vistoria:** checa a raiz `/var/www/projetos/iguatamaonline`, arquivo VERSION, app/updater.php, public/admin.php, links simbólicos, donos e permissões. O diagnóstico do PHP-FPM usa o pool padrão e é **estimativa**, não garante que o Nginx usa essa conta.
2. **Liberar escrita temporária:** senha e TOTP novo, confirmação. Grava proprietários e modos em `/var/backups/alsistemas-vps/iguatamaonline/permissions-original.json` (0600), concede grupo de gravação do PHP apenas aos três arquivos críticos e retira escrita de outros. **Execute Restaurar permissões após terminar.** Se o vhost usar pool diferente, a correção pode não funcionar. Essa operação aumenta o risco de alteração de código pelo processo PHP, mesmo sendo limitada.
3. **Criar backup de código:** guarda até 1200 arquivos e 96 MiB, só raízes de código seguras (`VERSION`, `app`, `public`, `assets`). Não inclui bancos, uploads, sessões, mídias, segredo `.env`, pastas privadas nem configurações de sistema. Falha se encontrar um caminho inseguro. Não substitui snapshot da EC2.
4. **Atualizar pelo ZIP:** aceita 512 B–32 MiB; ZIP deve conter `VERSION` semver superior, `app/updater.php` e `public/admin.php` na raiz ou dentro de uma pasta superior única. Aceita código em `app`, `public`, `assets`, além de `index.php` e `composer.json`. Não remove arquivos antigos, não executa migrations/scripts e não atualiza banco de dados. Diretórios `storage`, `uploads`, `data`, `vendor`, `.env`, arquivos de segredos, caminhos `..`, links simbólicos e hardlinks são proibidos. Estruturas incompatíveis são recusadas antes de instalar.
5. **Atualizar pelo GitHub:** informe `proprietário/repositório`, sem URL completa. O painel usa a última Release pública e exige exatamente um ZIP válido nela; transferências ficam restritas a HTTPS e domínios do GitHub. Proteja a conta e as Releases; hash calculado localmente não é assinatura de origem. O repositório não é pré-definido, portanto confira a origem antes de autorizar.
6. **Acompanhar:** o status fica em `/var/lib/alsistemas/project-update-status.json` e é consultado no pop-up; o percentual é exibido apenas quando são conhecidos os bytes de transferência. Nas etapas de instalação a barra é indeterminada.
7. **Restaurar código:** reversão para um backup privado gerado antes de atualização ou sob demanda. É bloqueada se a versão mudou desde a captura ou se outra operação está ativa. Não altera bancos e uploads. Falha de rollback pode exigir intervenção manual pelo SSH.

Todas as alterações críticas requerem sessão, origem de mesma origem, CSRF, senha administrativa e código TOTP novo. Atualização e correção podem ser recusadas quando o usuário PHP controla os diretórios, se os caminhos forem ambíguos ou se houver link simbólico.

## Limitações e diagnóstico

A vistoria web do IguatamaOnline pode continuar bloqueada após liberar escrita se a condição original for um caminho inseguro, pool PHP diferente, ACL, proprietário ou regra da própria aplicação. Não execute chmod 777 nem chown -R indiscriminadamente.

```bash
sudo systemctl status alsistemas-project-updater.service --no-pager
sudo journalctl -u alsistemas-project-updater.service -n 80 --no-pager
sudo journalctl -u alsistemas-vps.service -n 80 --no-pager
```

O serviço não faz mudanças no Nginx nem no banco de dados; backups são **somente código**. Valide a versão e funcionalidades do portal após a atualização. Nenhuma EC2 foi modificada no desenvolvimento local.
