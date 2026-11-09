/**
 * #19 — Rota administrativa para consulta do audit log.
 */
import { Router } from 'express'
import AuditLog from '../models/AuditLog.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'

const router = Router()

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Lista registros do audit log (autenticado)
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: recurso
 *         schema: { type: string }
 *       - in: query
 *         name: admin_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 */
router.get('/', autenticar, verificarPermissao('erros.ver'), async (req, res, next) => {
  try {
    const { recurso, admin_id, page, limit } = req.query
    const lim  = Math.min(100, parseInt(limit) || 50)
    const pag  = Math.max(1, parseInt(page) || 1)
    const skip = (pag - 1) * lim

    const filtro = {}
    if (recurso)  filtro.recurso  = recurso
    if (admin_id) filtro.admin_id = admin_id

    const [logs, total] = await Promise.all([
      AuditLog.find(filtro).sort({ criado_em: -1 }).skip(skip).limit(lim).lean(),
      AuditLog.countDocuments(filtro),
    ])

    res.json({ logs, total, pagina: pag, paginas: Math.ceil(total / lim) })
  } catch (err) { next(err) }
})

export default router
