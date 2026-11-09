# AL Sistemas 2.0.9

Central APIs e Integrações: credenciais Spaceship protegidas com AES-256-GCM, consulta DNS, remoção e auditoria. Não altera DNS nem cria sites automaticamente.

Reinicie o serviço após a atualização. Faça backup de `/var/lib/alsistemas`, incluindo `integrations.key`, pois sem essa chave as credenciais não podem ser recuperadas.
