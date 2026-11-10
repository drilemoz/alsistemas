# AL Sistemas VPS 2.0.24 — Ações do IguatamaOnline sem senha repetida

## Interface

Em **Projetos → IguatamaOnline → Manutenção na AWS** as ações de permissões, backup, restauração e atualização pedem somente um **TOTP novo**, não a senha já fornecida no login. Permanecem sessão válida, token anti-CSRF, limite de tentativas e rejeição de TOTP reutilizado. A senha continua obrigatória no login e demais áreas não alteradas.

## Pasta com dono diferente de root/ubuntu

A mensagem da captura indica que o helper root recusou mudar arquivos porque a pasta `/var/www/projetos/iguatamaonline` não pertence a uma conta de implantação autorizada. A versão 2.0.24 **não contorna** essa proteção: a prévia informa a causa e evita pedir TOTP quando já há bloqueio.

Na EC2, verifique sem modificar o sistema:

```bash
sudo stat -c '%U:%G %a %n' /var/www/projetos /var/www/projetos/iguatamaonline /var/www/projetos/iguatamaonline/app /var/www/projetos/iguatamaonline/public
sudo stat -c '%U:%G %a %n' /var/www/projetos/iguatamaonline/VERSION /var/www/projetos/iguatamaonline/app/updater.php /var/www/projetos/iguatamaonline/public/admin.php
sudo grep -R '^\s*user\s*=' /etc/php/8.3/fpm/pool.d/*.conf
sudo nginx -T 2>&1 | grep -n -E 'server_name|fastcgi_pass' | head -80
```

Confira se o dono da pasta é uma conta de implantação legítima, como `ubuntu`, e se o pool PHP efetivo é mesmo o esperado; **não execute chown recursivo nem chmod 777**. Caso esteja como `www-data` ou outro usuário, primeiro investigue por que e valide backups. Corrija proprietários somente depois de conhecer o estado real. O diretório `/var/www/iguatama-teste/` não é tocado pelo painel.

## Implantação

Instale o ZIP da versão 2.0.24 pelo atualizador do AL Sistemas ou, se estiver inoperante, pela rotina SSH descrita no `vps/docs/ATUALIZACAO-2.0.23.md`. Verifique a saúde do painel após instalação. Testes locais não substituem execução real no servidor.
