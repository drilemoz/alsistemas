/**
 * Modelo de Fonte RSS.
 * Armazena as fontes de feed RSS cadastradas para importação automática ou manual.
 */
import mongoose from 'mongoose'

const rssFonteSchema = new mongoose.Schema({
  nome:          { type: String, required: true, trim: true },
  url:           { type: String, required: true, trim: true },
  ativa:         { type: Boolean, default: true },
  categoria_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria', default: null },
  max_items:     { type: Number, default: 10, min: 1, max: 100 },
  // Configuração de atualização automática
  auto_update:   { type: Boolean, default: false },
  intervalo_min: { type: Number, default: 60, min: 5 }, // minutos entre atualizações
  // Histórico
  ultima_importacao: { type: Date, default: null },
  total_importadas:  { type: Number, default: 0 },
  // Indica se é fonte padrão pré-cadastrada (não pode ser excluída pelo usuário)
  padrao: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' } })

// O plugin global de toJSON em server.js não alcança este model porque
// rssScheduler.js (importado como utilitário) já compila o schema antes
// do plugin ser registrado no corpo do server.js. Por isso, o transform
// é definido diretamente aqui — igual ao padrão dos demais models.
rssFonteSchema.set('toJSON', {
  virtuals:   true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString()
    delete ret._id
    return ret
  },
})

export default mongoose.model('RssFonte', rssFonteSchema)
