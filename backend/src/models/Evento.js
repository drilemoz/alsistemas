/**
 * Modelo de Evento.
 * #3 — Índice composto { ativo, data } para query de eventos futuros.
 */
import mongoose from 'mongoose'

const toJSONConfig = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString()
    delete ret._id
    return ret
  },
}

const eventoSchema = new mongoose.Schema(
  {
    titulo:    { type: String, required: true },
    descricao: { type: String, default: '' },
    data:      { type: Date, required: true },
    horario:   { type: String, default: '' },
    local:     { type: String, default: '' },
    cor:       { type: String, default: '#1B5E3B' },
    ativo:     { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'criado_em' },
    toJSON: toJSONConfig,
  }
)

// #3 — Índice composto para query de eventos ativos por data
eventoSchema.index({ ativo: 1, data: 1 })

export const Evento = mongoose.model('Evento', eventoSchema)
