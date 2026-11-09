import { Router } from 'express'
import Assinante from '../models/Assinante.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'

const router = Router()

// POST /api/newsletter/assinar — público
router.post('/assinar', async (req, res, next) => {
  try {
    const { email, nome } = req.body
    if (!email?.trim()) return res.status(400).json({ erro: 'Email é obrigatório' })

    // Se já existe mas estava inativo, reativa
    const existente = await Assinante.findOne({ email: email.toLowerCase().trim() })
    if (existente) {
      if (existente.ativo) {
        return res.status(409).json({ erro: 'Este email já está inscrito.' })
      }
      existente.ativo = true
      existente.nome  = nome?.trim() || existente.nome
      await existente.save()
      return res.json({ mensagem: 'Inscrição reativada com sucesso!' })
    }

    await Assinante.create({ email: email.trim(), nome: nome?.trim() || '' })
    res.status(201).json({ mensagem: 'Inscrição realizada com sucesso!' })
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ erro: 'Este email já está inscrito.' })
    next(err)
  }
})

// GET /api/newsletter/cancelar/:token — público (link no email)
router.get('/cancelar/:token', async (req, res, next) => {
  try {
    const assinante = await Assinante.findOne({ token_cancelamento: req.params.token })
    if (!assinante) return res.status(404).json({ erro: 'Link inválido ou expirado.' })
    assinante.ativo = false
    await assinante.save()
    res.json({ mensagem: 'Inscrição cancelada com sucesso.' })
  } catch (err) { next(err) }
})

// ─── Rotas autenticadas (admin) ───────────────────────────────

// GET /api/newsletter/assinantes — lista todos
router.get('/assinantes', autenticar, async (req, res, next) => {
  try {
    const { ativo, page = 1, limit = 50 } = req.query
    const filtro = {}
    if (ativo === 'true')  filtro.ativo = true
    if (ativo === 'false') filtro.ativo = false

    const lim   = Math.min(200, parseInt(limit))
    const skip  = (Math.max(1, parseInt(page)) - 1) * lim
    const total = await Assinante.countDocuments(filtro)
    const lista = await Assinante.find(filtro)
      .sort({ inscrito_em: -1 })
      .skip(skip)
      .limit(lim)
      .select('-token_cancelamento')

    res.json({ assinantes: lista, total, pagina: parseInt(page), paginas: Math.ceil(total / lim) })
  } catch (err) { next(err) }
})

// DELETE /api/newsletter/assinantes/:id — admin remove
router.delete('/assinantes/:id', autenticar, verificarPermissao('newsletter.gerenciar'), async (req, res, next) => {
  try {
    await Assinante.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Assinante removido.' })
  } catch (err) { next(err) }
})

// PATCH /api/newsletter/assinantes/:id/status — admin ativa/desativa
router.patch('/assinantes/:id/status', autenticar, verificarPermissao('newsletter.gerenciar'), async (req, res, next) => {
  try {
    const { ativo } = req.body
    const a = await Assinante.findByIdAndUpdate(req.params.id, { ativo }, { new: true })
    if (!a) return res.status(404).json({ erro: 'Assinante não encontrado' })
    res.json(a)
  } catch (err) { next(err) }
})

export default router
