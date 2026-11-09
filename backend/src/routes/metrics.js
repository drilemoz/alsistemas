/**
 * #8 — Endpoint /metrics para Prometheus.
 * Expõe métricas de processo (CPU, memória, event loop) e HTTP (duração, contagens).
 * Protegido por IP ou variável de ambiente METRICS_TOKEN em produção.
 */
import { Router } from 'express'
import { registry } from '../middleware/metricas.js'

const router = Router()

router.get('/', async (req, res) => {
  // Proteção simples por token em produção
  if (process.env.NODE_ENV === 'production' && process.env.METRICS_TOKEN) {
    const token = req.headers['x-metrics-token'] || req.query.token
    if (token !== process.env.METRICS_TOKEN) {
      return res.status(403).json({ erro: 'Não autorizado' })
    }
  }

  try {
    const metricas = await registry.metrics()
    res.set('Content-Type', registry.contentType)
    res.end(metricas)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

export default router
