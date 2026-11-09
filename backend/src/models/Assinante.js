import mongoose from 'mongoose'

const AssinanteSchema = new mongoose.Schema({
  email: {
    type:     String,
    required: [true, 'Email é obrigatório'],
    unique:   true,
    trim:     true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'],
  },
  nome: {
    type:    String,
    trim:    true,
    default: '',
  },
  ativo: {
    type:    Boolean,
    default: true,
  },
  token_cancelamento: {
    type:    String,
    default: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
  },
  inscrito_em: {
    type:    Date,
    default: Date.now,
  },
})

export default mongoose.model('Assinante', AssinanteSchema)
