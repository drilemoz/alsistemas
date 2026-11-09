# Exemplos

O instalador gera o unit `alsistemas-vps.service`, o sudoers e o vhost HTTPS sob `/etc`, sem assumir que o servidor está vazio. Abaixo há apenas o modelo conceitual; o instalador é a fonte principal dos arquivos gerados.

```text
Usuário: alsistemas (sem login shell)
Nginx (443/TLS) → http://127.0.0.1:8181
Node.js sem root → /usr/bin/sudo -n /usr/local/libexec/alsistemas-helper (sem args)
Helper Python root → apenas create_project, sem shell de entrada
Projetos → /var/www/projetos/<slug>/public/
```

**Atenção:** não execute o helper diretamente com entrada não auditada. O frontend público da VPS não incorpora o legado React/Vite até concluir a migração de módulos e hardening.
