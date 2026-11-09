# AL Sistemas VPS 2.0.13 — atualização

## Antes de atualizar

- A instância em produção pode ter projetos, Nginx, certificados e banco MariaDB; faça backup independente antes de instalar.
- Mantenha `/var/lib/alsistemas`, o diretório de produção e a unidade systemd atuais. Não remova o projeto IguatamaOnline nem a instalação de testes.
- O fluxo de atualização automática exige Release publicada com ZIP e `update-manifest.json`; a publicação no GitHub não é realizada pelo simples empacotamento local.

## O que mudou

Auditoria, cartões de status, dependências, dispositivos confiáveis e notas/README/CHANGELOG da Release na tela Atualizações. Não foram adicionadas ações de reiniciar serviços nem modificar registros DNS.

## Validação pós-instalação

1. Confirme a versão na página Início ou em `curl -fsS http://127.0.0.1:8181/api/health` na EC2.
2. Verifique auditoria sem `undefined`, detalhes dos serviços e lista de dispositivos.
3. Em Atualizações, use Verificar GitHub; se houver Release, veja o texto e o README correspondente à tag.
4. Execute `sudo nginx -t` e `sudo systemctl status alsistemas-vps --no-pager` se houver anormalidade.

**Observação:** a nova consulta de README utiliza unicamente `raw.githubusercontent.com` com o repositório configurado e tag numérica validada, limites de resposta e timeout. Falhas de README não impedem a instalação.
