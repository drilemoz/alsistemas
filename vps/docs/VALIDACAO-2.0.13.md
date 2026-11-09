# Validação local — AL Sistemas VPS 2.0.13

A versão 2.0.13 foi baseada no ZIP 2.0.12 e modificada localmente; não houve implantação remota na EC2.

- Testes Node.js: `cd vps && npm run check && npm test`.
- Testes Python: `python3 -m unittest discover -s vps/tests -p 'test_*.py' -q`.
- HTML/JS testados também no Chromium headless com respostas simuladas para API, sem acessar a EC2: cartões de serviços, auditoria, dispositivos e notas sem HTML executável.
- Teste de rede de navegador para 127.0.0.1 foi bloqueado pelo ambiente; o teste com conteúdo carregado em memória não constitui implantação de produção.
- Não há teste com Spaceship real, MariaDB real nem com GitHub Release publicada nesta etapa.
- O workflow de publicação automática acompanha o ZIP, mas só executará se o repositório remoto tiver a versão e permissões necessárias.
