# AL Sistemas VPS 2.0.31 — Explorador de permissões

## Interface

- Pastas e arquivos listados sob o projeto escolhido em `/var/www/projetos/<projeto>`.
- Caminho navegável por breadcrumb, busca local à página atual, paginação de 120 itens e recarregamento.
- Ícones de pasta, arquivo e cadeado para links/itens bloqueados.
- Toque em pasta abre subpasta; toque em arquivo abre modal de permissões `r/w/x` e informações de proprietário/grupo/modo.
- Botão ⓘ no cabeçalho explica bits Unix e restrições.
- Seção avançada preserva seleção de arquivos e usuário PHP, liberação temporária e restauração.

## Segurança e limites

O backend não aceita caminhos absolutos, não segue links simbólicos e somente opera sob `/var/www/projetos` em projetos autorizados. A instalação `iguatama-teste`, o próprio painel e itens sensíveis/ocultos não podem receber chmod pelo explorador. O diretório raiz não pode ter suas permissões alteradas por esta interface. A listagem tem limite de 4.000 entradas por pasta e profundidade máxima de 12 componentes.

`chmod` preserva proprietário/grupo; escrita pública (`o+w`, como 777/666) não é permitida. Pastas internas mantêm leitura+execução para o dono e não recebem escrita para grupo/outros. Antes de gravar, o helper verifica inode e modo atuais e bloqueia alteração caso outra operação tenha modificado o arquivo. Se uma liberação temporária do PHP estiver ativa, restaure-a antes de alterar permissões individuais.

O painel não fornece **conteúdo de arquivos**, edição, exclusão, cópia, renomeação nem chmod recursivo nesta versão. Ações administrativas exigem sessão válida, origem e CSRF, mas não senha ou TOTP adicionais além do login. A mudança só é feita depois da confirmação na tela.

## Instalação

Executar o instalador normal do pacote 2.0.31 com backup. O `instalar.sh` implanta `project_explorer.py` no helper root. Uma cópia antiga que não receba o novo arquivo não terá o gerenciador funcionando. Testar o fluxo no Chrome Android após instalar na EC2; os testes locais de filesystem usam diretórios temporários e não comprovam o funcionamento com permissões reais na VPS.
