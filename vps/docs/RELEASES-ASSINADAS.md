# Publicação e teste de Releases GitHub assinadas

**Estado verificado em 09/11/2026:** `drilemoz/alsistemas` existe, mas `releases/latest` responde 404 e `vps/package.json` no branch principal ainda indica `2.0.3`. Sem nova Release publicada, o botão **Verificar GitHub** deve informar isso e **não** iniciar atualização.

## Uma vez: chaves de assinatura

No Termux ou computador de confiança, fora da VPS e fora da pasta do projeto:

```bash
umask 077
openssl genpkey -algorithm ED25519 -out signing-private.pem
openssl pkey -in signing-private.pem -pubout -out update-public-key.pem
chmod 600 signing-private.pem
```

Guarde a chave **privada** com backup criptografado. Não a envie ao ChatGPT, ao Google Drive nem para o repositório. Envie **somente a chave pública** para a VPS por SCP e instale com o instalador do pacote 2.0.10:

```bash
sudo bash instalar.sh --allow-existing-host --update-key-file /home/ubuntu/update-public-key.pem
```

O comando acima só vale se você estiver dentro da pasta extraída da versão 2.0.10 e o arquivo público já tiver sido enviado. Ele preserva a origem HTTPS do painel durante atualizações existentes.

## Opção A: assinatura manual

Após compilar e testar a nova versão, utilize em ambiente confiável:

```bash
./tools/assinar-release.sh /local/seguro/signing-private.pem \
  AL-Sistemas-v2.0.10-VPS.zip /local/saida-release
```

O script verifica a versão interna e caminhos do ZIP e gera um diretório com exatamente três assets a publicar na Release `v2.0.10`:

- `AL-Sistemas-v2.0.10-VPS.zip`
- `update-manifest.json`
- `update-manifest.json.sig`

**Não** inclua `signing-private.pem` na Release. O atualizador verifica assinatura Ed25519 e SHA-256 antes da instalação.

## Opção B: publicação manual de workflow GitHub Actions

O projeto inclui `.github/workflows/vps-signed-release.yml`, com acionamento manual (`workflow_dispatch`) somente a partir da branch `main`. Ele valida o código, cria o ZIP do commit e assina com a chave privada obtida de um GitHub Secret chamado `ALS_RELEASE_ED25519_PRIVATE_KEY_B64`.

- Faça commit do código-fonte da 2.0.10 no GitHub antes de iniciar o workflow; a versão em `vps/package.json` deve coincidir com `2.0.10`.
- Configure **uma vez** o Secret com a chave privada codificada em base64 de uma linha. No Termux, `base64 -w0 /local/seguro/signing-private.pem` cria o valor, que não deve aparecer em capturas, logs ou Git.
- Acione o workflow manualmente informando `2.0.10` na versão; acompanhe o Actions e confirme a Release pública antes de usar o painel.
- Em caso de falha, não publique manualmente assets incompletos ou assinatura diferente daquela da VPS.

O workflow usa permissão `contents: write` apenas na tarefa de publicar e não sobrescreve Releases existentes. Configure proteção para a branch principal, pois qualquer código executado com acesso ao Secret de assinatura precisa ser confiável.

## Teste do painel

1. Abra Atualizações → Verificar GitHub. Com ausência de Releases, deve exibir aviso de indisponibilidade, não simular atualização.
2. Depois de publicar Release assinada e instalar chave pública, verifique se há versão **superior** à instalada e os três assets obrigatórios.
3. Para teste de aplicação real, use uma VPS de homologação com versão anterior, backup e a chave pública. O painel exige senha e TOTP novo antes de iniciar o serviço.
4. Confira a saúde e o estado da atualização pelo painel e `journalctl -u alsistemas-updater.service -n 60 --no-pager`.

**Limitação:** os testes locais validam assinatura, pacote, validações de entrada e rollback simulado. Não houve publicação remota de Release nem atualização automática real na EC2 nesta entrega.
