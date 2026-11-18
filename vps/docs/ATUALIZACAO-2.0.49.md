# Correção do boot do painel AL Sistemas VPS

O journal mostrou `status=226/NAMESPACE` e `/run/alsistemas-vps: No such file or directory`. O Nginx voltou, mas o painel não chegou a escutar em `127.0.0.1:8181`. O diretório compartilhado é volátil. A unidade anterior tentava prepará-lo no `ExecStartPre`, porém o systemd já exigia sua presença ao montar o namespace desse próprio comando por causa de `ReadWritePaths`.

## Recuperar o boot atual

No SSH da VPS, execute:

```bash
sudo install -d -o root -g root -m 0700 /run/alsistemas-vps &&
sudo systemctl restart alsistemas-vps &&
curl -fsS --max-time 5 http://127.0.0.1:8181/api/health
```

Se o endpoint retornar `"ok":true`, reabra o painel. Se não retornar, consulte `sudo journalctl -u alsistemas-vps -b -n 40 --no-pager`. Não é necessário reiniciar o Linux para recuperar o serviço.

## Instalar a correção permanente

No painel recuperado, abra **Mais → Atualizar → Arquivo ZIP** e envie o pacote **AL-Sistemas-v2.0.49-VPS.zip**. A atualização aplica `/etc/tmpfiles.d/alsistemas-vps.conf` imediatamente e o systemd-tmpfiles volta a criar o diretório a cada boot. O painel inicia depois do serviço de tmpfiles. O usuário do painel, o isolamento e a propriedade `root:root` com modo `0700` são mantidos. A atualização não reinicia a VPS.

Verifique a versão e a regra sem esperar outro boot:

```bash
curl -fsS --max-time 5 http://127.0.0.1:8181/api/health
sudo stat -c '%U:%G %a %n' /run/alsistemas-vps
sudo cat /etc/tmpfiles.d/alsistemas-vps.conf
systemctl show alsistemas-vps -p After -p ExecStartPre
```

Um reinício real é a validação final e deve ser feito em janela de manutenção. Não remova o diretório runtime em produção para simular o boot, pois ele pode conter locks e pedidos em andamento.
