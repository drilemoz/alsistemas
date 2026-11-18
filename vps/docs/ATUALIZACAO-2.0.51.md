# Amazon EC2 e snapshots do disco principal

Instale em **Mais → Atualizar → Arquivo ZIP**. Em **Início → Ações da VPS**, toque em **Amazon EC2**. A mesma janela abre pelo atalho **Ver dados na Amazon EC2**, em **Dados da VPS**. A primeira consulta é automática ao abrir; o botão **Atualizar** consulta novamente respeitando o cache de até um minuto.

- **Metadados (IMDSv2):** tipo, zona, região, ID, IPs e hora de lançamento quando disponíveis. Não exigem chaves.
- **API da AWS:** estado e verificações da máquina, além de VPC, sub-rede, IDs de grupos de segurança e volumes EBS conectados. Exige AWS CLI v2 e um perfil IAM de leitura na instância.
- **Snapshots EBS:** a seção **Ver snapshots** mostra cópias do disco principal. Crie uma nova cópia com **Criar snapshot → Confirmar snapshot**. Não há criação automática, exclusão nem restauração pelo painel. O botão **Abrir no console AWS** continua disponível.

## Permissões para o inventário

Instale a [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) na VPS. Anexe esta política de leitura à função do perfil da instância. Se já existe um perfil em uso, preserve-o e revise suas permissões. O painel não instala a CLI, não altera perfis por conta própria e não aceita chaves estáticas.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus", "ec2:DescribeSnapshots"],
    "Resource": "*",
    "Condition": {"StringEquals": {"ec2:Region": "us-east-2"}}
  }]
}
```

Essas consultas não aceitam ARN da instância na política. A política restringe a região, e o backend consulta apenas o ID lido do IMDSv2 local. Para outro datacenter, troque a região do exemplo. Se o perfil anterior só autorizar DescribeInstanceStatus, o estado continua disponível e a janela sinaliza a falta de inventário. Nenhuma regra de firewall é exibida ou alterada.

Referência: [Permissões da EC2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonec2.html).

## Permissão adicional para criar snapshots

Adicione as permissões abaixo à mesma função IAM somente se quiser permitir criação. Troque `CONTA_AWS` pelo ID de 12 dígitos da sua conta e `vol-EXEMPLO` pelo ID real do disco raiz, exibido na janela em **Discos EBS conectados**. Para outra região, troque também `us-east-2`. A permissão é para o disco raiz indicado e para o recurso de snapshot criado pela API.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ec2:CreateSnapshot",
      "Resource": "arn:aws:ec2:us-east-2:CONTA_AWS:volume/vol-EXEMPLO"
    },
    {
      "Effect": "Allow",
      "Action": "ec2:CreateSnapshot",
      "Resource": "arn:aws:ec2:us-east-2::snapshot/*"
    }
  ]
}
```

Se o volume usar uma chave KMS gerenciada pelo cliente, revise o acesso da função a essa chave conforme a [documentação do Amazon EBS](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-encryption-requirements.html). Não conceda permissões amplas para resolver um erro de KMS.

## O que esperar

- A criação é manual. Antes de solicitar, o painel verifica novamente na AWS qual disco raiz está conectado e se já existe um snapshot pendente. A solicitação aceita é registrada no histórico interno de auditoria.
- A lista mostra até 50 resultados da AWS e atualiza enquanto um snapshot visível estiver pendente. Se a AWS não confirmar a criação, consulte a lista antes de tentar novamente. O painel não reenvia a criação automaticamente.
- Snapshot cobre somente o volume EBS selecionado. Com a VPS ligada, pode não incluir dados ainda em cache. Mantenha os backups do banco e dos projetos. O serviço de snapshots pode gerar cobrança por armazenamento.
- O snapshot não recupera automaticamente o painel se a VPS ou o serviço estiverem fora do ar. Use o console AWS para recuperação. Uma vez concluído, o snapshot pode servir de origem para criar outro volume.

Referências: [criar e restaurar snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html), [política IAM de exemplo](https://docs.aws.amazon.com/ebs/latest/userguide/security_iam_id-based-policy-examples.html) e [preços do Amazon EBS](https://aws.amazon.com/ebs/pricing/).
