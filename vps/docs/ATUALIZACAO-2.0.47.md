# Correção das métricas e da Visão geral

Na 2.0.46, a consulta dos endereços de rede pelo Node podia falhar porque a configuração do serviço systemd não admitia `AF_NETLINK`. O erro chegava à rota inteira de métricas, embora a verificação separada dos sites continuasse funcionando. A falha foi reproduzida com a mesma família de sockets bloqueada em um processo local.

A unidade permite `AF_NETLINK` para a descoberta de interfaces. O painel continua com o mesmo usuário de serviço, sem adicionar capacidades. Quando a consulta de rede é indisponível, o backend ainda retorna as outras métricas, além do estado de boot. Se a leitura de disco ou swap falhar, a interface mostra que o valor está indisponível.

A Visão geral coloca host, tempo ligado, CPU, RAM, disco e swap no topo. **Dados da VPS** abre kernel, endereços locais e serviços. **Ver sites** concentra código HTTP ou HTTPS, certificados e logs por endereço. Um 401 ou 403 sem falha de TLS é contado como acesso restrito, sem ser confundido com indisponibilidade.

Instale pelo fluxo de atualização por ZIP. O processo atualiza e reinicia o serviço do painel. Não reinicia o Linux. Em seguida, abra **Início** e confirme a leitura local, abra **Dados da VPS** para ver as interfaces e confira os detalhes em **Ver sites**.
