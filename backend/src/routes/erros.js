import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import ErroLog from '../models/ErroLog.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'

const router = Router()

// Quantos erros manter no banco antes de purgar os mais antigos
const MAX_ERROS = 300

// #3 — Rate limit: máx 30 registros de erro por IP a cada 10 min
const erroLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' },
})

// ─── POST /api/erros ─────────────────────────────────────────
// Pública (sem auth) — chamada pelo frontend quando captura qualquer erro.
router.post('/', erroLimiter, async (req, res) => {
  try {
    const { tipo, mensagem, stack, url, rota, user_agent, usuario_email, dados } = req.body

    // Valida tipo
    const tiposValidos = ['render', 'js_error', 'unhandled_rejection', 'api']
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json({ erro: 'Tipo de erro inválido' })
    }
    if (!mensagem || typeof mensagem !== 'string') {
      return res.status(400).json({ erro: 'Mensagem obrigatória' })
    }

    // Filtra erros de extensões de browser e scripts externos
    if (mensagem.includes('chrome-extension://') || mensagem.includes('moz-extension://')) {
      return res.json({ ok: true, ignorado: true })
    }

    const erroSalvo = await ErroLog.create({
      tipo,
      mensagem:      mensagem.slice(0, 2000),
      stack:         stack?.slice(0, 5000) || null,
      url:           url?.slice(0, 500) || null,
      rota:          rota?.slice(0, 200) || null,
      user_agent:    user_agent?.slice(0, 300) || null,
      usuario_email: usuario_email?.slice(0, 200) || null,
      dados:         dados || null,
    })

    // Purga os mais antigos se ultrapassar o limite (fire-and-forget)
    ErroLog.countDocuments().then(total => {
      if (total > MAX_ERROS) {
        const excesso = total - MAX_ERROS
        ErroLog
          .find().sort({ criado_em: 1 }).limit(excesso).select('_id')
          .then(docs => ErroLog.deleteMany({ _id: { $in: docs.map(d => d._id) } }))
          .catch(() => {})
      }
    }).catch(() => {})

    res.status(201).json({ ok: true, id: erroSalvo.id })
  } catch (err) {
    // Nunca retorna 500 ao frontend — o tracker de erros não pode gerar mais erros
    console.error('[ErroLog] Falha ao salvar erro:', err.message)
    res.json({ ok: false })
  }
})

// ─── GET /api/erros/contagem ──────────────────────────────────
// Retorna contagem de erros não lidos. Usado pelo admin para o badge.
router.get('/contagem', autenticar, verificarPermissao('erros.ver'), async (_req, res, next) => {
  try {
    const naoLidos = await ErroLog.countDocuments({ lido: false })
    const total    = await ErroLog.countDocuments()
    res.json({ nao_lidos: naoLidos, total })
  } catch (err) { next(err) }
})

// ─── GET /api/erros ───────────────────────────────────────────
// Lista erros com filtros e paginação.
router.get('/', autenticar, verificarPermissao('erros.ver'), async (req, res, next) => {
  try {
    const { tipo, lido, status, page = 1, limit = 50 } = req.query
    const pag = Math.max(1, parseInt(page))
    const lim = Math.min(100, Math.max(1, parseInt(limit)))

    const filtro = {}
    if (tipo)   filtro.tipo = tipo
    if (status) filtro.status = status
    // filtro lido só é aplicado se status não foi fornecido (evita conflito)
    if (lido !== undefined && !status) filtro.lido = lido === 'true'

    const [erros, total] = await Promise.all([
      ErroLog.find(filtro)
        .sort({ criado_em: -1 })
        .skip((pag - 1) * lim)
        .limit(lim),
      ErroLog.countDocuments(filtro),
    ])

    res.json({
      erros,
      total,
      pagina: pag,
      paginas: Math.ceil(total / lim),
    })
  } catch (err) { next(err) }
})

// ─── PATCH /api/erros/:id/lido ────────────────────────────────
router.patch('/:id/lido', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const { lido = true } = req.body
    const erro = await ErroLog.findByIdAndUpdate(
      req.params.id,
      { lido },
      { new: true }
    )
    if (!erro) return res.status(404).json({ erro: 'Erro não encontrado' })
    res.json(erro)
  } catch (err) { next(err) }
})

// ─── PATCH /api/erros/:id/status ─────────────────────────────
// Atualiza o status de triagem (novo / investigando / resolvido / ignorado).
// Também sincroniza o campo `lido` para manter consistência com o badge
// de notificações: apenas "novo" conta como não lido.
router.patch('/:id/status', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const statusValidos = ['novo', 'investigando', 'resolvido', 'ignorado']
    const { status } = req.body
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ erro: `Status inválido. Use: ${statusValidos.join(', ')}` })
    }
    const lido = status !== 'novo'  // "novo" = não lido; qualquer outro = lido
    const erro = await ErroLog.findByIdAndUpdate(
      req.params.id,
      { status, lido },
      { new: true }
    )
    if (!erro) return res.status(404).json({ erro: 'Erro não encontrado' })
    res.json(erro)
  } catch (err) { next(err) }
})

// ─── PATCH /api/erros/marcar-todos-lidos ─────────────────────
router.patch('/marcar-todos-lidos', autenticar, verificarPermissao('erros.gerenciar'), async (_req, res, next) => {
  try {
    const { modifiedCount } = await ErroLog.updateMany({ lido: false }, { lido: true })
    res.json({ ok: true, atualizados: modifiedCount })
  } catch (err) { next(err) }
})

// ─── DELETE /api/erros ────────────────────────────────────────
// Remove todos os erros (filtra por tipo / status / apenas_lidos).
router.delete('/', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const { tipo, status, apenas_lidos } = req.query
    const filtro = {}
    if (tipo)                    filtro.tipo   = tipo
    if (status)                  filtro.status = status
    if (apenas_lidos === 'true') filtro.lido   = true

    const { deletedCount } = await ErroLog.deleteMany(filtro)
    res.json({ ok: true, removidos: deletedCount })
  } catch (err) { next(err) }
})

// ─── DELETE /api/erros/bulk ───────────────────────────────────
// Remove lista de IDs específicos.
router.delete('/bulk', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ erro: 'ids deve ser um array não-vazio.' })
    const { deletedCount } = await ErroLog.deleteMany({ _id: { $in: ids } })
    res.json({ ok: true, removidos: deletedCount })
  } catch (err) { next(err) }
})

// ─── PATCH /api/erros/bulk-status ────────────────────────────
// Atualiza status de uma lista de IDs.
router.patch('/bulk-status', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const { ids, status } = req.body
    const statusValidos = ['novo', 'investigando', 'resolvido', 'ignorado']
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ erro: 'ids deve ser um array não-vazio.' })
    if (!status || !statusValidos.includes(status))
      return res.status(400).json({ erro: `Status inválido. Use: ${statusValidos.join(', ')}` })
    const lido = status !== 'novo'
    const { modifiedCount } = await ErroLog.updateMany({ _id: { $in: ids } }, { status, lido })
    res.json({ ok: true, atualizados: modifiedCount })
  } catch (err) { next(err) }
})

// ─── DELETE /api/erros/:id ────────────────────────────────────
router.delete('/:id', autenticar, verificarPermissao('erros.gerenciar'), async (req, res, next) => {
  try {
    const erro = await ErroLog.findByIdAndDelete(req.params.id)
    if (!erro) return res.status(404).json({ erro: 'Não encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
