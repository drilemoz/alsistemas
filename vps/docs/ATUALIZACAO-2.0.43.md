# Administração de serviços e pacotes

Em **Dependências** você encontra Node, PHP, bancos de dados, Ruby on Rails, e-mail e ferramentas. A instalação do Ruby usa os pacotes da distribuição. Não publica automaticamente aplicativos Rails. O MongoDB Community 8.0 usa a fonte oficial com chave limitada ao repositório, no Ubuntu 22.04 ou 24.04, amd64 ou arm64. A compatibilidade de CPU e as dependências do servidor precisam ser atendidas pelo host. Outros catálogos usam somente os repositórios já configurados.

O painel de andamento pode ser minimizado. Pode acompanhar a saída do plano e as últimas linhas emitidas pelo APT enquanto muda de aba ou ao voltar ao painel. Cancelar está disponível na fila ou durante a verificação, antes de aplicar os pacotes. Ao aplicar mudanças, o APT não é interrompido pelo painel. Se cancelada ou se falhar, a operação pode ser tentada novamente.

**Remover** simula o plano, recusa efeitos sobre outros pacotes e usa APT sem purge ou autoremove. A ação MongoDB remove os componentes conhecidos da pilha instalada. Não há exclusão de diretórios de banco nem de projetos. Faça backup antes de remover um servidor de banco. A ação não desinstala o painel nem o sistema operacional.

Em **Serviços**, filtre unidades ativas, instaladas, gerenciáveis ou de e-mail. O inventário cobre serviços systemd do sistema, não processos avulsos. Consulte qualquer unidade listada. Os controles são destinados a serviços reconhecidos pelo catálogo. Nginx roda teste de configuração antes de um reinício. Ações que cortariam SSH, firewall ou o próprio painel não estão disponíveis.

Instalar **Mutt** ou **msmtp** não configura uma conta. Postfix e Dovecot são servidores opcionais e precisam de configuração. O filtro de e-mail mostra serviços e portas TCP em escuta na VPS. Não testa entrega externa, credenciais, MX, SPF ou DKIM.
