import { Router } from 'express'
import SecurityEvent from '../models/SecurityEvent.js'
import AuditLog from '../models/AuditLog.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'

const router = Router()
router.use(autenticar, verificarPermissao('seguranca.gerenciar'))

router.get('/resumo', async (_req, res, next) => {
  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [abertos, criticos, ultimas24h, eventos, mutacoes24h] = await Promise.all([
      SecurityEvent.countDocuments({ resolvido: false }),
      SecurityEvent.countDocuments({ resolvido: false, severidade: { $in: ['alta', 'critica'] } }),
      SecurityEvent.countDocuments({ criado_em: { $gte: desde } }),
      SecurityEvent.find().sort({ criado_em: -1 }).limit(30).lean(),
      AuditLog.countDocuments({ criado_em: { $gte: desde } }),
    ])
    const checks = {
      masterKeyDedicada: Boolean(process.env.CREDENTIALS_MASTER_KEY),
      setupDesativado: process.env.SETUP_DISABLED === 'true',
      ambienteProducao: process.env.NODE_ENV === 'production',
      metricsProtegidas: Boolean(process.env.METRICS_TOKEN),
      redisConfigurado: Boolean(process.env.REDIS_URL),
    }
    const falhas = Object.values(checks).filter(v => !v).length
    const score = Math.max(0, 100 - falhas * 12 - Math.min(30, criticos * 5))
    res.json({ score, checks, abertos, criticos, ultimas24h, mutacoes24h, eventos })
  } catch (err) { next(err) }
})

router.get('/eventos', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const filtro = {}
    if (req.query.severidade) filtro.severidade = req.query.severidade
    if (req.query.resolvido !== undefined) filtro.resolvido = req.query.resolvido === 'true'
    const eventos = await SecurityEvent.find(filtro).sort({ criado_em: -1 }).limit(limit).lean()
    res.json({ eventos })
  } catch (err) { next(err) }
})

router.patch('/eventos/:id', async (req, res, next) => {
  try {
    const evento = await SecurityEvent.findByIdAndUpdate(req.params.id, { resolvido: Boolean(req.body.resolvido) }, { new: true })
    if (!evento) return res.status(404).json({ erro: 'Evento não encontrado.' })
    res.json({ evento })
  } catch (err) { next(err) }
})

export default router
