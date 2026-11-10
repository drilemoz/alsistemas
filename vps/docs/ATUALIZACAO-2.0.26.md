# AL Sistemas VPS 2.0.26 — Login com senha salva no navegador

## Problema e causa provável

O login da versão anterior já serializava `FormData`, portanto não dependia de eventos `input` para ler a senha. No entanto, quando o dispositivo era confiável, a tela ocultava o campo TOTP sem desativá-lo. Navegadores e gerenciadores de senhas podem restaurar nesse campo oculto um código antigo, e o backend rejeitava qualquer código TOTP inválido enviado mesmo com um token confiável válido. O resultado observado era o erro genérico “Senha ou código TOTP inválido”. Não há comprovação de que este tenha sido o único motivo do erro na EC2: uma senha salva desatualizada também é possível.

## Correção

- O input TOTP e a opção “Confiar neste dispositivo” são desativados quando o servidor identifica um cookie confiável, impedindo sua inclusão em FormData.
- O frontend usa diretamente `.value` do input de senha no envio, incluindo o valor preenchido automaticamente, e envia `otp: ''` no login confiável.
- O backend ignora um TOTP antigo ou inesperado **somente quando há cookie de dispositivo confiável validado**; continua exigindo senha correta e mantendo a exigência de TOTP novo em dispositivos não confiáveis, sem reutilização de códigos.
- O erro HTTP 401 mantém a mensagem genérica e acrescenta dica para verificar senha salva desatualizada.

## Validação e implantação

Testes automatizados verificam recusa de senha errada, recusa de login sem TOTP em aparelho não confiável e aceitação de login confiável com TOTP antigo inesperado. Conferir a compilação e testes locais na entrega; não há teste de interface em Chrome Android real nem atualização automática da instância na AWS.

**Segurança:** a senha vista em uma captura de tela deve ser alterada. Atualize a senha salva no gerenciador do navegador depois de trocar a senha do painel. Se o painel ainda estiver na versão 2.0.24, a correção não está instalada até concluir uma atualização real do núcleo VPS.
