# AL Sistemas VPS 2.0.3 — atualização a partir da 2.0.2

**Estado:** código com testes locais, não homologado em EC2 ou Ubuntu 24.04 real. Não atualizar diretamente a produção antes de testar em VPS descartável.

## Alterações

- Sem alterações no usuário admin, senha scrypt/TOTP, banco legado, sites ou vhosts anteriores.
- Novo helper `backup_project` cria um snapshot cifrado apenas de `public/` de projeto gerenciado, sem alterar conteúdo ou banco. Tamanho máximo 64 MiB de arquivos, até 1500 arquivos e cinco cópias por projeto. Sem retenção automática ou restore na UI.
- `list_backups` lista cópias locais; `validate_nginx` executa somente teste de sintaxe; status dos serviços é somente leitura.
- Instalador instala `gnupg` (já instalado como dependência desde versão inicial), cria `/var/backups/alsistemas-vps` privado e atualiza o `ReadWritePaths` para permitir apenas o helper root trabalhar com backups.

## Procedimento recomendado

1. Snapshot da VPS e backup independente verificável de **sites, bancos, SSL e configurações**, antes de alterar pacotes ou systemd.
2. Extraia o ZIP novo em pasta isolada, confira `SHA256SUMS.txt` e revise `instalar.sh`.
3. Execute `bash instalar.sh --plan` e confira portas e recursos.
4. Na VPS de homologação Ubuntu 24.04, execute `sudo ./instalar.sh` com flags já escolhidas; sites preexistentes exigem `--allow-existing-host` após revisão, não use isso em produção sem plano de restauração.
5. Verifique `nginx -t`, systemd, HTTPS, login TOTP e a unidade. Crie um projeto descartável, faça um backup e teste descriptografia em diretório temporário **fora da hospedagem ativa**.
6. Guarde frase secreta fora da VPS. Antes de confiar na atualização, ensaie o rollback por snapshot/sistema de arquivos, não há recuperação automática integral.

**Não inclui:** backup de bancos de dados, restore web, agendamento, cópia off-site, gerência de Secrets, deploy GitHub, SSL por projeto ou isolamento de PHP-FPM por cliente.
