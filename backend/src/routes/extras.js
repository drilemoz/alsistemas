/**
 * Rotas de extras: Configurações, Módulos, Notícias Externas, Tópicos, Ônibus, Eventos.
 * #2  — Paginação por cursor em /eventos, /onibus, /noticias-externas.
 * #19 — Audit log nas mutações autenticadas.
 */
import { Router } from 'express'
import ConfiguracaoHome from '../models/ConfiguracaoHome.js'
import ModuloHome from '../models/ModuloHome.js'
import { NoticiaExterna, Topico } from '../models/Extras.js'
import { Onibus } from '../models/Onibus.js'
import { Evento } from '../models/Evento.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'
import { auditLog } from '../middleware/auditLog.js'
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js'
import {
  regraConfiguracao, regraConfiguracaoLote,
  regraNoticiaExterna, regraTopico, validar,
} from '../middleware/validacoes.js'

const router = Router()
const CACHE_KEY_CONFIG    = 'configuracoes_home'
const CACHE_KEY_CATEGORIAS = 'categorias_lista'
const CACHE_KEY_MODULOS    = 'modulos_ativos'
const CACHE_TTL = 60

// ─── Helper: paginação por cursor genérica ────────────────────
/**
 * Pagina uma query Mongoose por cursor (campo `criado_em` decrescente).
 * @param {Model}  Model     - Modelo Mongoose
 * @param {Object} filtro    - Filtro base
 * @param {string} cursor    - ISO string do último criado_em visto
 * @param {number} lim       - Limite de itens
 * @param {Object} sortOpt   - Opção de sort (padrão: { criado_em: -1 })
 */
async function paginarPorCursor(Model, filtro, cursor, lim, sortOpt = { criado_em: -1 }) {
  const f = { ...filtro }
  if (cursor) {
    if (!f.criado_em) f.criado_em = {}
    f.criado_em.$lt = new Date(cursor)
  }
  const docs = await Model.find(f).sort(sortOpt).limit(lim)
  const nextCursor = docs.length === lim
    ? docs[docs.length - 1].criado_em?.toISOString()
    : null
  return { docs, nextCursor }
}

// ─── CONFIGURAÇÕES ──────────────────────────────────────────

router.get('/configuracoes', async (_req, res, next) => {
  try {
    const cached = await cacheGet(CACHE_KEY_CONFIG)
    if (cached) return res.json(cached)
    const configs = await ConfiguracaoHome.find()
    const mapa = configs.reduce((acc, c) => ({ ...acc, [c.chave]: c.valor }), {})
    await cacheSet(CACHE_KEY_CONFIG, mapa, CACHE_TTL)
    res.json(mapa)
  } catch (err) { next(err) }
})

router.put('/configuracoes/:chave', autenticar, verificarPermissao('configuracoes.gerenciar'), auditLog('configuracoes'), regraConfiguracao, validar, async (req, res, next) => {
  try {
    const { valor } = req.body
    const config = await ConfiguracaoHome.findOneAndUpdate(
      { chave: req.params.chave }, { valor }, { new: true, upsert: true }
    )
    await cacheDel(CACHE_KEY_CONFIG)
    res.json(config)
  } catch (err) { next(err) }
})

router.put('/configuracoes-lote', autenticar, verificarPermissao('configuracoes.gerenciar'), auditLog('configuracoes'), regraConfiguracaoLote, validar, async (req, res, next) => {
  try {
    const { pares } = req.body
    await Promise.all(
      pares.map(({ chave, valor }) =>
        ConfiguracaoHome.findOneAndUpdate({ chave }, { valor }, { upsert: true })
      )
    )
    await cacheDel(CACHE_KEY_CONFIG)
    res.json({ mensagem: 'Configurações atualizadas' })
  } catch (err) { next(err) }
})

// ─── MÓDULOS ────────────────────────────────────────────────

// #1 — Cache da lista de módulos ativos
router.get('/modulos', async (_req, res, next) => {
  try {
    const cached = await cacheGet(CACHE_KEY_MODULOS)
    if (cached) return res.json(cached)
    const modulos = await ModuloHome.find().sort({ ordem: 1 })
    await cacheSet(CACHE_KEY_MODULOS, modulos, CACHE_TTL)
    res.json(modulos)
  } catch (err) { next(err) }
})

router.put('/modulos/:id', autenticar, verificarPermissao('modulos.gerenciar'), auditLog('modulos'), async (req, res, next) => {
  try {
    const modulo = await ModuloHome.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!modulo) return res.status(404).json({ erro: 'Módulo não encontrado' })
    await cacheDel(CACHE_KEY_MODULOS)
    res.json(modulo)
  } catch (err) { next(err) }
})

// ─── NOTÍCIAS EXTERNAS ──────────────────────────────────────

/**
 * @swagger
 * /api/noticias-externas:
 *   get:
 *     summary: Lista notícias externas ativas com paginação por cursor
 *     tags: [Extras]
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/noticias-externas', async (req, res, next) => {
  try {
    const { cursor, limit } = req.query
    const lim = Math.min(100, parseInt(limit) || 20)

    if (cursor) {
      const { docs, nextCursor } = await paginarPorCursor(
        NoticiaExterna, { ativo: true }, cursor, lim, { ordem: 1, criado_em: -1 }
      )
      return res.json({ noticias: docs, nextCursor })
    }

    const noticias = await NoticiaExterna.find({ ativo: true }).sort({ ordem: 1 })
    res.json(noticias)
  } catch (err) { next(err) }
})

router.get('/noticias-externas/todas', autenticar, async (_req, res, next) => {
  try {
    const noticias = await NoticiaExterna.find().sort({ ordem: 1 })
    res.json(noticias)
  } catch (err) { next(err) }
})

router.post('/noticias-externas', autenticar, verificarPermissao('extras.gerenciar'), auditLog('noticias-externas'), regraNoticiaExterna, validar, async (req, res, next) => {
  try {
    const noticia = await NoticiaExterna.create(req.body)
    res.status(201).json(noticia)
  } catch (err) { next(err) }
})

router.put('/noticias-externas/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('noticias-externas'), regraNoticiaExterna, validar, async (req, res, next) => {
  try {
    const noticia = await NoticiaExterna.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!noticia) return res.status(404).json({ erro: 'Notícia externa não encontrada' })
    res.json(noticia)
  } catch (err) { next(err) }
})

router.delete('/noticias-externas/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('noticias-externas'), async (req, res, next) => {
  try {
    await NoticiaExterna.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Notícia externa excluída' })
  } catch (err) { next(err) }
})

// ─── TÓPICOS ────────────────────────────────────────────────

router.get('/topicos', async (_req, res, next) => {
  try {
    const topicos = await Topico.find({ ativo: true }).sort({ ordem: 1 })
    res.json(topicos)
  } catch (err) { next(err) }
})

router.get('/topicos/todos', autenticar, async (_req, res, next) => {
  try {
    const topicos = await Topico.find().sort({ ordem: 1 })
    res.json(topicos)
  } catch (err) { next(err) }
})

router.post('/topicos', autenticar, verificarPermissao('extras.gerenciar'), auditLog('topicos'), regraTopico, validar, async (req, res, next) => {
  try {
    const topico = await Topico.create(req.body)
    res.status(201).json(topico)
  } catch (err) { next(err) }
})

router.put('/topicos/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('topicos'), regraTopico, validar, async (req, res, next) => {
  try {
    const topico = await Topico.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!topico) return res.status(404).json({ erro: 'Tópico não encontrado' })
    res.json(topico)
  } catch (err) { next(err) }
})

router.delete('/topicos/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('topicos'), async (req, res, next) => {
  try {
    await Topico.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Tópico excluído' })
  } catch (err) { next(err) }
})

// ─── ÔNIBUS ─────────────────────────────────────────────────

/**
 * @swagger
 * /api/onibus:
 *   get:
 *     summary: Lista linhas de ônibus ativas com paginação por cursor
 *     tags: [Extras]
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 */
router.get('/onibus', async (req, res, next) => {
  try {
    const { cursor, limit } = req.query
    const lim = Math.min(200, parseInt(limit) || 50)

    if (cursor) {
      const { docs, nextCursor } = await paginarPorCursor(
        Onibus, { ativo: true }, cursor, lim, { ordem: 1, destino: 1 }
      )
      return res.json({ linhas: docs, nextCursor })
    }

    const linhas = await Onibus.find({ ativo: true }).sort({ ordem: 1, destino: 1 })
    res.json(linhas)
  } catch (err) { next(err) }
})

router.get('/onibus/todos', autenticar, async (_req, res, next) => {
  try {
    const linhas = await Onibus.find().sort({ ordem: 1, destino: 1 })
    res.json(linhas)
  } catch (err) { next(err) }
})

router.post('/onibus', autenticar, verificarPermissao('extras.gerenciar'), auditLog('onibus'), async (req, res, next) => {
  try {
    const linha = await Onibus.create(req.body)
    res.status(201).json(linha)
  } catch (err) { next(err) }
})

router.put('/onibus/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('onibus'), async (req, res, next) => {
  try {
    const linha = await Onibus.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!linha) return res.status(404).json({ erro: 'Linha não encontrada' })
    res.json(linha)
  } catch (err) { next(err) }
})

router.delete('/onibus/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('onibus'), async (req, res, next) => {
  try {
    await Onibus.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Linha excluída' })
  } catch (err) { next(err) }
})

// ─── EVENTOS ────────────────────────────────────────────────

/**
 * @swagger
 * /api/eventos:
 *   get:
 *     summary: Lista eventos futuros ativos com paginação por cursor
 *     tags: [Extras]
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: ISO date do último `data` visto
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/eventos', async (req, res, next) => {
  try {
    const { cursor, limit } = req.query
    const lim = Math.min(100, parseInt(limit) || 20)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

    if (cursor) {
      const eventos = await Evento.find({
        ativo: true,
        data: { $gte: hoje, $gt: new Date(cursor) },
      }).sort({ data: 1 }).limit(lim)

      const nextCursor = eventos.length === lim
        ? eventos[eventos.length - 1].data?.toISOString()
        : null
      return res.json({ eventos, nextCursor })
    }

    const eventos = await Evento.find({ ativo: true, data: { $gte: hoje } }).sort({ data: 1 })
    res.json(eventos)
  } catch (err) { next(err) }
})

router.get('/eventos/todos', autenticar, async (_req, res, next) => {
  try {
    const eventos = await Evento.find().sort({ data: 1 })
    res.json(eventos)
  } catch (err) { next(err) }
})

router.post('/eventos', autenticar, verificarPermissao('extras.gerenciar'), auditLog('eventos'), async (req, res, next) => {
  try {
    const evento = await Evento.create(req.body)
    res.status(201).json(evento)
  } catch (err) { next(err) }
})

router.put('/eventos/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('eventos'), async (req, res, next) => {
  try {
    const evento = await Evento.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!evento) return res.status(404).json({ erro: 'Evento não encontrado' })
    res.json(evento)
  } catch (err) { next(err) }
})

router.delete('/eventos/:id', autenticar, verificarPermissao('extras.gerenciar'), auditLog('eventos'), async (req, res, next) => {
  try {
    await Evento.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Evento excluído' })
  } catch (err) { next(err) }
})

export default router
