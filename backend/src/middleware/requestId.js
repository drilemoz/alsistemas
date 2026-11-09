/**
 * #10 — Rastreamento distribuído via X-Request-Id.
 * Adiciona requestId a cada req e o propaga nos cabeçalhos de resposta.
 * O logger pino-http automaticamente inclui o requestId nos logs.
 */
import { v4 as uuidv4 } from 'uuid'

export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
