# Publicação em uma janela

No novo fluxo, **Novo projeto → Revisar projeto → Criar projeto** reutiliza a mesma janela. O endereço, o DNS e o HTTPS podem ficar em preparação enquanto você já envia os arquivos. Em um projeto existente, abra **Publicação e domínio**.

1. Toque em **Adicionar ZIP**. O botão abre o seletor de arquivos do dispositivo, sem exibir o campo nativo no painel.
2. Confira o nome e o tamanho do arquivo selecionado. Você pode remover ou trocar a seleção antes de publicar.
3. Toque em **Publicar ZIP**. O painel mostra a transferência e, separadamente, a validação e publicação na VPS.
4. **Publicação concluída** confirma que o servidor aceitou e publicou o pacote. Use **Ver site** quando o endereço estiver pronto. O botão indica HTTP se o HTTPS ainda não estiver ativo. Projetos sem endereço, com DNS pendente ou com o site desativado não têm um botão público enganoso.

Em **DNS e HTTPS**, teste as fontes consultadas ou solicite a retomada sem abrir outra janela. O botão Ver site inclui um identificador da publicação na URL de entrada para evitar reaproveitar o HTML do teste anterior. Isso não altera a URL salva do projeto nem invalida o cache de todos os arquivos do site.

Os limites e o formato do ZIP não mudaram. A publicação substitui somente os arquivos em public/ e mantém a versão anterior fora da raiz pública. Para saber como preparar o pacote, consulte [a documentação de hospedagem](ATUALIZACAO-2.0.40.md).
