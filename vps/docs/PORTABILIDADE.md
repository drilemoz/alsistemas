# Plano de portabilidade e recuperação — não implementado integralmente

## Exportação prevista

Formato de manifesto versionado com checksums SHA-256, esquema do núcleo, dados de projetos (incluindo tipos e domínios), requisitos de PHP/Node, bancos, usuários de banco, jobs e certificados emitíveis. Backups de arquivos e dumps MariaDB deverão ser gerados de forma consistente, criptografados para destino externo, com restrição de permissões e verificação antes de serem enviados. Não exportar segredos em claro.

## Importação prevista

O assistente deverá verificar SO/arquitetura, recursos disponíveis, versões de runtime e conflitos de nomes e portas; restaurar os arquivos num novo diretório, preparar contas/permissions e configurações isoladas de Nginx, testar `nginx -t`, aplicar dumps MariaDB com usuário de privilégio mínimo e agendar um cutover. HTTPS deverá ser **reemitido** após apontamento DNS ou migrado com procedimentos explícitos e seguros, sem presumir transferência automática de chaves privadas.

## Troca de DNS e rollback

Antes de trocar IP na Spaceship, baixar TTL se adequado, manter VPS antiga em modo sem alterações e ter snapshot/backup testado. Verificar a nova instalação usando hosts temporário e TLS conforme aplicável; depois alterar A/AAAA. Monitorar disponibilidade real e, havendo problemas, reverter DNS/IP e restabelecer serviços antigos sem divergência de dados. Em sites com escrita simultânea, exigir etapa de congelamento/sincronização final para evitar perda de transações.

## Estado atual

Nenhuma dessas operações foi exposta como ação funcional pela UI. Há apenas backup de **código do núcleo** antes de uma reinstalação/atualização. Backups de banco, arquivos de sites, restauração e migração serão desenvolvidos e validados em versões futuras.
