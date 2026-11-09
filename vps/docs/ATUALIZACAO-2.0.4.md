# AL Sistemas VPS 2.0.4 — atualização da 2.0.3

**Estado:** código e testes locais concluídos; a atualização real na EC2 ainda não foi executada. Revise a documentação e faça snapshot antes de instalar. A 2.0.3 foi utilizada pelo usuário em Ubuntu 24.04.5 com quatro serviços ativos; o erro observado de `/run/lock` motivou uma correção na origem.

## Mudanças principais

1. Login com senha exibível/ocultável e confiança opcional por 30 dias no mesmo navegador. O TOTP ainda é obrigatório no primeiro acesso, em dispositivos desconhecidos e em ações sensíveis. O cookie não substitui senha. Mantenha backup da chave TOTP.
2. Interface dividida em módulos com barra inferior no Android e lateral em desktop. Não há simulação de recursos inacabados.
3. Atualizador de GitHub Releases autenticado, exigindo manifesto assinado Ed25519, hash SHA-256 e pacote ZIP seguro; execução em serviço root separado e rollback parcial de código. Sem a chave pública instalada e uma Release assinada, o painel apenas verifica versões.
4. Correção do arquivo de lock: cria `/run/alsistemas-vps/tasks.lock` dentro de diretório root-only, usando `ExecStartPre` e `ReadWritePaths` específico. A edição manual temporária da 2.0.3 com `lock.conf` é removida apenas quando corresponde exatamente a `[Service]\nReadWritePaths=/run/lock`.
5. Tutorial HTML autossuficiente na pasta principal, acessível pela aba Ajuda e offline.

## Atualizar a partir do ZIP existente na VPS

Com o ZIP novo enviado pelo Termux, conectado via SSH:

```bash
mkdir -p ~/al-sistemas-204
unzip -q ~/AL-Sistemas-v2.0.4-VPS.zip -d ~/al-sistemas-204
cd ~/al-sistemas-204
bash instalar.sh --plan
```

Se há projetos preexistentes e snapshot/backup confirmado:

```bash
sudo bash instalar.sh --allow-existing-host
```

O instalador preserva `/var/lib/alsistemas/admin.json`, o arquivo de confiança do dispositivo, backups e projetos existentes. Pode reiniciar o serviço do painel e encerrar as sessões anteriores. A configuração antiga do Nginx é preservada se não for solicitada troca de domínio.

**Não execute o instalador dentro da página web da 2.0.3:** o módulo GitHub da 2.0.4 não existe na versão instalada até sua atualização manual inicial.

## Habilitar atualizações futuras pela interface

O usuário deve gerar um par Ed25519 num ambiente privado e manter a chave privada em armazenamento criptografado, fora da VPS e GitHub. Gere apenas a chave pública e envie uma única vez via SSH, depois rode novamente o instalador com `--update-key-file /caminho/publica.pem`. Na aba Atualizações configure `proprietario/repositorio` confirmando senha e novo TOTP.

Para cada versão superior, assine o pacote com `tools/assinar-release.sh CHAVE_PRIVADA.pem AL-Sistemas-vX.Y.Z-VPS.zip` e anexe três arquivos à Release GitHub com tag `vX.Y.Z`: o ZIP, `update-manifest.json` e `update-manifest.json.sig`. O serviço root baixa e confere as assinaturas antes de aplicar qualquer mudança. Essa integração ainda requer homologação completa em VPS descartável.

## Diagnóstico e retorno

```bash
sudo systemctl status alsistemas-vps --no-pager
sudo journalctl -u alsistemas-vps -n 80 --no-pager
sudo journalctl -u alsistemas-updater -n 80 --no-pager
curl -i http://127.0.0.1:8181/api/health
sudo nginx -t
```

Cópias do código de versões anteriores ficam em `/var/backups/alsistemas/`. O mecanismo automático tenta restaurar núcleo/helper/unit/sudoers se a nova versão não iniciar, mas alterações de pacotes, bancos, sites e certificado **não estão cobertas por rollback transacional**. Para desastre maior, restaure o snapshot/sua estratégia de backup. Não exponha porta 8181 na internet.
