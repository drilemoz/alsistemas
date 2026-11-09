import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const usuarioSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha:     { type: String, required: true, minlength: 8 },
  nome:      { type: String, default: 'Admin' },
  role:      { type: String, default: 'admin' }, // legado — usar perfil_id
  perfil_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PerfilAcesso', default: null },
  ativo:     { type: Boolean, default: true },

  // ── Segurança: bloqueio por tentativas inválidas ──────────────────────────
  tentativas_login: { type: Number,  default: 0 },
  bloqueado_ate:    { type: Date,    default: null },
  ultimo_acesso:    { type: Date,    default: null },

  // ── Recuperação de senha ──────────────────────────────────────────────────
  token_reset_senha:  { type: String, default: null, select: false },
  token_reset_expira: { type: Date,   default: null, select: false },

  // ── Extras ────────────────────────────────────────────────────────────────
  avatar_url:       { type: String,  default: null },
  email_verificado: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' } })

// ── Índices ──────────────────────────────────────────────────────────────────
usuarioSchema.index({ ativo: 1 })
usuarioSchema.index({ perfil_id: 1 })
usuarioSchema.index({ bloqueado_ate: 1 })

// ── Hash da senha antes de salvar ────────────────────────────────────────────
usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('senha')) return next()
  this.senha = await bcrypt.hash(this.senha, 12)
  next()
})

usuarioSchema.methods.verificarSenha = function (senhaPlana) {
  return bcrypt.compare(senhaPlana, this.senha)
}

usuarioSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString()
    delete ret._id
    delete ret.senha
    delete ret.token_reset_senha
    delete ret.token_reset_expira
    return ret
  },
})

export default mongoose.model('Usuario', usuarioSchema)
