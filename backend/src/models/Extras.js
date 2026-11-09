/**
 * Modelos de Notícia Externa e Tópico.
 * #3 — Índices compostos para queries de listagem.
 */
import mongoose from 'mongoose'

// ── Notícias Externas ──────────────────────────────────────────
const noticiaExternaSchema = new mongoose.Schema({
  titulo:           { type: String, required: true },
  url_externa:      { type: String, required: true },
  fonte_nome:       { type: String, default: null },
  imagem_url:       { type: String, default: null },
  categoria_label:  { type: String, default: null },
  categoria_cor:    { type: String, default: null },
  ativo:            { type: Boolean, default: true },
  ordem:            { type: Number, default: 0 },
}, { timestamps: { createdAt: 'criado_em' } })

// #3 — Índice composto para listagem pública (ativo + ordem)
noticiaExternaSchema.index({ ativo: 1, ordem: 1 })
noticiaExternaSchema.index({ criado_em: -1 })

// ── Tópicos da Faixa ──────────────────────────────────────────
const topicoSchema = new mongoose.Schema({
  icone:     { type: String, default: 'star' },
  label:     { type: String, required: true },
  descricao: { type: String, default: null },
  link:      { type: String, default: '/' },
  ativo:     { type: Boolean, default: true },
  ordem:     { type: Number, default: 0 },
})

// #3 — Índice composto para listagem de tópicos ativos
topicoSchema.index({ ativo: 1, ordem: 1 })

export const NoticiaExterna = mongoose.model('NoticiaExterna', noticiaExternaSchema)
export const Topico         = mongoose.model('Topico', topicoSchema)
