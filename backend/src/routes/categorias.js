import { Router } from 'express'
import Categoria from '../models/Categoria.js'
import { autenticar } from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'
import { regraCategoria, validar } from '../middleware/validacoes.js'

const router = Router()

// GET /api/categorias
router.get('/', async (_req, res, next) => {
  try {
    const categorias = await Categoria.find().sort({ nome: 1 })
    res.json(categorias)
  } catch (err) { next(err) }
})

// POST /api/categorias — autenticado
router.post('/', autenticar, verificarPermissao('categorias.gerenciar'), regraCategoria, validar, async (req, res, next) => {
  try {
    const { nome, slug, cor, descricao } = req.body
    const categoria = await Categoria.create({ nome, slug, cor: cor || '#1B5E3B', descricao: descricao || '' })
    res.status(201).json(categoria)
  } catch (err) { next(err) }
})

// PUT /api/categorias/:id — autenticado
router.put('/:id', autenticar, verificarPermissao('categorias.gerenciar'), regraCategoria, validar, async (req, res, next) => {
  try {
    const { nome, slug, cor, descricao } = req.body
    const categoria = await Categoria.findByIdAndUpdate(
      req.params.id,
      { nome, slug, cor: cor || '#1B5E3B', descricao: descricao ?? '' },
      { new: true, runValidators: true }
    )
    if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada' })
    res.json(categoria)
  } catch (err) { next(err) }
})

// DELETE /api/categorias/:id — autenticado
router.delete('/:id', autenticar, verificarPermissao('categorias.gerenciar'), async (req, res, next) => {
  try {
    const categoria = await Categoria.findByIdAndDelete(req.params.id)
    if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada' })
    res.json({ mensagem: 'Categoria excluída' })
  } catch (err) { next(err) }
})

export default router
