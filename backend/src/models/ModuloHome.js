/**
 * Modelo de Módulo da Home.
 * #3 — Índice composto { ativo, ordem } para a query de listagem.
 */
import mongoose from 'mongoose'

const moduloSchema = new mongoose.Schema({
  chave:  { type: String, required: true, unique: true },
  titulo: { type: String, required: true },
  ativo:  { type: Boolean, default: true },
  ordem:  { type: Number, default: 0 },
}, { timestamps: { createdAt: 'criado_em' } })

// #3 — Índice composto para listagem de módulos ativos ordenados
moduloSchema.index({ ativo: 1, ordem: 1 })

export default mongoose.model('ModuloHome', moduloSchema)
