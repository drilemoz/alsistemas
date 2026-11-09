import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { autenticar } from '../middleware/auth.js'
import { upload, uploadParaCloudinary } from '../middleware/upload.js'
import { cloudinary } from '../config/index.js'

const router = Router()

// #3 — Rate limit: máx 20 uploads por IP a cada 10 min
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitos uploads. Tente novamente em 10 minutos.' },
})

// POST /api/upload — autenticado
router.post('/', autenticar, uploadLimiter, upload.single('imagem'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })
  try {
    const resultado = await uploadParaCloudinary(req.file.buffer)
    res.json({
      url:       resultado.secure_url,
      public_id: resultado.public_id,
    })
  } catch (err) { next(err) }
})

// DELETE /api/upload — autenticado
router.delete('/', autenticar, async (req, res, next) => {
  try {
    const { public_id } = req.body
    if (!public_id) return res.status(400).json({ erro: 'public_id obrigatório' })
    await cloudinary.uploader.destroy(public_id)
    res.json({ mensagem: 'Imagem removida' })
  } catch (err) { next(err) }
})

export default router
