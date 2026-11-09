# AL Sistemas VPS 2.0.16 — atualização

## Mudanças

Gerenciamento controlado de DNS Spaceship: adicionar A/CNAME/TXT, editar TTL de registros personalizados e excluir registros não protegidos. Para escrever é necessário permitir `dnsrecords:read` e `dnsrecords:write` na chave da Spaceship. As credenciais já cadastradas continuam salvas; atualizar permissões na conta da Spaceship pode exigir nova chave conforme o API Manager.

## Atualização na EC2

1. Faça backup verificado de `/var/lib/alsistemas/`, código e unidade systemd; preserve a chave `integrations.key` e o JSON criptografado.
2. Use o atualizador do painel quando houver Release válida com manifesto SHA-256 ou transfira o ZIP e execute `bash instalar.sh --plan` antes da instalação; **não use scripts não auditados ou comandos de terceiros**.
3. Para a instalação no servidor Ubuntu com serviços existentes, consulte `vps/docs/INSTALACAO.md` e a opção `--allow-existing-host` após validar o plano e backup.
4. Confirme a versão retornada por `/api/health` e o estado do serviço, Nginx e IguatamaOnline.
5. Em **APIs e Integrações**, teste DNS antes de qualquer alteração. Utilize primeiro um registro de teste não utilizado (ex.: `teste-dns-als`), nunca `@`, `www` ou `painel`.

## Limites e segurança

- Sem escrita automática no novo projeto: essa integração será uma etapa posterior.
- Criação de A, CNAME e TXT; edição apenas do TTL; exclusão apenas de registros personalizados, não protegidos.
- A SpaceShip pode responder 204 enquanto a resolução pública ainda não mudou. Nunca repita uma operação após falha de rede sem consultar o estado real.
- Nomes reservados são bloqueados; alterações de produção críticas permanecem no painel oficial da Spaceship.
- Nenhum registro DNS real foi alterado durante o desenvolvimento; testes utilizam simulações.
