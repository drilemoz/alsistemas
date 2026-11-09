/**
 * #9 — Health check detalhado: MongoDB, Redis, Cloudinary, GitHub e Groq/IA.
 */
import { Router } from 'express'
import mongoose from 'mongoose'
import { isRedisDisponivel } from '../utils/redis.js'
import { verificarCloudinary } from '../config/index.js'

const router = Router()

/** Verifica se o token GitHub está configurado e válido via /rate_limit */
async function verificarGitHub() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return { ok: false, status: 'token não configurado' }
  const res = await Promise.race([
    fetch('https://api.github.com/rate_limit', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
  ])
  if (!res.ok) return { ok: false, status: `erro ${res.status}` }
  const data = await res.json()
  const restante = data?.rate?.remaining ?? null
  return {
    ok: true,
    status: restante !== null ? `${restante} req restantes` : 'conectado',
  }
}

/** Verifica se a chave Groq está configurada e válida via /models */
async function verificarGroq() {
  const aiProvider = process.env.AI_PROVIDER || 'groq'
  // Se provedor não for groq, verifica Anthropic
  if (aiProvider !== 'groq') {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) return { ok: false, status: `${aiProvider}: chave não configurada` }
    return { ok: true, status: `${aiProvider}: configurado` }
  }
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return { ok: false, status: 'GROQ_API_KEY não configurada' }
  const res = await Promise.race([
    fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
  ])
  if (!res.ok) return { ok: false, status: `chave inválida (${res.status})` }
  const data = await res.json()
  const modelo = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  const disponivel = data?.data?.some?.(m => m.id === modelo)
  return {
    ok: true,
    status: disponivel ? `modelo: ${modelo}` : 'conectado',
  }
}

/** Verifica Cloudflare (token + S3 credentials) */
async function verificarCloudflare() {
  const token   = process.env.CF_API_TOKEN
  const s3Key   = process.env.CF_R2_ACCESS_KEY_ID
  const s3Sec   = process.env.CF_R2_SECRET_ACCESS_KEY
  if (!token) return { ok: false, status: 'CF_API_TOKEN não configurado' }
  try {
    const res = await Promise.race([
      fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ])
    if (!res.ok) return { ok: false, status: `token inválido (${res.status})` }
    return {
      ok: true,
      status: s3Key && s3Sec ? 'token + S3 configurados' : 'token ok (S3 ausente)',
    }
  } catch (e) {
    return { ok: false, status: e.message }
  }
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Verifica saúde do servidor e dependências
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Servidor saudável
 *       503:
 *         description: MongoDB desconectado
 */
router.get('/', async (_req, res) => {
  const inicio = Date.now()

  // MongoDB — único serviço verdadeiramente crítico
  const mongoOk     = mongoose.connection.readyState === 1
  const mongoStatus = mongoOk ? 'conectado' : 'desconectado'

  // Redis — opcional (fallback em memória já ativo)
  const redisOk     = isRedisDisponivel()
  const redisStatus = redisOk ? 'conectado' : 'indisponível (cache em memória ativo)'

  // Serviços externos em paralelo — falhas não tornam o servidor unhealthy
  const [cloudinaryResult, githubResult, groqResult, cloudflareResult] = await Promise.allSettled([
    Promise.race([
      verificarCloudinary(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]),
    verificarGitHub(),
    verificarGroq(),
    verificarCloudflare(),
  ])

  const cloudinaryStatus =
    cloudinaryResult.status === 'fulfilled'
      ? cloudinaryResult.value
      : { ok: false, erro: cloudinaryResult.reason?.message ?? 'erro' }

  const githubStatus =
    githubResult.status === 'fulfilled'
      ? githubResult.value
      : { ok: false, status: githubResult.reason?.message ?? 'erro' }

  const groqStatus =
    groqResult.status === 'fulfilled'
      ? groqResult.value
      : { ok: false, status: groqResult.reason?.message ?? 'erro' }

  const cloudflareStatus =
    cloudflareResult.status === 'fulfilled'
      ? cloudflareResult.value
      : { ok: false, status: cloudflareResult.reason?.message ?? 'erro' }

  // ── Apenas MongoDB determina o status HTTP ────────────────────
  // Cloudinary/Redis/GitHub/Groq/Cloudflare são informativos.
  // Evita que timeouts externos derrubem o Render desnecessariamente.
  const tudo_ok = mongoOk
  const status  = tudo_ok ? 200 : 503

  res.status(status).json({
    ok:          tudo_ok,
    env:         process.env.NODE_ENV,
    latencia_ms: Date.now() - inicio,
    servicos: {
      mongodb:    { ok: mongoOk,             status: mongoStatus },
      redis:      { ok: redisOk,             status: redisStatus },
      cloudinary: { ok: cloudinaryStatus.ok, status: cloudinaryStatus.ok ? 'conectado' : cloudinaryStatus.erro },
      github:     { ok: githubStatus.ok,     status: githubStatus.status },
      groq:       { ok: groqStatus.ok,       status: groqStatus.status },
      cloudflare: { ok: cloudflareStatus.ok, status: cloudflareStatus.status },
    },
  })
})

export default router
