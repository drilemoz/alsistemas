/**
 * AL Sistemas — Servidor principal (backend).
 * Node.js + Express + Mongoose
 *
 * Melhorias implementadas neste arquivo:
 * #1  — Cache Redis (inicializado em iniciarConexoes)
 * #4  — Brotli ativo via compression() — suportado nativamente no Node 18+
 * #7  — Logging estruturado com pino-http
 * #8  — Métricas Prometheus via metricasMiddleware
 * #9  — Health check detalhado (MongoDB + Redis + Cloudinary)
 * #10 — X-Request-Id propagado em cada requisição
 * #13 — Swagger UI em /api/docs
 * #14 — Validação de env via Zod (importado antes de tudo)
 * #15 — Preparado para Docker (PORT via env, graceful shutdown)
 * #RSS — Importação de notícias via RSS com scheduler automático
 */
import './plugins/mongoosePlugin.js' // Registra o plugin antes de importar os models.
import './config/env.js'         // #14 — valida env antes de qualquer outra coisa (já carrega dotenv internamente)
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import pinoHttp from 'pino-http'
import swaggerUi from 'swagger-ui-express'

import { iniciarConexoes, conectarMongo, configurarCloudinary, verificarCloudinary } from './config/index.js'
import { iniciarRedis } from './utils/redis.js'
import { swaggerSpec }     from './config/swagger.js'
import { logger }          from './utils/logger.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { metricasMiddleware }  from './middleware/metricas.js'
// FIX: scheduler unificado — usa rssJob.js (node-cron) em vez de rssScheduler.js
// Isso evita dois schedulers paralelos e garante que o painel admin reflita o estado real.
import { iniciarRssJob, pararRssJob } from './jobs/rssJob.js'

// ─── Importar rotas ───────────────────────────────────────────
import authRoutes       from './routes/auth.js'
import noticiasRoutes   from './routes/noticias.js'
import categoriasRoutes from './routes/categorias.js'
import fontesRoutes     from './routes/fontes.js'
import uploadRoutes     from './routes/upload.js'
import extrasRoutes     from './routes/extras.js'
import newsletterRoutes from './routes/newsletter.js'
import errosRoutes      from './routes/erros.js'
import healthRoutes     from './routes/health.js'
import metricsRoutes    from './routes/metrics.js'
import sitemapRoutes    from './routes/sitemap.js'
import rssRoutes        from './routes/rss.js'
import auditLogsRoutes  from './routes/auditLogs.js'
import setupRoutes      from './routes/setup.js'
import backupRoutes     from './routes/backup.js'
import usuariosRoutes   from './routes/usuarios.js'
import infraestruturaRoutes from './routes/infraestrutura.js'
import rssAdminRoutes   from './routes/rssAdmin.js'              // #RSS
import arquivosRoutes   from './routes/arquivos.js'             // Editor de arquivos de config
// ── Sprint 3: Novas integrações ────────────────────────────────
import projetosRoutes   from './routes/projetos.js'             // Projetos Locais
import githubRoutes     from './routes/github.js'               // GitHub Module (proxy seguro)
// ── Sprint 4: Inteligência + Análise ───────────────────────────
import analysisRoutes   from './routes/analysis.js'             // IA Assistant + Analysis Engine
import mongoAdminRoutes from './routes/mongoAdmin.js'            // MongoDB Admin Panel
import cloudflareRoutes  from './routes/cloudflare.js'    // ☁️ Cloudflare
import { tratarErros }  from './middleware/erros.js'

const app  = express()
const PORT = process.env.PORT || 3001

// ─── #10 — Request ID (antes de tudo para estar em todos os logs) ─
app.use(requestIdMiddleware)

// ─── #7 — Logging estruturado com pino-http ───────────────────
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.requestId,
  customLogLevel: (_req, res) => res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, requestId: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))

// ─── #8 — Métricas de performance ────────────────────────────
app.use(metricasMiddleware)

// ─── Segurança ────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

// ─── #4 — Compressão Brotli + Gzip ───────────────────────────
app.use(compression({
  // Brotli é negociado pelo cliente via Accept-Encoding: br
  // O módulo `compression` suporta br nativamente no Node 18+
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false
    return compression.filter(req, res)
  },
  level: 6,
}))

// ─── CORS ────────────────────────────────────────────────────
// FRONTEND_URL aceita lista separada por vírgula para cobrir múltiplos domínios.
// Ex.: FRONTEND_URL=https://alsistemas.vercel.app
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  ...(process.env.FRONTEND_URL || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
])

app.use(cors({
  origin: (origin, callback) => {
    // Sem origin: Postman, curl ou testes — permitido
    if (!origin) return callback(null, true)
    if (allowedOrigins.has(origin)) return callback(null, true)
    callback(new Error(`CORS: origem não permitida — ${origin}`))
  },
  credentials: true,
}))

// ─── Parsers ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ─── #16 / #17 — Sitemap e RSS (sem prefixo /api) ────────────
app.use('/sitemap.xml', sitemapRoutes)
app.use('/rss',         rssRoutes)

// ─── Rotas da API ─────────────────────────────────────────────
app.use('/api/auth',            authRoutes)
app.use('/api/noticias',        noticiasRoutes)
app.use('/api/categorias',      categoriasRoutes)
app.use('/api/fontes',          fontesRoutes)
app.use('/api/upload',          uploadRoutes)
app.use('/api/newsletter',      newsletterRoutes)
app.use('/api',                 extrasRoutes)
app.use('/api/erros',           errosRoutes)
app.use('/api/audit-logs',      auditLogsRoutes)
app.use('/api/setup',          setupRoutes)
app.use('/api/admin/backup',   backupRoutes)
app.use('/api/admin/usuarios', usuariosRoutes)
app.use('/api/admin/infraestrutura', infraestruturaRoutes)
app.use('/api/admin/rss',      rssAdminRoutes)               // #RSS
app.use('/api/admin/arquivos', arquivosRoutes)               // Editor de arquivos de config
// ── Sprint 3: Novas rotas — nada existente alterado ───────────
app.use('/api/projetos', projetosRoutes)                     // Projetos Locais
app.use('/api/github',   githubRoutes)                       // GitHub Module (proxy seguro)
// ── Sprint 4: Inteligência + Análise ───────────────────────────
app.use('/api/analysis', analysisRoutes)                     // IA Assistant + Analysis Engine
app.use('/api/admin/mongo', mongoAdminRoutes)                 // MongoDB Admin Panel
app.use('/api/admin/cloudflare', cloudflareRoutes)         // ☁️ Cloudflare

// ─── #9 — Health check detalhado ─────────────────────────────
app.use('/api/health', healthRoutes)

// ─── #8 — Métricas Prometheus ────────────────────────────────
app.use('/metrics', metricsRoutes)

// ─── #13 — Swagger UI ────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'AL Sistemas API Docs',
  swaggerOptions: { persistAuthorization: true },
}))
// Endpoint que retorna o spec em JSON (útil para geração de clientes)
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec))

// ─── Erro centralizado ────────────────────────────────────────
app.use(tratarErros)

// ─── Inicialização ────────────────────────────────────────────
async function iniciar() {
  try {
    // Cloudinary e Redis não bloqueiam a inicialização
    configurarCloudinary()
    await iniciarRedis(process.env.REDIS_URL)

    // MongoDB: tenta conectar mas não derruba o servidor se falhar
    try {
      await conectarMongo()
      // #RSS — Inicia o scheduler de importação automática após conectar ao MongoDB
      const _cronExpr = process.env.RSS_CRON || '0 * * * *'
      iniciarRssJob(_cronExpr)
    } catch (mongoErr) {
      logger.error({ err: mongoErr.message }, '⚠️  MongoDB não conectou na inicialização — servidor sobe em modo degradado')
    }

    const server = app.listen(PORT, () =>
      logger.info({ port: PORT }, `🚀 Backend rodando em http://localhost:${PORT}`)
    )

    // #15 — Graceful shutdown para Docker
    const desligar = async (sinal) => {
      logger.info({ sinal }, 'Desligando servidor...')
      pararRssJob()
      server.close(async () => {
        await mongoose.connection.close()
        logger.info('MongoDB desconectado. Bye!')
        process.exit(0)
      })
      setTimeout(() => process.exit(1), 10000)
    }

    process.on('SIGTERM', () => desligar('SIGTERM'))
    process.on('SIGINT',  () => desligar('SIGINT'))
  } catch (err) {
    logger.error({ err: err.message }, '❌ Erro ao iniciar servidor')
    process.exit(1)
  }
}

// Exporta app ANTES de iniciar o servidor.
// Quando os testes importam este módulo, eles recebem o Express app
// sem disparar o app.listen() — evita EADDRINUSE com múltiplos workers Jest.
export default app

// Só inicia o servidor se NÃO estiver em ambiente de teste.
// Em teste, cada arquivo de teste conecta ao MongoDB manualmente no beforeAll().
if (process.env.NODE_ENV !== 'test') {
  iniciar()
}
