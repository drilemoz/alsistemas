# AL Sistemas VPS 2.0.37 — Domínios, DNS e redirecionamentos

Na navegação do computador, abra **Domínios**. No celular, escolha **Mais → Domínios** na 2.0.37 ou toque em **Domínios** na barra inferior a partir da 2.0.38. Configure a chave em **APIs e Integrações → Spaceship**. Se a chave atual ainda não tiver os escopos necessários, gere ou configure outra pelo API Manager da Spaceship.

| Função | Permissões da chave |
| --- | --- |
| Lista de domínios, vencimento e configuração atual | `domains:read` |
| Ver DNS na Spaceship | `dnsrecords:read` |
| Criar ou trocar o destino de um subdomínio na zona Spaceship | `domains:read`, `dnsrecords:read`, `dnsrecords:write` |
| Alterar servidores DNS e renovação automática | `domains:read`, `domains:write` |
| Criar ou ativar redirecionamento no Nginx | `domains:read`. Não utiliza a API de escrita DNS |

## Subdomínios e DNS

- **Apontar subdomínio** cria um registro `A` ou `CNAME` personalizado. Em **Ver DNS → Trocar destino**, substitui um registro único do mesmo tipo e nome. Nomes protegidos, a raiz e registros de produto não são editados por esse fluxo.
- A Spaceship não oferece uma troca atômica de destino. Para `A`, o painel cria o novo valor, confirma ambos e remove o antigo. Para `CNAME`, precisa remover o antigo antes de adicionar o novo. Se a mudança falhar, reconcilia com a zona e tenta compensar quando o estado for conhecido. Não repita se o estado ficar indeterminado.
- A listagem DNS segue o limite atual de 500 por consulta. O painel bloqueia alterações quando a zona inteira não foi conferida. A lista de domínios da conta é paginada.
- O seletor de servidores DNS não migra registros de site ou e-mail. Alterar servidores exige revisão explícita da configuração anterior e da nova. O painel não compra, transfere nem renova manualmente domínios.

## Redirecionamentos

1. Crie um subdomínio não crítico no DNS ativo e aponte o IPv4 para a VPS. **Redirecionar URL** não altera DNS.
2. Em **Nova regra**, informe o subdomínio e o destino. Use **302** para testar antes de **301**. Para preservar caminhos e parâmetros, informe uma URL-base sem parâmetros. Sem essa opção, o destino é fixo.
3. O painel administra somente regras próprias. As alterações passam pela validação do Nginx antes do recarregamento. Se falharem, o executor restaura a configuração anterior e tenta recarregá-la. Regras externas, configurações que já atendam ao nome e ciclos entre regras do painel ficam protegidos.
4. Use **Testar** e informe o IPv4 público esperado da EC2. O painel verifica a resposta DNS observada, faz HEAD na origem, valida o certificado TLS e compara a primeira resposta com o código e o destino esperados. Não segue redirecionamentos. IPv6 e alcance de outros pontos na internet não são validados.

### HTTPS para o endereço de origem

O painel só habilita HTTPS se já existir um certificado do subdomínio sob `/etc/letsencrypt/live/<origem>/`. O fluxo não instala Certbot nem emite certificados automaticamente. Se já usa Certbot, crie primeiro a regra HTTP, confirme que a origem aponta para a VPS e que a porta 80 está acessível, então emita usando o webroot preparado pelo instalador. Exemplo, substitua o hostname pelo seu.

```bash
sudo certbot certonly --webroot -w /var/lib/letsencrypt/alsistemas-webroot -d ir.exemplo.com
```

Depois edite a regra, marque **Ativar HTTPS com certificado existente** e teste. Configure o recarregamento do Nginx após renovações pela rotina Certbot do servidor. Excluir uma regra não exclui DNS nem certificado.

Documentação oficial: https://docs.spaceship.dev/ · https://nginx.org/en/docs/switches.html · https://letsencrypt.org/docs/challenge-types/
