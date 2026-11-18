# Ajuda contextual e janelas de detalhes

**Visão geral** mantém métricas, estado dos sites e alertas. **Dados da VPS** abre detalhes como kernel, IP local e carga. O ícone de informação próximo a Visão geral explica os indicadores. Em **Saúde dos sites**, o ícone explica os limites do teste local.

**Publicação e domínio** mantém o ZIP, o progresso e o botão **Ver site** na tela principal da janela. **DNS e HTTPS** e a ajuda do ZIP são etapas dessa mesma janela. **Voltar** retorna à tela de publicação sem perder a seleção do arquivo. A consulta DNS continua disponível na etapa de DNS e HTTPS.

**Backups** mantém visível o escopo da cópia e as consequências da restauração. O ícone de informação explica o que a verificação SHA-256 comprova. **Dependências**, **Serviços**, **Atualizações**, **Integrações**, **Segurança**, **Logs** e **Arquivos** usam ajuda contextual para as informações técnicas. Em **Domínios**, as explicações de TTL e escopos abrem dentro da própria janela de ação.

O painel flutuante do APT continua minimizável e o estado de instalação permanece visível durante a navegação. As rotas, privilégio das operações e confirmações permanecem inalterados.

Na interface legada, os detalhes e ocorrências de erro, as fichas de projetos locais e GridFS e os índices do MongoDB passam a abrir em janelas próprias.

## Verificação após instalar

1. Na Visão geral, teste **Dados da VPS**, o botão de informação e a navegação de volta.
2. Abra a publicação de um projeto, adicione um ZIP e abra a ajuda e **DNS e HTTPS**. Ao voltar, confirme que o ZIP continua selecionado.
3. Abra a ajuda de Backups e confirme que os avisos de escopo permanecem à vista fora dela.
4. Em um domínio, abra **Apontar subdomínio** e a ajuda de TTL. Deve continuar aberta somente a janela de apontamento.

Não é necessário executar um reinício, publicar um ZIP ou alterar registros DNS para conferir a navegação.
