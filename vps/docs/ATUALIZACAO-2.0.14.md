# AL Sistemas VPS 2.0.14 — atualização

## Antes de atualizar

1. Faça backup de `/var/lib/alsistemas` (incluindo `integrations.key` e `integrations-spaceship.json`), código ativo e configurações da VPS.
2. Preserve projetos, certificados, Nginx e MariaDB. Não remova os arquivos de produção do IguatamaOnline nem a instalação de testes.
3. A atualização automática requer Release publicada com ZIP e manifesto SHA-256; na atualização manual, revise o plano `bash instalar.sh --plan`.

## O que mudou

A Central de APIs foi reorganizada: lista compacta de integrações, modal Gerenciar com status de credenciais, modal Testar DNS com cartões, ícones e cópia de valores. Campos vazios na configuração **não** significam credenciais perdidas: as chaves criptografadas não retornam ao navegador.

## Testes pós-instalação

1. Confirme a versão 2.0.14 no rodapé e em `curl -fsS http://127.0.0.1:8181/api/health` na EC2.
2. Abra **APIs e Integrações** e confirme o status das credenciais da Spaceship.
3. Abra **Gerenciar**: os campos permanecem vazios, mas o texto confirma as credenciais já salvas.
4. Toque em **Testar DNS**, consulte um domínio real da conta Spaceship e verifique os registros. Essa operação é somente leitura.
5. Confira Nginx, login e a lista de projetos. Execute `sudo nginx -t` na EC2 em caso de problema.

Nesta versão não há operações de escrita DNS, alteração de banco de dados, projetos ou serviços pela Central de APIs.
