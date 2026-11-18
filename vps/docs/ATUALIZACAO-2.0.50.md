# Dados da Amazon EC2

Instale em **Mais → Atualizar → Arquivo ZIP**. Depois vá até **Início → Dados da VPS → Amazon EC2 → Consultar AWS**. Nenhum reboot da VPS é necessário para instalar a versão.

## Metadados da própria instância

Com IMDSv2 acessível, aparecem tipo, ID, região, zona, IPv4 privado e IPv4 público (quando atribuído). Esses dados não exigem uma chave AWS nem um perfil IAM. O painel não adivinha os valores se estiver fora da AWS ou sem acesso a metadados. A consulta é autenticada no painel, não recebe IP ou URL do navegador, não lê endpoints de credenciais diretamente e separa a origem AWS das métricas locais.

## Estado e verificações na AWS

Para complementar os metadados com estado da instância e verificações de saúde reportadas pela AWS, use **AWS CLI v2** no servidor e um perfil IAM associado à EC2. Siga a [instalação oficial da AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). A consulta usa somente credenciais temporárias do perfil da instância. Não cole chaves no painel e não execute `aws configure` para essa função.

A política mínima de permissões abaixo é para uma EC2 em Ohio. Para outra região, troque somente o valor de `ec2:Region`. Adicione-a à função IAM existente da instância se ela já tiver um perfil, sem substituir o perfil e sem remover permissões usadas por outros serviços. O painel não cria nem anexa políticas por conta própria.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "ec2:DescribeInstanceStatus",
    "Resource": "*",
    "Condition": {"StringEquals": {"ec2:Region": "us-east-2"}}
  }]
}
```

`DescribeInstanceStatus` não admite restrição pelo ARN da instância na política. A região é restringida na política e o painel pede somente o ID obtido do IMDSv2 local. Referência: [Permissões do Amazon EC2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonec2.html).

## Limites e validação

- A consulta não restaura banco, arquivos ou backups, não cria snapshots e não reinicia a máquina.
- Os metadados continuam disponíveis sem a CLI ou sem a permissão de status. O botão informa o que faltou. Após ajustar a configuração, a resposta anterior pode ficar no cache do painel por até 1 minuto.
- Quando a própria VPS estiver fora do ar, o painel nela hospedado não consegue fazer consultas. Para isso, use o console externo da AWS.
- Testes locais não substituem o teste com a função IAM e o IMDSv2 da EC2 real.
