# Validação local — AL Sistemas VPS 2.0.14

Esta versão foi derivada do código-fonte completo da 2.0.13. **Não foi instalada na EC2**.

- `cd vps && npm run check && npm test`: 41 testes Node.js aprovados, incluindo três testes novos da Central de APIs.
- `python3 -m unittest discover -s vps/tests -p 'test_*.py' -q`: 25 testes Python aprovados.
- `bash -n instalar.sh inicio-termux.sh bootstrap-vps.sh`: sintaxe Shell sem erros.
- Teste com navegador Chromium headless em 390 × 844, com dados **simulados**: abertura e fechamento dos modais, estado de credenciais cadastradas, consulta DNS, 3 cartões, tutorial e HTML malicioso renderizado apenas como texto.
- Credenciais reais da Spaceship e alterações em produção: **não testadas**; as operações continuam restritas a leitura.
- `ZIP`, `SHA256SUMS.txt`, metadados, estrutura e paths validados após empacotamento.
- Não houve envio ao GitHub, emissão de Release ou acesso SSH à VPS.
