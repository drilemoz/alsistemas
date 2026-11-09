/**
 * #19 — Modelo de Audit Log.
 * Persiste toda ação administrativa (criar/editar/excluir).
 */
import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema({
  admin_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  admin_email: { type: String, required: true },
  acao:        { type: String, enum: ['criar', 'editar', 'excluir'], required: true },
  recurso:     { type: String, required: true },   // 'noticias', 'eventos', etc.
  recurso_id:  { type: String, default: null },
  payload:     { type: mongoose.Schema.Types.Mixed, default: null },
  ip:          { type: String, default: null },
  request_id:  { type: String, default: null },
}, {
  timestamps: { createdAt: 'criado_em', updatedAt: false },
})

// Índices para consultas administrativas
auditLogSchema.index({ admin_id: 1, criado_em: -1 })
auditLogSchema.index({ recurso: 1, criado_em: -1 })
auditLogSchema.index({ criado_em: -1 })

export default mongoose.model('AuditLog', auditLogSchema)
