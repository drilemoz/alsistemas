# AL Sistemas VPS 2.0.29 — Permissões pelo painel

## Fluxo

1. Entre no painel com senha (e TOTP somente quando o dispositivo não for confiável).
2. Na aba Projetos escolha o projeto. Para IguatamaOnline, use Manutenção na AWS → Permissões.
3. Clique **Permissões do projeto** e escolha até 12 arquivos na lista de arquivos elegíveis. A lista é gerada pela inspeção real do servidor.
4. Selecione o usuário do PHP-FPM que precisa gravar esses arquivos. A lista inclui os usuários de pools detectáveis e `www-data` se presente. **A presença da conta não prova que o domínio utiliza esse pool**. Verifique antes de conceder escrita.
5. Clique Salvar seleção. Essa operação só configura o perfil, ainda não muda modo ou grupo de arquivos.
6. Clique Liberar escrita. Após terminar a atualização, clique Restaurar permissões.

## Segurança e restrições

- O navegador não fornece caminhos absolutos: o executor restringe tudo a `/var/www/projetos/<projeto>/`.
- Não seleciona diretórios inteiros, links simbólicos, arquivos ocultos, backups, bancos de dados, segredos e outros arquivos vetados.
- O proprietário da pasta é lido pelo helper, inclusive um usuário de implantação como `iguanews-deploy`. Não é necessário renomear o dono para `root`/`ubuntu`.
- O perfil fica em `/etc/alsistemas-vps/project-permissions.json`, criado automaticamente como root, modo 0600. Só o helper pode atualizá-lo; o usuário `alsistemas` não deve possuir acesso de escrita ao diretório.
- Após liberação, os proprietários/grupos/modos originais ficam num snapshot privado. Não altere os arquivos selecionados por outro processo antes de restaurar, pois a restauração rejeita inodes substituídos.
- A instalação de teste `iguatama-teste` e o núcleo do painel `alsistemas` são excluídos.
- Um painel comprometido ainda representa risco administrativo: preserve autenticação, sessão, CSRF, TLS, logs e backups.

## Implantação e validação

A versão do código foi testada com simuladores de projeto e backend. Não houve alteração na AWS. O serviço `alsistemas-vps` precisa estar atualizado para 2.0.29. Se o painel avisar que a conta PHP não está disponível, confira os pools FPM ativos no servidor antes de editar qualquer arquivo. Para modificar os arquivos `VERSION`, `app/updater.php` ou `public/admin.php`, selecione-os explicitamente na lista.
