# AL Sistemas VPS 2.0.28 — Projeto e permissões

## Interface

Na página do projeto, a **Ficha técnica** fica ao lado do nome; a visão geral mostra apenas **Tecnologia**, **Acesso** e **Nginx**, alinhados em uma linha no celular. **Diretório** foi retirado da visão geral; dentro de **Manutenção na AWS**, o botão **Diretório** abre um pop-up com o caminho de produção e cópia. A observação sobre a instalação de testes foi movida para esse pop-up.

O **Diagnóstico** passou a exibir um resumo por estado, quantidade de arquivos encontrados e cartões simples com ícones. A ajuda (`i`) explica que é uma **análise somente leitura**, não concede escrita, não comprova qual pool PHP é usado pelo domínio nem testa MySQL. Os detalhes de modo, UID/GID e caminhos reais deixam de ocupar a tela principal. O bloqueio por dono da pasta não foi removido.

## Permissões em outros projetos

A página de cada outro projeto possui **Permissões do projeto**. Antes de permitir escrita, **é obrigatório** configurar um perfil no servidor com uma lista fixa de até 12 arquivos e os nomes reais do proprietário da pasta e da conta PHP-FPM que atende ao site. O cliente HTTP envia **somente** o nome do projeto e `mode=allow|restore`. Não é possível digitar arquivos ou usuários arbitrários na API.

Exemplo **ilustrativo**, que deve ser adaptado após conferir os donos reais e o pool PHP. Não execute uma configuração com contas desconhecidas:

```bash
sudo stat -c '%U:%G %a %n' /var/www/projetos/NOME_DO_PROJETO
sudo stat -c '%U:%G %a %n' /var/www/projetos/NOME_DO_PROJETO/public/arquivo.php
sudo grep -R '^[[:space:]]*user[[:space:]]*=' /etc/php/*/fpm/pool.d/*.conf
```

Crie `/etc/alsistemas-vps/project-permissions.json` com privilégios root e conteúdo semelhante a:

```json
{
  "projects": {
    "site-exemplo": {
      "owner": "usuario-deploy",
      "phpUser": "usuario-php-do-site",
      "files": ["public/atualizador.php", "VERSION"]
    }
  }
}
```

Exemplo de instalação segura, **após** preparar localmente o JSON acima:

```bash
sudo install -o root -g root -m 0600 /CAMINHO/ARQUIVO-REVISTO.json /etc/alsistemas-vps/project-permissions.json
sudo chown root:root /etc/alsistemas-vps
sudo chmod go-w /etc/alsistemas-vps
```

O exemplo de arquivo é uma **política de autorização**. Não contém senha nem chaves. Não cadastre o nome `iguatamaonline`, `iguatama-teste` ou `alsistemas` no perfil genérico. O IguatamaOnline segue no módulo especializado e ainda bloqueia automaticamente a manutenção ao detectar proprietário `iguanews-deploy`, que não está entre `root` e `ubuntu`; alterar isso precisa de revisão da propriedade no servidor, e não de `chmod -R`.

Quando o perfil estiver válido, toque no projeto → **Permissões do projeto** → **Liberar temporariamente**. Ao terminar, use **Restaurar permissões**. A alteração limita-se aos arquivos existentes e explicitamente cadastrados. Um arquivo substituído, diretório inseguro, perfil alterado ou proprietário divergente bloqueia operações de risco. Antes de restaurar, o painel exige que os inodes ainda correspondam aos originais.

## Segurança e validação

- A sessão de login e token CSRF são obrigatórios; nenhuma segunda senha ou TOTP é solicitada.
- O helper continua root-owned e não recebe caminhos nem comandos arbitrários da web.
- O servidor web nunca configura os perfis. Os perfis são registrados por SSH/root.
- O sandbox `systemd` e os diretórios privados do helper continuam em vigor.
- A interface e os caminhos da produção **não foram alterados na EC2**. Testes automáticos não substituem testes com proprietário, usuário PHP-FPM e navegador Android reais.
