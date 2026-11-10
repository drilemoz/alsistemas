# AL Sistemas VPS 2.0.22 — Autoatualização

## Objetivo

A atualização **do próprio AL Sistemas** pelo GitHub Releases ou por arquivo ZIP não exige repetir a senha administrativa. O administrador deve ter sessão válida, mesma origem e token CSRF. O formulário conserva uma confirmação explícita antes da instalação. Não há TOTP adicional nesta operação.

As alterações do repositório GitHub, as instalações de pacotes APT e a manutenção privilegiada do IguatamaOnline continuam possuindo seus controles próprios, sem alterar o login.

## Proteções técnicas

- Somente uma atualização ativa; limite de 32 MiB, formato ZIP regular, sem links/caminhos especiais, versão estritamente superior e validação SHA-256.
- Releases públicas exigem manifesto SHA-256 correspondente e URL da origem permitida. O hash não prova identidade do autor. ZIP local não tem assinatura de origem.
- Backup de código e dados é criado antes da instalação. O instalador prepara o código numa pasta irmã de `/opt/alsistemas-vps/current`, testa a estrutura e faz renomeações controladas. Não copia código para dentro da pasta em execução.
- Em falha, o instalador tenta restaurar a pasta anterior; o serviço atualizador prepara uma cópia íntegra do snapshot e só então troca `current`. Diretórios de falha são mantidos para diagnóstico, sem tocar projetos externos.
- `/var/backups/alsistemas` é um diretório exclusivo root (0700), liberado por `ReadWritePaths` de `alsistemas-vps.service` junto às demais exceções. `ProtectSystem=strict` permanece ativo.
- A conclusão requer `/api/health` reportando `ok: true` e a versão esperada, não apenas `systemctl is-active`.

## Instalar a partir do painel 2.0.20

1. Faça snapshot EBS antes de atualizar. A implantação inicial da 2.0.22 usa **o atualizador 2.0.20**, que ainda tem os problemas de reversão aqui corrigidos: existe risco residual até esta versão estar instalada.
2. Na aba Atualizações, escolha GitHub (apenas se a Release 2.0.22 tiver sido publicada) ou Arquivo ZIP. **A v2.0.20 ainda pode solicitar a senha uma última vez**, pois é o código antigo que recebe a solicitação.
3. Acompanhe o progresso; depois, confira `/api/health` versão 2.0.22 e a interface. Se o antigo atualizador falhar, não repita tentativas às cegas: avalie os logs e restaure a partir do snapshot.
4. Da versão 2.0.22 em diante, os dois métodos passam a usar a sessão atual sem solicitar senha novamente.

## Limitações e recuperação

O teste de atualização real (incluindo systemd, Nginx e reinício de sessão) precisa ser feito na EC2. Em reinícios, sessões mantidas em memória podem expirar e exigir **novo login**. Isso não é uma solicitação extra de senha para autorizar a atualização.

Dados do portal IguatamaOnline e `/var/www/iguatama-teste/` não fazem parte dessa implantação. O sistema não altera o banco de dados do portal nem permissões gerais do host. Não desative as proteções do serviço como atalho.
