# AL Sistemas VPS 2.0.20 — Páginas dos projetos

## Alterações

A versão 2.0.20 reorganiza a interface do módulo Projetos. Tocar em um projeto abre uma **página** com nome, diretório, estado Nginx e seção expansível de domínios, sem dialog de detalhes. Projetos gerenciados mantêm as ações de backup criptografado e ativação/desativação na própria página. Projetos externos não recebem permissão de edição por essa mudança.

O projeto `iguatamaonline` possui a entrada **Manutenção na AWS**, que leva a uma página de ferramentas: Diagnóstico, Permissões e segurança, Atualizações, Backups e restauração, Histórico e relatórios. Cada ferramenta abre uma página independente; Atualizações dá acesso à página de Andamento. A navegação usa URLs fragmentadas (`#project/iguatamaonline/aws/...`), suporta os botões Voltar/Avançar do navegador e a recuperação da tela depois de recarregar a página, desde que a sessão continue válida.

Os campos de senha e TOTP não aparecem mais fixos nas páginas. Eles são apresentados em uma confirmação curta quando a ação crítica é solicitada e são apagados após confirmar ou cancelar. O servidor mantém a exigência de uma senha e **um TOTP novo por operação**, não por etapa do processo. A vistoria de permissões continua sendo uma estimativa do pool padrão, não a comprovação do usuário PHP que atende o domínio.

O relatório do projeto combina somente o último status persistido de atualização com os eventos recentes de auditoria. Não expõe logs completos do systemd, banco de dados ou uploads. As funções de backend e seus limites de segurança não foram modificados nesta versão.

## Como validar após instalar

1. Fazer backup/snapshot EBS da EC2 antes de alterar o painel, pois a instalação anterior sofreu reversão na verificação de saúde.
2. Instalar o núcleo v2.0.20 pelo `instalar.sh --core-upgrade --allow-existing-host` somente após checar os procedimentos de atualização manual, os requisitos da VPS e o plano com `--plan`.
3. Verificar `/api/health`, `systemctl is-active alsistemas-vps` e `nginx -t` após a instalação. Não confundir publicação de código com implantação efetiva.
4. Abrir **Projetos → IguatamaOnline → Manutenção na AWS** e visitar as cinco categorias, testar Voltar/Avançar, verificar o estado persistente da atualização e consultar a vistoria sem alterar permissões.
5. Confirmar que projetos externos diferentes do IguatamaOnline seguem somente leitura. Não liberar escrita no código PHP sem necessidade documentada.

## Limitações

- O teste de interface em navegador utilizou uma API simulada e não prova a implantação em EC2.
- A atualização do IguatamaOnline não substitui backup de banco ou snapshot EBS.
- Se a instalação do painel falhar na verificação de saúde, analisar os logs reais antes de novas tentativas.
