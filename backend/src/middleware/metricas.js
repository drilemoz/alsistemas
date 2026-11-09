/**
 * #8 — Coleta de métricas com prom-client.
 * Instrumenta tempo de resposta por rota e método HTTP.
 */
import client from 'prom-client'

// Registro padrão (inclui métricas de processo: CPU, memória, etc.)
export const registry = new client.Registry()
client.collectDefaultMetrics({ register: registry, prefix: 'alsistemas_' })

// Histograma de duração por rota
export const httpDuration = new client.Histogram({
  name: 'alsistemas_http_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
})

// Contador de requisições
export const httpRequests = new client.Counter({
  name: 'alsistemas_http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
})

/**
 * Middleware que mede o tempo de resposta de cada requisição.
 */
export function metricasMiddleware(req, res, next) {
  const inicio = Date.now()

  res.on('finish', () => {
    // Usa a rota do Express para evitar cardinalidade infinita
    const route = req.route?.path || req.path || 'desconhecida'
    const labels = {
      method: req.method,
      route:  `${req.baseUrl || ''}${route}`,
      status: String(res.statusCode),
    }
    const duracaoMs = (Date.now() - inicio) / 1000
    httpDuration.observe(labels, duracaoMs)
    httpRequests.inc(labels)
  })

  next()
}
