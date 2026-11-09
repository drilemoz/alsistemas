/**
 * rssAdmin.js
 * ───────────
 * Rotas admin para gestão de fontes RSS e controle de importações.
 *
 * Endpoints:
 *   GET    /admin/rss/fontes             → lista fontes cadastradas
 *   POST   /admin/rss/fontes             → cadastra nova fonte
 *   PUT    /admin/rss/fontes/:id         → atualiza fonte
 *   DELETE /admin/rss/fontes/:id         → remove fonte
 *   POST   /admin/rss/fontes/:id/importar → importação manual de uma fonte
 *   POST   /admin/rss/importar-todas     → importação de todas as fontes ativas
 *   POST   /admin/rss/testar-url         → valida um feed antes de cadastrar
 *   GET    /admin/rss/status             → status do scheduler
 *   POST   /admin/rss/scheduler/iniciar  → (re)inicia o cron
 *   POST   /admin/rss/scheduler/parar    → para o cron
 */
import { Router } from 'express'
import RssFonte from '../models/RssFonte.js'
import { importarFonte, importarTodasFontes, parseFeed } from '../services/rssImporter.js'
import {
  iniciarRssJob,
  pararRssJob,
  dispararImportacaoManual,
  statusRssJob,
} from '../jobs/rssJob.js'
import { autenticar }         from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'
import { logger }             from '../utils/logger.js'

const router   = Router()
const auth     = [autenticar]
const authEdit = [autenticar, verificarPermissao('noticias.criar')]

// ─── Fontes padrão pré-definidas ─────────────────────────────────────────────

const RSS_FONTES_PADRAO = [
  { nome: 'Agência Brasil (EBC)',               url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.rss' },
  { nome: 'Folha de S.Paulo – Em Cima da Hora', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' },
  { nome: 'CNN Brasil',                         url: 'https://www.cnnbrasil.com.br/feed/' },
  { nome: 'UOL Notícias',                       url: 'https://rss.uol.com.br/feed/noticias.xml' },
  { nome: 'Metrópoles',                         url: 'https://www.metropoles.com/feed/' },
  { nome: 'Correio Braziliense',                url: 'https://www.correiobraziliense.com.br/arc/outboundfeeds/rss/' },
]

// ─── Fontes RSS: CRUD ─────────────────────────────────────────────────────────

/**
 * GET /admin/rss/fontes/padrao
 * Retorna a lista de fontes padrão disponíveis para cadastro rápido.
 * DEVE vir antes de /fontes/:id para evitar conflito de rota.
 */
router.get('/fontes/padrao', ...auth, (_req, res) => {
  res.json(RSS_FONTES_PADRAO)
})

/**
 * GET /admin/rss/fontes
 * Lista todas as fontes RSS com categoria populada.
 */
router.get('/fontes', ...auth, async (_req, res, next) => {
  try {
    const fontes = await RssFonte.find()
      .populate('categoria_id', 'id nome')
      .sort({ padrao: -1, nome: 1 })
    res.json(fontes)
  } catch (err) { next(err) }
})

/**
 * POST /admin/rss/fontes
 * Cadastra nova fonte RSS.
 *
 * Body: { nome, url, ativa?, categoria_id?, max_items?, auto_update?, intervalo_min? }
 */
router.post('/fontes', ...authEdit, async (req, res, next) => {
  try {
    const { nome, url, ativa, categoria_id, max_items, auto_update, intervalo_min } = req.body

    if (!nome?.trim())  return res.status(400).json({ erro: 'Campo "nome" é obrigatório' })
    if (!url?.trim())   return res.status(400).json({ erro: 'Campo "url" é obrigatório' })

    const existente = await RssFonte.findOne({ url: url.trim() })
    if (existente) return res.status(409).json({ erro: 'Já existe uma fonte com essa URL' })

    const fonte = await RssFonte.create({
      nome:          nome.trim(),
      url:           url.trim(),
      ativa:         ativa !== false,
      categoria_id:  categoria_id  || null,
      max_items:     max_items     || 10,
      auto_update:   auto_update   || false,
      intervalo_min: intervalo_min || 60,
    })

    res.status(201).json(fonte)
  } catch (err) { next(err) }
})

/**
 * PUT /admin/rss/fontes/:id
 * Atualiza uma fonte RSS existente.
 */
router.put('/fontes/:id', ...authEdit, async (req, res, next) => {
  try {
    const { nome, url, ativa, categoria_id, max_items, auto_update, intervalo_min } = req.body

    const fonte = await RssFonte.findByIdAndUpdate(
      req.params.id,
      { nome, url, ativa, categoria_id: categoria_id || null, max_items, auto_update, intervalo_min },
      { new: true, runValidators: true }
    ).populate('categoria_id', 'id nome')

    if (!fonte) return res.status(404).json({ erro: 'Fonte não encontrada' })
    res.json(fonte)
  } catch (err) { next(err) }
})

/**
 * DELETE /admin/rss/fontes/:id
 * Remove uma fonte RSS (não remove as notícias já importadas por ela).
 */
router.delete('/fontes/:id', ...authEdit, async (req, res, next) => {
  try {
    const fonte = await RssFonte.findByIdAndDelete(req.params.id)
    if (!fonte) return res.status(404).json({ erro: 'Fonte não encontrada' })
    res.json({ mensagem: 'Fonte removida com sucesso' })
  } catch (err) { next(err) }
})

// ─── Importação ───────────────────────────────────────────────────────────────

/**
 * POST /admin/rss/fontes/:id/importar
 * Importação manual de uma única fonte.
 *
 * Body: { categoria_id? }
 */
router.post('/fontes/:id/importar', ...authEdit, async (req, res, next) => {
  try {
    const fonte = await RssFonte.findById(req.params.id)
    if (!fonte) return res.status(404).json({ erro: 'Fonte não encontrada' })

    logger.info({ fonte: fonte.nome, usuario: req.usuario?.email }, '🖱️ Importação manual iniciada')

    const resultado = await importarFonte(fonte, {
      categoria_id: req.body.categoria_id,
    })

    res.json({
      mensagem: 'Importação concluída com sucesso',
      fonte:    fonte.nome,
      ...resultado,
    })
  } catch (err) {
    logger.error({ err: err.message, fonteId: req.params.id }, 'Erro na importação manual')
    next(err)
  }
})

/**
 * POST /admin/rss/importar-todas
 * Importação de todas as fontes ativas em paralelo controlado.
 */
router.post('/importar-todas', ...authEdit, async (_req, res, next) => {
  try {
    const resultados = await importarTodasFontes(3)

    const totais = resultados.reduce(
      (acc, r) => ({
        importadas:    acc.importadas    + (r.importadas    ?? 0),
        ignoradas:     acc.ignoradas     + (r.ignoradas     ?? 0),
        fontesComErro: acc.fontesComErro + (r.erro ? 1 : 0),
      }),
      { importadas: 0, ignoradas: 0, fontesComErro: 0 }
    )

    res.json({
      mensagem:   'Importação em massa concluída',
      ...totais,
      resultados,
    })
  } catch (err) { next(err) }
})

/**
 * POST /admin/rss/testar-url
 * Valida um feed RSS antes de cadastrar.
 * Retorna prévia dos primeiros 3 itens.
 *
 * Body: { url }
 */
router.post('/testar-url', ...authEdit, async (req, res, next) => {
  try {
    const { url } = req.body
    if (!url?.trim()) return res.status(400).json({ erro: 'URL é obrigatória' })

    let items
    try {
      items = await parseFeed(url.trim())
    } catch (err) {
      return res.status(422).json({ erro: `Feed inválido: ${err.message}` })
    }

    if (!items.length) {
      return res.status(422).json({ erro: 'Feed acessível mas sem itens — verifique se é RSS 2.0 ou Atom' })
    }

    res.json({
      valido:      true,
      total_itens: items.length,
      preview: items.slice(0, 3).map(i => ({
        titulo: i.title,
        link:   i.link,
        data:   i.pubDate || i.isoDate,
        temConteudo: !!(i.contentEncoded || i['content:encoded'] || i.content),
      })),
    })
  } catch (err) { next(err) }
})

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * GET /admin/rss/status
 * Retorna o estado atual do cron job + stats básicas de importação.
 */
router.get('/status', ...auth, async (_req, res, next) => {
  try {
    const scheduler = statusRssJob()

    // Stats rápidas do banco (não bloqueantes para UX)
    const [totalFontes, totalImportadas, rascunhosImportados] = await Promise.all([
      RssFonte.countDocuments(),
      RssFonte.aggregate([{ $group: { _id: null, total: { $sum: '$total_importadas' } } }]),
      // Usar o model Noticia seria importar aqui — use uma query raw se necessário
      // Deixamos como exemplo do que pode ser exposto:
      Promise.resolve(null),
    ])

    res.json({
      scheduler,
      stats: {
        fontesCadastradas:  totalFontes,
        totalImportadas:    totalImportadas[0]?.total ?? 0,
      },
    })
  } catch (err) { next(err) }
})

/**
 * POST /admin/rss/scheduler/iniciar
 * (Re)inicia o cron job com a expressão fornecida.
 *
 * Body: { expressao? }  (padrão: '0 * * * *' = a cada hora)
 */
router.post('/scheduler/iniciar', ...authEdit, (req, res, next) => {
  try {
    const expressao = req.body.expressao || '0 * * * *'
    pararRssJob()          // para o anterior caso exista
    iniciarRssJob(expressao)
    res.json({ mensagem: 'Scheduler iniciado', expressao })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /admin/rss/scheduler/parar
 * Para o cron job.
 */
router.post('/scheduler/parar', ...authEdit, (_req, res) => {
  pararRssJob()
  res.json({ mensagem: 'Scheduler encerrado' })
})

/**
 * POST /admin/rss/scheduler/executar-agora
 * Dispara um ciclo manual imediato sem esperar o cron.
 */
router.post('/scheduler/executar-agora', ...authEdit, async (_req, res, next) => {
  try {
    // Responde imediatamente: o ciclo roda em background
    res.json({ mensagem: 'Ciclo de importação iniciado em background' })
    // Fire-and-forget — log é feito dentro do ciclo
    dispararImportacaoManual().catch(err =>
      logger.error({ err: err.message }, 'Erro no ciclo manual via scheduler')
    )
  } catch (err) { next(err) }
})

export default router
