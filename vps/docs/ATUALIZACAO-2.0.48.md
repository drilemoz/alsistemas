# Atualizações e reinício acompanhado

## Atualizações

Abra **Mais → Atualizar**. A tela informa a versão instalada e a disponível na Release estável do repositório configurado. Sem pacote pronto, o painel não oferece a instalação. Falha de GitHub não significa que o painel esteja atualizado.

Com sessão ativa e o painel aberto, a verificação ocorre na entrada, ao voltar à aba quando a consulta estiver vencida e periodicamente, em torno de 30 minutos. **Verificar agora** permite adiantar a consulta, com limitação para não saturar a API. A consulta é compartilhada entre abas pelo cache do servidor. Ao dispensar o aviso, o navegador o oculta para aquela versão e repositório. A instalação nunca é automática. O instalador valida novamente a versão revisada, a origem e o manifesto. Se a Release mudar antes da instalação, o pedido falha sem trocar silenciosamente o pacote.

## Reinício do Linux

O Linux só recebe o pedido após confirmação explícita. O temporizador do servidor é de 8 segundos. O painel usa os horários retornados pelo servidor e guarda somente referência e horários do pedido no navegador. O acompanhamento é global e não reenvia o pedido. Se o agendamento não tiver sido confirmado, não há contagem fictícia.

Com HTTPS e o componente offline já carregado, recarregar a página durante a indisponibilidade abre uma tela auxiliar. O cache contém somente os três arquivos estáticos dessa tela, sem dados privados ou respostas de API. A tela testa o retorno do serviço e reabre o painel. Se a sessão expirar, o pedido é retomado após novo login. O navegador precisa estar aberto para continuar verificando.

O retorno do serviço web não prova reinício do Linux. A confirmação usa um boot diferente do registrado no pedido. Se o agendamento for bloqueado, o painel mostra o motivo. Se a VPS não responder após o limite de acompanhamento, use **Verificar agora**, o console da AWS ou SSH. A instalação desta versão reinicia apenas o serviço do painel.

## Validação após instalar

- Abra Início e outra aba do painel. Confira se o aviso de Release acompanha a navegação e some ao dispensar a versão.
- Confira a versão disponível antes de confirmar uma instalação. Não é preciso instalar para validar a consulta.
- Para testar um reinício real, use uma janela de manutenção e confirme se os sites podem ficar temporariamente indisponíveis.
