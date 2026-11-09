/**
 * #19 — Audit log para ações administrativas.
 * Registra automaticamente ações POST/PUT/DELETE autenticadas.
 * Uso: adicionar após `autenticar` nas rotas admin.
 */
import AuditLog from '../models/AuditLog.js'
import { logger } from '../utils/logger.js'

/**
 * Retorna middleware de audit log para um recurso específico.
 * @param {string} recurso  Ex: 'noticias', 'eventos', 'modulos'
 */
export function auditLog(recurso) {
  return async (req, res, next) => {
    // Intercepta o final da resposta para registrar apenas quando bem-sucedido
    const originalJson = res.json.bind(res)

    res.json = async (body) => {
      // Só registra mutações bem-sucedidas (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.usuario) {
        const acao = metodoParaAcao(req.method)
        const recursoId = req.params?.id || body?.id || body?._id || null

        try {
          await AuditLog.create({
            admin_id:    req.usuario._id,
            admin_email: req.usuario.email,
            acao,
            recurso,
            recurso_id:  recursoId ? String(recursoId) : null,
            payload:     sanitizarPayload(req.body),
            ip:          req.ip,
            request_id:  req.requestId || null,
          })
        } catch (err) {
          // Falha no audit log não deve derrubar a resposta principal
          logger.error({ err: err.message }, 'Falha ao gravar audit log')
        }
      }
      return originalJson(body)
    }

    next()
  }
}

function metodoParaAcao(method) {
  const mapa = { POST: 'criar', PUT: 'editar', PATCH: 'editar', DELETE: 'excluir' }
  return mapa[method] || method.toLowerCase()
}

function sanitizarPayload(body) {
  if (!body) return null
  // Remove campos sensíveis antes de gravar
  const { senha, password, token, ...seguro } = body
  return seguro
}
