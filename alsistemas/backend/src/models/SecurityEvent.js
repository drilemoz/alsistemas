import mongoose from 'mongoose'

const securityEventSchema = new mongoose.Schema({
  tipo: { type: String, required: true, index: true },
  severidade: { type: String, enum: ['baixa', 'media', 'alta', 'critica'], default: 'media', index: true },
  mensagem: { type: String, required: true, trim: true },
  ip: { type: String, default: null, index: true },
  rota: { type: String, default: null },
  metodo: { type: String, default: null },
  status: { type: Number, default: null },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  usuario_email: { type: String, default: null },
  request_id: { type: String, default: null },
  dados: { type: mongoose.Schema.Types.Mixed, default: null },
  resolvido: { type: Boolean, default: false, index: true },
}, { timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' } })

securityEventSchema.index({ criado_em: -1 })
securityEventSchema.index({ severidade: 1, resolvido: 1, criado_em: -1 })
securityEventSchema.index({ ip: 1, criado_em: -1 })

export default mongoose.model('SecurityEvent', securityEventSchema)
