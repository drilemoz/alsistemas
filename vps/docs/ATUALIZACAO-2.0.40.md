# Hospedagem gerenciada e diagnóstico DNS

Atualize em **Mais → Atualizar → Arquivo ZIP**. O atualizador altera somente o vhost gerenciado do painel para aceitar ZIP de projeto até 32 MiB. Configurações personalizadas de proxy precisam aplicar o mesmo limite à rota autenticada `/api/projects/<pasta>/hosting/upload`; o caminho normal mantém o limite anterior.

## Criar e publicar um site

1. Em **Projetos → Novo projeto**, preencha o nome, confirme a pasta sugerida e escolha Estático ou PHP 8.3.
2. Escolha **Criar subdomínio**, selecione o domínio registrado na Spaceship e preencha o subdomínio. Você também pode usar um endereço existente sem editar o DNS ou criar o projeto sem domínio.
3. Confirme o IPv4 público fixo da VPS. O painel pode sugerir o endereço a partir do registro A do domínio principal. A sugestão não prova que é o IPv4 da VPS. Se o administrador definir `ALS_VPS_PUBLIC_IPV4` no ambiente do serviço, essa configuração tem prioridade na sugestão.
4. Revise. O painel cria `/var/www/projetos/<pasta>/public`, publica um index inicial e valida o Nginx. O projeto aparece no catálogo antes de o DNS terminar.
5. Abra **Publicação e domínio** para ver as etapas, verificar DNS, retomar a configuração e enviar os arquivos.

O DNS automático usa `domains:read`, `dnsrecords:read` e `dnsrecords:write`. Usa apenas um registro A com TTL de 300 segundos na zona selecionada. Não compra domínios, não troca servidores de DNS e não substitui registros de outro destino. Se a zona usar outro provedor, o painel mostra qual registro deve ser criado. Se o apontamento falhar depois de criar a pasta, o projeto local permanece.

HTTPS é tentado em segundo plano após Google e Cloudflare confirmarem o IPv4 informado e ausência de IPv6 nesse endereço. O processo tenta novamente por um período curto e pode ser retomado a partir do painel. O HTTP-01 do Let's Encrypt precisa da porta 80 acessível externamente. O Certbot é instalado nas instalações novas ou pode ser instalado em **Dependências** nas antigas. A porta 443 precisa estar aberta para servir HTTPS. O painel não acessa APIs da AWS, não altera o security group e mantém HTTP disponível nesta versão.

## ZIP dos arquivos

Aceita até 32 MiB comprimidos, 96 MiB expandidos e 3.000 entradas. Envie os arquivos web na raiz do ZIP ou apenas dentro de `public/`, com `index.html` para estático e `index.php` ou `index.html` para PHP. O pacote deve conter somente conteúdo que pode ser publicado. Não envia banco, segredos ou diretórios privados de aplicações complexas. ZIP corrompido, links, arquivos especiais, travessia de caminhos e scripts incompatíveis são rejeitados. Esta função é dos projetos criados pelo novo assistente. O atualizador do IguatamaOnline permanece separado.

A publicação troca apenas `public/`. A versão anterior é mantida em `.als-release-previous` fora da raiz servida. Esse diretório guarda uma única versão local. Não é backup externo, não cobre banco de dados e não oferece restauração pelo painel nesta versão.

## Conferir DNS

**Servidores DNS** separa servidores configurados na conta, delegação observada no registro pai, Google/Cloudflare e destino A/AAAA. **Registros DNS** separa endereços e outros registros e mostra valor e TTL no pop-up de cada item. A consulta não muda os registros. Uma amostra de resolvedores ou servidores alcançáveis não comprova propagação universal.
