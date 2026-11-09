/**
 * #13 — Configuração do Swagger / OpenAPI 3.0.
 */
import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'AL Sistemas API',
      version:     '2.0.0',
      description: 'API do painel AL Sistemas. Autenticação via cookie HttpOnly (alsistemas_token) ou Bearer token.',
    },
    servers: [
      { url: '/api', description: 'Servidor atual' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in:   'cookie',
          name: 'alsistemas_token',
        },
      },
    },
    tags: [
      { name: 'Autenticação',  description: 'Login e gerenciamento de sessão' },
      { name: 'Notícias',      description: 'CRUD de notícias' },
      { name: 'Categorias',    description: 'Categorias das notícias' },
      { name: 'Extras',        description: 'Eventos, ônibus, notícias externas, tópicos' },
      { name: 'Sistema',       description: 'Health check, métricas, sitemap, RSS' },
      { name: 'Admin',         description: 'Audit log e ações administrativas' },
    ],
  },
  apis: ['./src/routes/*.js'],
}

export const swaggerSpec = swaggerJsdoc(options)
