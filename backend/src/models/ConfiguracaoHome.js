import mongoose from 'mongoose'

const configuracaoSchema = new mongoose.Schema({
  chave:     { type: String, required: true, unique: true },
  valor:     { type: String, default: '' },
  descricao: { type: String, default: '' },
}, { timestamps: { updatedAt: 'atualizado_em' } })

export default mongoose.model('ConfiguracaoHome', configuracaoSchema)
