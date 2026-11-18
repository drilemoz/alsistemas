# Visão geral da VPS

**Início** mede CPU por diferença de contadores, e mostra RAM disponível, disco e swap com barras. Abra **Servidor, rede e serviços** para ver carga média, kernel, endereços locais, horário do boot e estado dos componentes. Os alertas são locais e sob demanda, não equivalem a monitoramento externo ou garantia de saúde completa.

**Saúde dos sites** testa até 12 endereços detectados na configuração dos projetos, enviando HEAD ao Nginx em loopback. O painel não consulta DNS público nem segue redirecionamentos. HTTPS mostra validade do certificado observado e expiração quando possível. Um site que não aceita HEAD não é considerado fora do ar só por responder 405. Acesso externo, DNS, firewall e rotas não são validados por essa verificação.

**Reiniciar VPS** usa o systemd, sem chamar AWS ou desligar a instância. Digite REINICIAR para confirmar. O pedido fica agendado por alguns segundos e o sistema externo ao processo web revalida tarefas do painel antes de solicitar um reinício normal. O painel impede que se agende com publicação, envio, backup ou atualização administrativa em andamento quando identificados. Operações executadas fora do painel podem não ser reconhecidas. Não use esta função enquanto executa tarefas críticas no SSH.

Na volta, o painel compara o identificador de boot anterior com o atual. Uma simples volta da conexão não confirma o reinício. Se o Linux não voltar ou o painel não responder, use o acesso externo da hospedagem. Não há opção para desligar, ligar instância parada ou alterar recursos da AWS.

A atualização não executa um reinício. O timer fica desativado até um pedido autenticado e confirmado.
