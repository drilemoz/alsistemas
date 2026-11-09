/**
 * cloudflare.js — Rotas de gerenciamento da conta Cloudflare.
 *
 * Rotas disponíveis:
 *   GET  /status            — Verifica token + info da conta
 *   GET  /zonas             — Lista todas as zonas (domínios)
 *   GET  /zonas/:id/dns     — Lista registros DNS de uma zona
 *   POST /zonas/:id/dns     — Cria um registro DNS
 *   PUT  /zonas/:id/dns/:r  — Atualiza um registro DNS
 *   DEL  /zonas/:id/dns/:r  — Remove um registro DNS
 *   GET  /zonas/:id/analytics — Analytics de tráfego (últimas 24h)
 *   GET  /zonas/:id/pagerules — Regras de página ativas
 *   GET  /zonas/:id/firewall  — Eventos de firewall recentes
 *   GET  /workers           — Workers da conta
 *   GET  /zonas/:id/ssl     — Status SSL/TLS da zona
 *
 * Requer env:
 *   CF_API_TOKEN   — Account API Token
 *   CF_ACCOUNT_ID  — Account ID
 */
import { Router }              from 'express'
import multer                  from 'multer'
import { autenticar }          from '../middleware/auth.js'
import { verificarPermissao }  from '../middleware/verificarPermissao.js'
import { logger }              from '../utils/logger.js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const router = Router()
router.use(autenticar)
router.use(verificarPermissao('configuracoes.gerenciar'))

// ── Upload em memória (até 50 MB) ─────────────────────────────
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// ── S3 Client para R2 ─────────────────────────────────────────
function r2S3Client() {
  return new S3Client({
    region:   'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.CF_R2_ACCESS_KEY_ID     || '',
      secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY || '',
    },
  })
}

// ── Helpers ────────────────────────────────────────────────────

const CF_BASE = 'https://api.cloudflare.com/client/v4'

function cfHeaders() {
  const token = process.env.CF_API_TOKEN
  if (!token) throw new Error('CF_API_TOKEN não configurado.')
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  }
}

async function cfFetch(path, opts = {}) {
  const url = `${CF_BASE}${path}`
  const res = await fetch(url, { ...opts, headers: { ...cfHeaders(), ...opts.headers } })
  const json = await res.json().catch(() => ({}))
  if (!json.success) {
    const msg = json.errors?.[0]?.message || `Erro ${res.status}`
    throw new Error(`Cloudflare: ${msg}`)
  }
  return json
}

function accountId() {
  const id = process.env.CF_ACCOUNT_ID
  if (!id) throw new Error('CF_ACCOUNT_ID não configurado.')
  return id
}

// ── GET /status ─────────────────────────────────────────────────
router.get('/status', async (_req, res, next) => {
  try {
    const [verify, account] = await Promise.all([
      cfFetch(`/accounts/${accountId()}/tokens/verify`),
      cfFetch(`/accounts/${accountId()}`).catch(() => null),
    ])
    res.json({
      ok:      true,
      token:   verify.result,
      conta:   account?.result ?? null,
      account_id: accountId(),
      s3Credentials: {
        configurado: !!(process.env.CF_R2_ACCESS_KEY_ID && process.env.CF_R2_SECRET_ACCESS_KEY),
        bucket:      process.env.CF_R2_BUCKET || null,
      },
    })
  } catch (err) {
    // Se CF_API_TOKEN não está configurado, retornamos status controlado
    if (err.message.includes('não configurado')) {
      return res.json({ ok: false, erro: err.message })
    }
    next(err)
  }
})

// ── GET /zonas ──────────────────────────────────────────────────
router.get('/zonas', async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page  || '1')
    const limit = parseInt(req.query.limit || '20')
    const q     = req.query.q ? `&name=${encodeURIComponent(req.query.q)}` : ''

    const data = await cfFetch(
      `/zones?account.id=${accountId()}&page=${page}&per_page=${limit}&status=active${q}`
    )
    res.json({
      zonas:     data.result,
      total:     data.result_info?.total_count ?? data.result.length,
      pagina:    data.result_info?.page ?? page,
      totalPags: data.result_info?.total_pages ?? 1,
    })
  } catch (err) { next(err) }
})

// ── GET /zonas/:zoneId/dns ──────────────────────────────────────
router.get('/zonas/:zoneId/dns', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const page  = parseInt(req.query.page  || '1')
    const limit = parseInt(req.query.limit || '50')
    const tipo  = req.query.tipo ? `&type=${req.query.tipo}` : ''
    const q     = req.query.q    ? `&name=${encodeURIComponent(req.query.q)}` : ''

    const data = await cfFetch(
      `/zones/${zoneId}/dns_records?page=${page}&per_page=${limit}${tipo}${q}`
    )
    res.json({
      registros:  data.result,
      total:      data.result_info?.total_count ?? data.result.length,
      pagina:     data.result_info?.page ?? page,
      totalPags:  data.result_info?.total_pages ?? 1,
    })
  } catch (err) { next(err) }
})

// ── POST /zonas/:zoneId/dns ─────────────────────────────────────
router.post('/zonas/:zoneId/dns', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const { type, name, content, ttl = 1, proxied = false, priority } = req.body

    if (!type || !name || !content) {
      return res.status(400).json({ erro: 'Campos obrigatórios: type, name, content' })
    }

    const payload = { type: type.toUpperCase(), name, content, ttl, proxied }
    if (['MX', 'SRV', 'URI'].includes(type.toUpperCase()) && priority !== undefined) {
      payload.priority = Number(priority)
    }

    const data = await cfFetch(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body:   JSON.stringify(payload),
    })
    logger.info({ dns: data.result.id }, 'DNS record criado')
    res.status(201).json({ registro: data.result })
  } catch (err) { next(err) }
})

// ── PUT /zonas/:zoneId/dns/:recordId ────────────────────────────
router.put('/zonas/:zoneId/dns/:recordId', async (req, res, next) => {
  try {
    const { zoneId, recordId } = req.params
    const { type, name, content, ttl = 1, proxied = false, priority } = req.body

    if (!type || !name || !content) {
      return res.status(400).json({ erro: 'Campos obrigatórios: type, name, content' })
    }

    const payload = { type: type.toUpperCase(), name, content, ttl, proxied }
    if (['MX', 'SRV', 'URI'].includes(type.toUpperCase()) && priority !== undefined) {
      payload.priority = Number(priority)
    }

    const data = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'PUT',
      body:   JSON.stringify(payload),
    })
    res.json({ registro: data.result })
  } catch (err) { next(err) }
})

// ── DELETE /zonas/:zoneId/dns/:recordId ─────────────────────────
router.delete('/zonas/:zoneId/dns/:recordId', async (req, res, next) => {
  try {
    const { zoneId, recordId } = req.params
    await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' })
    logger.info({ recordId }, 'DNS record removido')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /zonas/:zoneId/analytics ───────────────────────────────
router.get('/zonas/:zoneId/analytics', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const horas = parseInt(req.query.horas || '24')
    const since = new Date(Date.now() - horas * 3600 * 1000).toISOString()
    const until = new Date().toISOString()

    const data = await cfFetch(
      `/zones/${zoneId}/analytics/dashboard?since=${since}&until=${until}&continuous=true`
    )
    res.json({ analytics: data.result })
  } catch (err) { next(err) }
})

// ── GET /zonas/:zoneId/pagerules ────────────────────────────────
router.get('/zonas/:zoneId/pagerules', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const data = await cfFetch(`/zones/${zoneId}/pagerules?status=active`)
    res.json({ pagerules: data.result })
  } catch (err) { next(err) }
})

// ── GET /zonas/:zoneId/firewall ─────────────────────────────────
router.get('/zonas/:zoneId/firewall', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const limit = Math.min(100, parseInt(req.query.limit || '50'))

    const data = await cfFetch(
      `/zones/${zoneId}/firewall/events?per_page=${limit}`
    )
    res.json({ eventos: data.result || [] })
  } catch (err) {
    // Firewall events pode não estar disponível em todos os planos
    if (err.message.includes('1001') || err.message.includes('not authorized')) {
      return res.json({ eventos: [], aviso: 'Requer plano Pro ou superior.' })
    }
    next(err)
  }
})

// ── GET /zonas/:zoneId/ssl ──────────────────────────────────────
router.get('/zonas/:zoneId/ssl', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const [ssl, certs] = await Promise.all([
      cfFetch(`/zones/${zoneId}/settings/ssl`),
      cfFetch(`/zones/${zoneId}/ssl/certificate_packs`).catch(() => ({ result: [] })),
    ])
    res.json({
      modo:  ssl.result,
      certs: certs.result,
    })
  } catch (err) { next(err) }
})

// ── POST /zonas/:zoneId/purge — Purga cache ─────────────────────
router.post('/zonas/:zoneId/purge', async (req, res, next) => {
  try {
    const { zoneId } = req.params
    const { tudo, urls } = req.body
    if (!tudo && (!Array.isArray(urls) || !urls.length)) {
      return res.status(400).json({ erro: 'Forneça tudo: true ou urls: ["https://..."]' })
    }
    const payload = tudo ? { purge_everything: true } : { files: urls }
    await cfFetch(`/zones/${zoneId}/purge_cache`, { method: 'POST', body: JSON.stringify(payload) })
    logger.info({ zoneId, tudo, urlCount: urls?.length }, 'Cache purgado')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /workers ────────────────────────────────────────────────
router.get('/workers', async (_req, res, next) => {
  try {
    const data = await cfFetch(`/accounts/${accountId()}/workers/scripts`)
    res.json({ workers: data.result || [] })
  } catch (err) {
    if (err.message.includes('not entitled') || err.message.includes('10007')) {
      return res.json({ workers: [], aviso: 'Workers não disponíveis nesta conta.' })
    }
    next(err)
  }
})

// ── POST /r2/buckets/:bucket/upload — Upload via S3 API ────────
router.post('/r2/buckets/:bucket/upload', uploadMem.single('file'), async (req, res, next) => {
  try {
    const { bucket } = req.params
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' })

    const accessKeyId     = process.env.CF_R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) {
      return res.status(500).json({ erro: 'CF_R2_ACCESS_KEY_ID e CF_R2_SECRET_ACCESS_KEY são obrigatórios.' })
    }

    const prefix = (req.body.prefix || '').replace(/^\//, '')
    const key    = prefix ? `${prefix}${req.file.originalname}` : req.file.originalname

    await r2S3Client().send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         key,
      Body:        req.file.buffer,
      ContentType: req.file.mimetype || 'application/octet-stream',
    }))

    logger.info({ bucket, key, size: req.file.size }, 'R2 objeto enviado via CF module')
    res.json({ ok: true, key, size: req.file.size })
  } catch (err) { next(err) }
})

export default router

// ═══════════════════════════════════════════════════════════════
// CLOUDFLARE R2 — Gerenciamento de buckets e objetos
//
// Rotas:
//   GET  /r2/buckets                        — lista buckets
//   POST /r2/buckets                        — cria bucket
//   DEL  /r2/buckets/:bucket               — deleta bucket
//   GET  /r2/buckets/:bucket/objects        — lista objetos (?prefix=&cursor=&limit=)
//   DEL  /r2/buckets/:bucket/objects        — deleta múltiplos objetos (body: keys[])
//   DEL  /r2/buckets/:bucket/objects/:key   — deleta um objeto
//   GET  /r2/usage                          — uso total da conta (bytes, objetos)
// ═══════════════════════════════════════════════════════════════

// ── GET /r2/buckets ────────────────────────────────────────────
router.get('/r2/buckets', async (_req, res, next) => {
  try {
    const data = await cfFetch(`/accounts/${accountId()}/r2/buckets?per_page=100`)
    res.json({ buckets: data.result?.buckets ?? data.result ?? [] })
  } catch (err) { next(err) }
})

// ── POST /r2/buckets ───────────────────────────────────────────
router.post('/r2/buckets', async (req, res, next) => {
  try {
    const { name, locationHint } = req.body
    if (!name?.trim()) return res.status(400).json({ erro: 'Nome do bucket é obrigatório.' })
    const payload = { name: name.trim() }
    if (locationHint) payload.locationHint = locationHint
    const data = await cfFetch(`/accounts/${accountId()}/r2/buckets`, {
      method: 'POST',
      body:   JSON.stringify(payload),
    })
    logger.info({ bucket: name }, 'R2 bucket criado')
    res.status(201).json({ bucket: data.result })
  } catch (err) { next(err) }
})

// ── DELETE /r2/buckets/:bucket ─────────────────────────────────
router.delete('/r2/buckets/:bucket', async (req, res, next) => {
  try {
    await cfFetch(`/accounts/${accountId()}/r2/buckets/${req.params.bucket}`, {
      method: 'DELETE',
    })
    logger.info({ bucket: req.params.bucket }, 'R2 bucket deletado')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /r2/buckets/:bucket/objects ────────────────────────────
router.get('/r2/buckets/:bucket/objects', async (req, res, next) => {
  try {
    const { bucket }  = req.params
    const limit  = Math.min(1000, parseInt(req.query.limit  || '250'))
    const prefix = req.query.prefix  || ''
    const cursor = req.query.cursor  || ''
    const delim  = req.query.delim   || ''    // '/' para navegação por pastas

    const params = new URLSearchParams({ per_page: String(limit) })
    if (prefix) params.set('prefix', prefix)
    if (cursor) params.set('cursor', cursor)
    if (delim)  params.set('delimiter', delim)

    const data = await cfFetch(
      `/accounts/${accountId()}/r2/buckets/${bucket}/objects?${params}`
    )
    res.json({
      objetos:      data.result?.objects      ?? [],
      prefixos:     data.result?.delimited_prefixes ?? [],
      truncated:    data.result?.truncated    ?? false,
      cursor:       data.result?.cursor       ?? null,
    })
  } catch (err) { next(err) }
})

// ── DELETE /r2/buckets/:bucket/objects  (lote) ─────────────────
router.delete('/r2/buckets/:bucket/objects', async (req, res, next) => {
  try {
    const { bucket } = req.params
    const { keys }   = req.body           // string[]
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ erro: 'Forneça um array "keys" com as chaves a deletar.' })
    }
    // CF API não tem delete em lote nativo — paralelizamos individualmente
    const resultados = await Promise.allSettled(
      keys.map(k =>
        cfFetch(`/accounts/${accountId()}/r2/buckets/${bucket}/objects/${encodeURIComponent(k)}`, {
          method: 'DELETE',
        })
      )
    )
    const erros = resultados
      .map((r, i) => r.status === 'rejected' ? `${keys[i]}: ${r.reason?.message}` : null)
      .filter(Boolean)

    logger.info({ bucket, total: keys.length, erros: erros.length }, 'R2 objetos deletados em lote')
    res.json({ ok: erros.length === 0, deletados: keys.length - erros.length, erros })
  } catch (err) { next(err) }
})

// ── DELETE /r2/buckets/:bucket/objects/:key ────────────────────
router.delete('/r2/buckets/:bucket/objects/:key(*)', async (req, res, next) => {
  try {
    const { bucket, key } = req.params
    await cfFetch(
      `/accounts/${accountId()}/r2/buckets/${bucket}/objects/${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    )
    logger.info({ bucket, key }, 'R2 objeto deletado')
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── GET /r2/usage ──────────────────────────────────────────────
router.get('/r2/usage', async (_req, res, next) => {
  try {
    // Busca métricas de todos os buckets em paralelo
    const bucketsData = await cfFetch(`/accounts/${accountId()}/r2/buckets?per_page=100`)
    const buckets     = bucketsData.result?.buckets ?? bucketsData.result ?? []

    const metricas = await Promise.allSettled(
      buckets.map(b =>
        cfFetch(`/accounts/${accountId()}/r2/buckets/${b.name}/usage`).catch(() => null)
      )
    )

    const detalhes = buckets.map((b, i) => {
      const m = metricas[i].status === 'fulfilled' ? metricas[i].value?.result : null
      return {
        nome:     b.name,
        criado:   b.creation_date,
        bytes:    m?.payload_size   ?? 0,
        objetos:  m?.object_count   ?? 0,
        uploads:  m?.upload_count   ?? 0,
      }
    })

    const totalBytes   = detalhes.reduce((s, d) => s + d.bytes,   0)
    const totalObjetos = detalhes.reduce((s, d) => s + d.objetos, 0)

    res.json({ buckets: detalhes, totalBytes, totalObjetos })
  } catch (err) { next(err) }
})
