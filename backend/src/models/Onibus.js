/**
 * Modelo de Ônibus.
 * #3 — Índice composto { ativo, ordem } para listagem pública.
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

const horarioSchema = new mongoose.Schema(
  {
    hora:       { type: String, required: true },
    dias:       { type: [String], default: ['seg','ter','qua','qui','sex'] },
    observacao: { type: String, default: '' },
  },
  { _id: false }
)

const onibusSchema = new mongoose.Schema(
  {
    destino:  { type: String, required: true },
    origem:   { type: String, default: 'Iguatama' },
    empresa:  { type: String, default: '' },
    cor:      { type: String, default: '#1B5E3B' },
    horarios: { type: [horarioSchema], default: [] },
    ativo:    { type: Boolean, default: true },
    ordem:    { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'criado_em' },
    toJSON: toJSONConfig,
  }
)

// #3 — Índice composto para listagem pública ordenada
onibusSchema.index({ ativo: 1, ordem: 1 })

export const Onibus = mongoose.model('Onibus', onibusSchema)
