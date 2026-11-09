/**
 * Middleware centralizado de tratamento de erros.
 * #7 — Usa logger estruturado em vez de console.error.
 */
import { logger } from '../utils/logger.js'

export function tratarErros(err, req, res, _next) {
  const status = err.status || err.statusCode || 500
  const mensagem = err.message || 'Erro interno do servidor'

  // Loga detalhes completos no servidor
  logger.error({
    err: mensagem,
    stack:     status >= 500 ? err.stack : undefined,
    requestId: req.requestId,
    method:    req.method,
    url:       req.originalUrl,
    status,
  })

  // Resposta ao cliente — sem expor stack em produção
  res.status(status).json({
    erro: mensagem,
    ...(process.env.NODE_ENV !== 'production' && status >= 500
      ? { detalhe: err.stack }
      : {}),
  })
}
