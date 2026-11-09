# Validação local — AL Sistemas VPS 2.0.16

Data: 09/11/2026. Base: versão-fonte 2.0.15, sem acesso à EC2 ou às credenciais reais da Spaceship.

- `npm run check`: sintaxe dos módulos JavaScript validada.
- `npm test`: 53 testes Node.js aprovados, incluindo 9 cenários novos para gravação DNS e 2 para os formulários; testes HTTP exigem sessão, CSRF e senha.
- `python -m unittest discover -s vps/tests -p 'test_*.py' -q`: 25 testes Python aprovados.
- Chromium headless, dados simulados, sem rede: abrir teste DNS, listar registros, criar A, editar TTL e excluir, confirmando chamada do frontend para backend; 0 erros JavaScript. O teste também utilizou texto HTML potencialmente perigoso em registro TXT e confirmou que não foi interpretado como HTML.
- Documentação e versionamento sequencial foram sincronizados; integridade do ZIP e checksums devem ser verificados na entrega.

**Limites:** nenhuma mutação DNS real, sem teste contra API autenticada da Spaceship, sem atualização real da EC2, sem teste de propagação DNS. O ambiente de navegador foi simulado. Registros críticos e grupos não customizados são bloqueados; valores existentes só podem ter TTL alterado nesta etapa.
