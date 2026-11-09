# AL Sistemas VPS 2.0.6: atualização da 2.0.5

**O código 2.0.6 ainda não foi instalado na EC2 durante o desenvolvimento.** Preserve acesso SSH e o HTTPS já configurado. O instalador detecta a origem HTTPS anterior e mantém o domínio sem exigir `--domain` novamente.

## Instalar por SSH (método manual conhecido)

Depois de baixar no Android o arquivo `AL-Sistemas-v2.0.6-VPS.zip`, a partir do Termux local:

```bash
scp -i ~/.ssh/iguatamaonline.pem ~/storage/downloads/AL-Sistemas-v2.0.6-VPS.zip ubuntu@18.217.192.20:~/
ssh -i ~/.ssh/iguatamaonline.pem ubuntu@18.217.192.20
```

Na VPS:

```bash
mkdir -p ~/al-sistemas-v206
unzip -q ~/AL-Sistemas-v2.0.6-VPS.zip -d ~/al-sistemas-v206
cd ~/al-sistemas-v206
sudo bash instalar.sh --allow-existing-host
```

Se `unzip` pedir confirmação de sobrescrita, pare e confira a pasta de destino. Este comando atualiza o núcleo, preserva `/var/lib/alsistemas` e seus sites e cria backup do código anterior em `/var/backups/alsistemas`.

Verificação curta:

```bash
curl -fsS http://127.0.0.1:8181/api/health
```

Resultado esperado: `{"ok":true,"version":"2.0.6"}`. Abra o subdomínio HTTPS que já funciona.

## Corrigir o erro do botão Testar Nginx

A 2.0.5 podia reportar falha mesmo com o Nginx aceitando a configuração, por executar `nginx -t` dentro do isolamento de arquivos do backend. A 2.0.6 usa `systemctl start alsistemas-nginx-check.service` por meio do helper autorizado, em unidade fixa root-owned. O botão deve passar a refletir o teste no host. Se ainda falhar, **não presuma que é falso positivo**: verifique no SSH:

```bash
sudo nginx -t
sudo journalctl -u alsistemas-nginx-check.service -n 30 --no-pager
```

O instalador cria a nova unidade na atualização. O processo Node permanece sem privilégios root.

## Instalação opcional de pacotes

Abra **Mais → Dependências**. Consulte a lista e instale somente extensões PHP 8.3 ou Composer, com senha e TOTP novo. Os pacotes são instalados por `alsistemas-package-installer.service`, e não pelo processo web. Não há shell remoto ou npm genérico.

## Atualização por GitHub

O repositório `drilemoz/alsistemas` foi verificado em 09/11/2026 e tinha código 2.0.3, **sem Releases publicadas**. Portanto, o teste ponta a ponta ainda depende de publicar a fonte atualizada e uma Release assinada. Consulte [RELEASES-ASSINADAS.md](RELEASES-ASSINADAS.md) antes de ativar a atualização de produção. Uma chave pública Ed25519 precisa ser instalada na VPS por `--update-key-file` uma vez, com chave privada mantida fora da VPS.

O painel rejeita versões sem os três arquivos, assinaturas inválidas, checksum divergente e versões iguais/anteriores. Há teste local de rollback com simulação; ainda não equivale a homologação real do systemd.
