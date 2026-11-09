# AL Sistemas VPS 2.0.5 — atualização da 2.0.4

Este procedimento substitui somente o **código do núcleo VPS**, preservando dados de `/var/lib/alsistemas`, projetos existentes, configuração de autenticação e backups criptografados. Um backup do código anterior é criado pelo instalador em `/var/backups/alsistemas/`.

## Instalação manual via SSH (servidor existente)

Após baixar e enviar `AL-Sistemas-v2.0.5-VPS.zip` para o diretório pessoal da VPS:

```bash
mkdir -p ~/al-sistemas-v205
unzip -q ~/AL-Sistemas-v2.0.5-VPS.zip -d ~/al-sistemas-v205
cd ~/al-sistemas-v205
bash instalar.sh --plan
sudo bash instalar.sh --allow-existing-host
curl -fsS http://127.0.0.1:8181/api/health
```

Para VPS nova sem os diretórios protegidos, use `sudo bash instalar.sh` sem `--allow-existing-host`.

## Instalação simplificada via Termux em VPS nova

Consulte o tutorial HTML na raiz do ZIP. Use `inicio-termux.sh` e `bootstrap-vps.sh` após extrair esses dois arquivos para a mesma pasta do Termux. O assistente usa SCP/SSH, verifica o ZIP no servidor e pede confirmação antes da instalação.

## Alterações da 2.0.5

- Cabeçalho compacto, tema em pop-up, ícones de métricas e tipografia menor.
- Formulário de projeto é aberto pelo botão Novo projeto em modal; opções existentes do executor permanecem restritas.
- Configurações do GitHub são abertas por engrenagem no módulo Atualizações. O valor padrão `drilemoz/alsistemas` é gravado **somente quando ainda não existe configuração** e pode ser alterado mediante senha e TOTP.
- O atualizador **não pula** a verificação Ed25519/SHA-256 de Releases. A chave pública deve ter sido configurada previamente; a privada fica fora da VPS.
- Tutorial HTML da raiz e da interface contém índice com cartões e seção de instalação rápida.

**Não foi executada atualização remota na EC2 durante o desenvolvimento.** Depois de instalar, verifique os módulos no Chrome Android. A versão da sua VPS anterior (2.0.4) segue disponível até que você mesmo atualize.
