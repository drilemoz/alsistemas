# Atualização 2.0.7 — GitHub Manager e validação CI

Esta versão corrige falhas da execução dos testes em GitHub Actions sem relaxar verificações administrativas do sistema real.

## GitHub Manager

O ZIP contém `github-manager.json`, `app_identity.json` e `VERSION` na **raiz**, todos com versão `2.0.7`. O aplicativo GitHub Manager detecta `github-manager.json` primeiro. No GitHub, o comparador só reconhecerá essa versão após o envio do pacote e atualização da branch escolhida. Antes disso, a versão remota pode continuar como “não identificada”. Não selecionar “enviar mesmo assim” sem revisar os arquivos listados, principalmente arquivos que podem ser removidos.

## Workflow

Os testes Python usam simulações apenas para arquivos temporários de CI. O instalador e o helper continuam exigindo permissões reais em produção.

## Instalação existente

O painel já instalado permanece inalterado até a aplicação de uma Release assinada ou a execução do instalador com o pacote novo. As configurações e a autenticação existentes não precisam ser reinicializadas.
