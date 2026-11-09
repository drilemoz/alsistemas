import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { rateLimit } from 'express-rate-limit'
import Usuario from '../models/Usuario.js'
import { autenticar } from '../middleware/auth.js'
import { regraLogin, validar } from '../middleware/validacoes.js'
import { validarForcaSenha } from '../routes/usuarios.js'
import { logger } from '../utils/logger.js'

const router = Router()

// #3 — Rate limit: máx 10 tentativas de login por IP a cada 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
})

// Cross-origin = frontend e backend em domínios diferentes (produção real).
// Detectamos pela FRONTEND_URL: se não for localhost/127.0.0.1, usamos
// SameSite=None + Secure — independente do NODE_ENV.
// Isso evita a desconexão imediata causada por SameSite=Lax em fetch cross-origin.
const crossOrigin = !/localhost|127\.0\.0\.1/.test(process.env.FRONTEND_URL || '')

const COOKIE_OPTS = {
  httpOnly: true,
  secure: crossOrigin,
  sameSite: crossOrigin ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 dias (ms)
  path: '/',
}

const MAX_TENTATIVAS   = 5
const BLOQUEIO_MINUTOS = 30

function gerarToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimiter, regraLogin, validar, async (req, res, next) => {
  try {
    const { email, senha } = req.body

    // Busca incluindo campos ocultos pelo select:false + populate de permissões
    // IMPORTANTE: sem o populate aqui, perfil_id chega sem permissoes no frontend
    // e podeAcessarAdmin() retorna false para jornalistas logo após o login.
    const usuario = await Usuario.findOne({ email })
      .select('+token_reset_senha +token_reset_expira')
      .populate('perfil_id', 'nome cor permissoes')

    if (!usuario) return res.status(401).json({ erro: 'Email ou senha incorretos' })

    // Conta desativada
    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Conta desativada. Contacte um administrador.' })
    }

    // Conta bloqueada por excesso de tentativas
    if (usuario.bloqueado_ate && usuario.bloqueado_ate > new Date()) {
      const minutos = Math.ceil((usuario.bloqueado_ate - new Date()) / 60000)
      return res.status(403).json({
        erro: `Conta temporariamente bloqueada. Tente novamente em ${minutos} minuto(s).`,
      })
    }

    const senhaOk = await usuario.verificarSenha(senha)

    if (!senhaOk) {
      usuario.tentativas_login = (usuario.tentativas_login || 0) + 1
      if (usuario.tentativas_login >= MAX_TENTATIVAS) {
        usuario.bloqueado_ate = new Date(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000)
        await usuario.save()
        return res.status(403).json({
          erro: `Muitas tentativas incorretas. Conta bloqueada por ${BLOQUEIO_MINUTOS} minutos.`,
        })
      }
      await usuario.save()
      const restantes = MAX_TENTATIVAS - usuario.tentativas_login
      return res.status(401).json({
        erro: `Email ou senha incorretos. ${restantes} tentativa(s) restante(s) antes do bloqueio.`,
      })
    }

    // Login bem-sucedido — resetar contadores
    usuario.tentativas_login = 0
    usuario.bloqueado_ate    = null
    usuario.ultimo_acesso    = new Date()
    await usuario.save()

    const token = gerarToken(usuario._id)

    // #1 — Envia token via cookie HttpOnly
    res.cookie('alsistemas_token', token, COOKIE_OPTS)
    res.json({ usuario })
  } catch (err) { next(err) }
})

// ── GET /api/auth/me — retorna usuário logado ────────────────────────────────
router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario })
})

// ── PUT /api/auth/me — editar próprio perfil (qualquer usuário autenticado) ──
router.put('/me', autenticar, async (req, res, next) => {
  try {
    const { nome, senha } = req.body
    const usuario = await Usuario.findById(req.usuario._id)
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' })

    if (nome?.trim()) usuario.nome = nome.trim()

    if (senha) {
      if (!validarForcaSenha(senha)) {
        return res.status(400).json({
          erro: 'A senha deve ter pelo menos 8 caracteres, incluindo letras, números e um símbolo.',
        })
      }
      usuario.senha = senha
    }

    await usuario.save()
    res.json({ usuario })
  } catch (err) { next(err) }
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.clearCookie('alsistemas_token', { ...COOKIE_OPTS, maxAge: undefined })
  res.json({ mensagem: 'Logout realizado' })
})

// ── POST /api/auth/esqueci-senha ─────────────────────────────────────────────
// Gera token de reset e o envia (por e-mail em produção; exibido no log em dev)
router.post('/esqueci-senha', async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email?.trim()) return res.status(400).json({ erro: 'Email obrigatório.' })

    // Resposta genérica para não revelar se o email existe
    const RESPOSTA_GENERICA = { mensagem: 'Se o email estiver cadastrado, você receberá as instruções em breve.' }

    const usuario = await Usuario.findOne({ email: email.trim().toLowerCase() })
      .select('+token_reset_senha +token_reset_expira')

    if (!usuario || !usuario.ativo) return res.json(RESPOSTA_GENERICA)

    // Gera token seguro com validade de 1h
    const token = crypto.randomBytes(32).toString('hex')
    usuario.token_reset_senha  = token
    usuario.token_reset_expira = new Date(Date.now() + 60 * 60 * 1000)
    await usuario.save()

    const baseUrl   = process.env.FRONTEND_URL || 'http://localhost:5173'
    const linkReset = `${baseUrl}/redefinir-senha?token=${token}`

    // Em produção: integrar com serviço de e-mail (nodemailer, Resend, etc.)
    // Em desenvolvimento: exibe o link no log do servidor
    if (process.env.NODE_ENV !== 'production') {
      logger.info({ linkReset }, '🔑 Link de redefinição de senha (apenas dev)')
    } else {
      // TODO: enviar e-mail com linkReset para usuario.email
      logger.warn({ email: usuario.email }, 'Reset de senha solicitado — integre com serviço de e-mail')
    }

    res.json(RESPOSTA_GENERICA)
  } catch (err) { next(err) }
})

// ── POST /api/auth/redefinir-senha ───────────────────────────────────────────
router.post('/redefinir-senha', async (req, res, next) => {
  try {
    const { token, senha } = req.body
    if (!token || !senha) return res.status(400).json({ erro: 'Token e nova senha são obrigatórios.' })

    if (!validarForcaSenha(senha)) {
      return res.status(400).json({
        erro: 'A senha deve ter pelo menos 8 caracteres, incluindo letras, números e um símbolo.',
      })
    }

    const usuario = await Usuario.findOne({
      token_reset_senha:  token,
      token_reset_expira: { $gt: new Date() },
      ativo: true,
    }).select('+token_reset_senha +token_reset_expira')

    if (!usuario) {
      return res.status(400).json({ erro: 'Token inválido ou expirado. Solicite um novo link.' })
    }

    usuario.senha              = senha
    usuario.token_reset_senha  = null
    usuario.token_reset_expira = null
    usuario.tentativas_login   = 0
    usuario.bloqueado_ate      = null
    await usuario.save()

    res.json({ mensagem: 'Senha redefinida com sucesso. Faça login com a nova senha.' })
  } catch (err) { next(err) }
})

export default router
