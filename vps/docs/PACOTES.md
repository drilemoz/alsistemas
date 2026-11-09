# Dependências e Pacotes: escopo da 2.0.10

A tela **Mais → Dependências** mostra o inventário real de oito pacotes do APT via `dpkg-query`, consultado somente quando o usuário entra no módulo ou solicita atualização.

Catálogo permitido: `php8.3-curl`, `php8.3-mbstring`, `php8.3-xml`, `php8.3-mysql`, `php8.3-zip`, `php8.3-gd`, `php8.3-intl`, `composer`.

- Ao selecionar um pacote não instalado, o painel exige senha e um **TOTP novo**. Há validação de sessão e CSRF.
- O helper com sudoers limitado confere um identificador de pacote na lista fixa e grava um pedido JSON root-owned em `/run/alsistemas-vps/`.
- A unidade systemd `alsistemas-package-installer.service` executa `apt-get install -y --no-install-recommends` apenas para o pacote aprovado, sem shell, e registra estado em `/var/lib/alsistemas/packages-status.json`.
- O painel mostra os estados `installing`, `completed` e `failed` quando disponíveis, sem progresso inventado. Logs ficam no `journalctl -u alsistemas-package-installer.service`.
- Instalar pacotes APT pode adicionar dependências e alterar serviços do sistema. Evite instalar pacotes desnecessários e teste em VPS de homologação. A funcionalidade não foi testada executando instalações APT numa EC2 real.
- Esta versão **não** gerencia múltiplas versões de Node, npm por projeto, Composer por site, pip, bancos MariaDB ou remoção de pacotes. Não oferece execução de comandos arbitrários.
