/**
 * Projeto.js — Model de Projetos Locais
 *
 * Sprint 3 — ADIÇÃO PURA. Nenhum model existente foi alterado.
 *
 * Registra metadados de projetos detectados no diretório /projetos.
 * O backend lê o filesystem em tempo real; este model serve apenas
 * como cache opcional e para anotações manuais futuras.
 */
import mongoose from 'mongoose'

const ProjetoSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    descricao: {
      type: String,
      default: '',
      trim: true,
    },
    caminho: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['ativo', 'pausado', 'arquivado', 'desconhecido'],
      default: 'desconhecido',
    },
    tecnologias: {
      type: [String],
      default: [],
    },
    metadados: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ultimaLeitura: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'projetos',
  }
)

export default mongoose.model('Projeto', ProjetoSchema)
