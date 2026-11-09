/**
 * noticiaService.js
 *
 * Lógica de negócio pura relacionada a notícias.
 * Não tem conhecimento de req/res — pode ser testado isoladamente.
 *
 * Responsabilidades:
 *  - Construção de filtros e opções de ordenação (buildFiltro, buildSort)
 *  - Helpers de populate reutilizáveis (popular, popularUm)
 *  - Regras de transição de status editorial (TRANSICOES_VALIDAS, validarTransicao)
 */

import Noticia    from '../models/Noticia.js'
import Categoria  from '../models/Categoria.js'

// ─── Fluxo editorial ────────────────────────────────────────────────────────
// #20 — Transições de status permitidas.
// arquivado → publicado mantido para permitir reativação direta via toggle rápido.
export const TRANSICOES_VALIDAS = {
  rascunho:  ['revisao', 'publicado'],
  revisao:   ['rascunho', 'publicado', 'arquivado'],
  publicado: ['arquivado', 'rascunho'],
  arquivado: ['rascunho', 'publicado'],
}

/**
 * Valida se uma transição de status é permitida.
 * @param {string} statusAtual
 * @param {string} novoStatus
 * @returns {{ valido: boolean, permitidos: string[] }}
 */
export function validarTransicao(statusAtual, novoStatus) {
  const permitidos = TRANSICOES_VALIDAS[statusAtual] || []
  return {
    valido: permitidos.includes(novoStatus),
    permitidos,
  }
}

// ─── Helpers de populate ─────────────────────────────────────────────────────
/**
 * Aplica populate padrão em uma query de lista e define a ordenação.
 * @param {mongoose.Query} q
 * @param {object} sort
 */
export function popular(q, sort) {
  return q
    .populate('categoria_id', 'id nome slug cor')
    .populate('fonte_id',     'id nome url')
    .sort(sort || { criado_em: -1 })
}

/**
 * Aplica populate padrão em uma query de documento único.
 * @param {mongoose.Query} q
 */
export function popularUm(q) {
  return q
    .populate('categoria_id', 'id nome slug cor')
    .populate('fonte_id',     'id nome url')
}

// ─── Construção de filtros ───────────────────────────────────────────────────
/**
 * Monta o objeto de filtro MongoDB a partir dos query params da requisição.
 *
 * Regras de visibilidade (#20):
 *  - Não autenticado: força status = 'publicado'
 *  - Autenticado + status='todos': sem filtro de status
 *  - Autenticado + status=<valor>: filtra pelo valor passado
 *  - Autenticado sem status: retorna todos
 *
 * @param {object} query           — req.query
 * @param {boolean} autenticado
 * @returns {Promise<object>}      — filtro pronto para Noticia.find()
 */
export async function buildFiltro(query, autenticado) {
  const { categoria, q, dataInicio, dataFim, status } = query
  const filtro = {}

  // Visibilidade por status
  if (!autenticado) {
    filtro.status = 'publicado'
  } else if (status && status !== 'todos') {
    filtro.status = status
  }

  // Filtro por categoria (aceita slug único ou lista separada por vírgula)
  if (categoria) {
    const slugs = categoria.split(',').map(s => s.trim()).filter(Boolean)
    if (slugs.length === 1) {
      const cat = await Categoria.findOne({ slug: slugs[0] })
      if (cat) filtro.categoria_id = cat._id
    } else if (slugs.length > 1) {
      const cats = await Categoria.find({ slug: { $in: slugs } }).select('_id')
      filtro.categoria_id = { $in: cats.map(c => c._id) }
    }
  }

  // Busca full-text
  if (q?.trim()) filtro.$text = { $search: q.trim() }

  // Intervalo de datas
  if (dataInicio || dataFim) {
    filtro.criado_em = {}
    if (dataInicio) filtro.criado_em.$gte = new Date(dataInicio)
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      filtro.criado_em.$lte = fim
    }
  }

  return filtro
}

/**
 * Retorna as opções de ordenação MongoDB a partir do parâmetro `ordem`.
 * @param {string} ordem  — 'recente' | 'antigo' | 'relevancia'
 * @param {string} q      — termo de busca (necessário para relevância)
 * @returns {object}
 */
export function buildSort(ordem, q) {
  if (ordem === 'antigo')                    return { criado_em: 1 }
  if (ordem === 'relevancia' && q?.trim())   return { score: { $meta: 'textScore' }, criado_em: -1 }
  return { criado_em: -1 }   // padrão: mais recente primeiro
}

// ─── Montagem de payload de criação/atualização ──────────────────────────────
/**
 * Extrai e normaliza os campos de uma notícia a partir do body da requisição.
 * @param {object} body — req.body
 * @returns {object}
 */
export function extrairCampos(body) {
  const {
    titulo, resumo, conteudo,
    imagem_url, imagem_public_id, imagem_legenda,
    categoria_id, fonte_id, destaque,
    galeria, status,
  } = body

  return {
    titulo,
    conteudo,
    resumo:           resumo           || '',
    imagem_url:       imagem_url       || null,
    imagem_public_id: imagem_public_id || null,
    imagem_legenda:   imagem_legenda   || '',
    destaque:         destaque         || false,
    categoria_id:     categoria_id     || null,
    fonte_id:         fonte_id         || null,
    ...(Array.isArray(galeria) ? { galeria } : {}),
    status,
  }
}
