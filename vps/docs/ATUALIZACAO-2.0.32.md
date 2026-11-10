# AL Sistemas VPS 2.0.32 — Arquivos do projeto

## Mudanças

- Nome da tela: **Arquivos · projeto**. O menu na manutenção AWS abre o explorador diretamente.
- Botão Atualizar como ícone ao lado do título **Explorador de arquivos**. Na raiz não aparece o breadcrumb “Projeto”; em subpastas aparece um atalho para voltar à raiz.
- Controles no mesmo painel: selecionar usuário PHP, buscar na pasta, navegar entre arquivos, marcar arquivos elegíveis, acompanhar a seleção e liberar/restaurar escrita.
- Removidas as seções adicionais **Escrita temporária para o PHP**, **Escolher arquivos** e **Aplicar ou desfazer**.
- O primeiro toque em **Liberar escrita** salva o perfil de até 12 arquivos e aplica a liberação, em duas requisições validadas pelo servidor após uma única confirmação visual. Se não houver alteração em perfil já salvo, apenas libera. A restauração continua usando o snapshot das permissões anteriores.
- Quando a liberação está ativa, o usuário PHP e a seleção ficam bloqueados até a restauração. Seleção de subpastas persiste enquanto se navega dentro da tela.

## Segurança e testes

As APIs continuam sendo `/api/projects/:name/permissions`, `/permissions/catalog`, `/permissions/profile` e `/files`; o backend proíbe arquivos sensíveis, links, alterações fora de `/var/www/projetos` e limite acima de 12 arquivos. A conta PHP-FPM deve corresponder ao pool real do domínio. Os testes locais não comprovam permissões na EC2.

## Instalação

Aplicar a atualização sobre a versão 2.0.31 com backup do sistema. Se instalar por cópia manual, atualize `vps/public`, `vps/src`, `vps/package.json` e scripts administrativos quando houver mudanças. Após instalar, verifique `/api/health` e recarregue a página para eliminar cache antigo.
