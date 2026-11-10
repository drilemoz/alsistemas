# AL Sistemas VPS 2.0.33 — Central de Projetos

## Funcionalidades realmente implementadas

- Visão geral compacta por projeto com status inferido de configuração local, versão `VERSION` quando válida, quantidade e tamanho lido de arquivos (amostragem limitada por entradas e profundidade).
- Acesso direto às ferramentas existentes de Arquivos e permissões para nomes autorizados, backup criptografado apenas para projetos gerenciados, e centro de manutenção AWS somente para IguatamaOnline.
- Diagnóstico em modo leitura com PHP CLI, Composer (contagem de dependências declaradas), disponibilidade global do serviço MariaDB, diretório e volume, Nginx e informação de HTTPS configurado.
- Teste HTTP sob demanda: requisição HEAD ao Nginx da própria VPS em `127.0.0.1:80`, usando o Host do vhost detectado e habilitado, sem DNS, sem redirecionamento e com timeout. Não mede acesso pela Internet nem validade do SSL.
- Histórico administrativo filtrado por projeto, sem IP e textos de falhas. Cópia e download TXT de relatório pela interface. Para IguatamaOnline, também inclui o resumo da última atualização conhecida.

## Segurança e limitações

- Todos os endpoints de diagnóstico exigem sessão autenticada. Não seguem links simbólicos nem abrem `.env`, chaves, bancos ou diretórios protegidos. Varredura limitada a 2500 entradas, 350 pastas e profundidade 6; tamanho parcial é identificado.
- `PHP CLI` não comprova configuração do pool PHP-FPM; estado `mariadb` é da VPS, não ligação com banco do projeto. Domínio/HTTPS informado significa configuração local, nunca certificado ou site público validado.
- **Não foi implementado:** editar conteúdo de arquivos, gerenciamento/restore SQL, varredura de vulnerabilidades Composer, logs completos Nginx/PHP por projeto, alertas automáticos, backups agendados ou restauração granular. Esses módulos exigem controles de acesso, backups e testes adicionais.
- Os mecanismos antigos de atualização GitHub/ZIP, backups, arquivos/permissões e manutenção AWS foram preservados.

## Validação de implantação

1. Guarde snapshot EBS e backup dos dados importantes. Atualize o código do AL Sistemas pelo processo usual.
2. Confira que `/api/health` retorna `ok: true` e `version: "2.0.33"`.
3. Após o login, entre em **Projetos → projeto → Diagnóstico e armazenamento** e compare com dados reais da VPS. Execute o teste HTTP apenas se houver vhost local habilitado.
4. Entre em **Histórico administrativo**, verifique o isolamento dos eventos e teste **Copiar relatório**.
5. Confira também Arquivos, backup e Manutenção AWS, sem realizar mudanças de permissões em produção apenas para validar.

O teste de interface no Chrome Android e a implantação no servidor AWS não foram realizados neste ambiente; resultados locais não comprovam funcionamento em produção.
