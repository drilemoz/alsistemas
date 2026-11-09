import mongoose from 'mongoose'

const categoriaSchema = new mongoose.Schema({
  nome:      { type: String, required: true, trim: true },
  slug:      { type: String, required: true, unique: true, trim: true },
  descricao: { type: String, default: '', trim: true },
  cor:       { type: String, default: '#1B5E3B' },
}, { timestamps: { createdAt: 'criado_em' } })

// #10 — toJSON removido: plugin global em server.js já cuida de id/versionKey.

export default mongoose.model('Categoria', categoriaSchema)
