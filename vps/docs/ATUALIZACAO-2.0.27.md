# AL Sistemas VPS 2.0.27 — Arquivos e acompanhamento de atualização

## Falhas encontradas no vídeo

O arquivo era aceito pela API mesmo quando a interface permanecia em "Nenhum arquivo selecionado". Havia uma chamada a `formatBytes(file.size)` sem qualquer definição dessa função em `vps/public/app.js`, provocando `ReferenceError` ao alterar a seleção. Depois do envio, o painel reiniciava, a sessão em memória se perdia e o modal exibia indefinidamente o texto de reconexão, sem separar o estado verdadeiro do instalador.

## Correções

- Formatação do nome e tamanho do ZIP e validação prévia da extensão/tamanho. Botão "Enviar e instalar" fica desativado até existir arquivo válido. Melhoria equivalente no seletor de atualização do IguatamaOnline.
- Estrutura HTML sem botão embutido no rótulo clicável do arquivo e sincronização após eventos de retorno do navegador Android.
- Exibição do arquivo enviado no acompanhamento, persistindo somente nome/tamanho em sessionStorage temporário.
- Indicador separado para a conectividade, com últimas informações recebidas, tentativas de reconexão e limite de 8 s por consulta. Uma conexão indisponível nunca é exibida como conclusão da instalação.
- Persistência em `/var/lib/alsistemas/sessions.json` (ou `ALS_DATA_DIR`), com somente o hash do token, CSRF e expiração em 8 horas, gravação atômica e modo 0600; logout e revogação geral limpam sessões.

## Migração e testes

Ao atualizar a 2.0.26 para a 2.0.27, o primeiro reinício ainda pode exigir login porque a 2.0.26 não persistia sessões. Atualizações posteriores preservam a sessão até o término das oito horas ou logout. Os testes de unidade e integração não substituem um teste Chrome Android real nem prova de execução na EC2.
