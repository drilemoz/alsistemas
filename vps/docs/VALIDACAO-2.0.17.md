# Validação local — AL Sistemas VPS 2.0.17

Data: 09/11/2026. Base 2.0.16, sem acesso à EC2 e sem disparar instalações reais.

- `npm --prefix vps run check` — sintaxe dos módulos JavaScript.
- `npm --prefix vps test` — 55 testes Node.js aprovados, incluindo upload binário com sessão, CSRF, senha, limite de tamanho, SHA-256 e limpeza de arquivo.
- `python -m unittest discover -s vps/tests -p 'test_*.py' -q` — 26 testes Python aprovados, incluindo arquivo ZIP local autorizado, validação SHA e simulação de rollback antigo.
- `bash -n instalar.sh` e `python -m py_compile vps/admin/*.py` — sintaxe válida.
- Fluxo de atualização completo na EC2 e interface em navegador físico **não validados** aqui. Devem ser testados após snapshot e instalação inicial.
- A atualização não modifica diretórios de sites gerenciados pelo usuário; o instalador preserva as raízes de projetos existentes.
- O modo `--core-upgrade` é usado pelo atualizador para evitar APT nas atualizações do núcleo; implantação inicial manual usa `--allow-existing-host` conforme guia.

A porcentagem do processo só aparece em transferências quando o total em bytes é conhecido. Instalação, backup e verificação são mostrados por etapa, sem porcentagem inventada.
