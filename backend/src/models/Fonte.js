import mongoose from 'mongoose'

const fonteSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  url:  { type: String, default: null },
}, { timestamps: { createdAt: 'criado_em' } })

// #10 — toJSON removido: plugin global em server.js já cuida de id/versionKey.

export default mongoose.model('Fonte', fonteSchema)
