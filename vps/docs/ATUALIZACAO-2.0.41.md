# Dependências da VPS

Abra **Mais → Dependências**. O resumo mostra quatro categorias. Toque em uma para ver a lista, o estado e a versão de cada pacote. Pacotes com botão **Instalar** podem ser instalados remotamente pelo painel, um por vez, após confirmação.

| Categoria | O que o painel consulta ou permite instalar |
| --- | --- |
| Node.js e npm | Consulta o Node que executa o painel e o binário npm em /usr/bin. Pode instalar Python 3, compiladores/Make e pkg-config. |
| PHP e Composer | Instala CLI, PHP-FPM 8.3, Composer e extensões como mbstring, XML e conectores para MySQL/MariaDB, PostgreSQL e SQLite. |
| Banco de dados | Instala servidor e cliente MariaDB, cliente PostgreSQL e SQLite. O APT pode iniciar o serviço MariaDB durante a instalação. |
| Ferramentas da VPS | Instala Certbot, Git, cURL, ZIP e Unzip. Nginx aparece para consulta. |

Os botões instalam ferramentas do sistema usando APT, não bibliotecas de um projeto. O painel não executa npm install, npm ci, composer install, scripts ou comandos enviados pelo navegador. Também não cria usuários ou bancos de dados.

A versão exibida do Node é a do processo que está executando o painel. O npm é consultado localmente, mesmo quando vem junto do pacote nodejs e não aparece como pacote APT separado. A tela não troca o Node ou npm do sistema. Os repositórios APT já configurados são usados sem adicionar fontes nem atualizar o sistema inteiro.

Antes de instalar, o serviço administrativo simula o plano do APT. Se o plano alterar Node.js/npm, Nginx ou remover pacotes, a instalação é recusada. A interface acompanha a fila e o resultado enquanto Dependências está aberta. Se você sair da tela, a operação continua na VPS e o resultado aparece ao voltar.
