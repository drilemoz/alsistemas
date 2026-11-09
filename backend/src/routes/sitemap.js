/**
 * #16 — Sitemap.xml dinâmico com configuração via admin.
 *
 * Gera um sitemap com todas as notícias publicadas + homepage.
 * Parâmetros (changefreq, priority, limite, TTL de cache) são lidos
 * do modelo ConfiguracaoHome para que o admin possa ajustá-los sem
 * redeploy — chaves: sitemap_changefreq, sitemap_priority,
 * sitemap_limite, sitemap_cache_min.
 */
import { Router } from 'express'
import Noticia from '../models/Noticia.js'
import ConfiguracaoHome from '../models/ConfiguracaoHome.js'
import { cacheGet, cacheSet } from '../utils/cache.js'

const router = Router()
const CACHE_KEY = 'sitemap_xml'

// ─── Helpers ─────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')
}

// ─── Carregar config do banco (com fallbacks seguros) ─────────

async function carregarConfig() {
  try {
    const chaves = ['sitemap_changefreq', 'sitemap_priority', 'sitemap_limite', 'sitemap_cache_min']
    const docs   = await ConfiguracaoHome.find({ chave: { $in: chaves } }).lean()
    const mapa   = docs.reduce((acc, d) => ({ ...acc, [d.chave]: d.valor }), {})

    const FREQS_VALIDOS = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']
    const changefreq = FREQS_VALIDOS.includes(mapa.sitemap_changefreq)
      ? mapa.sitemap_changefreq
      : 'weekly'

    const priority = Math.min(1.0, Math.max(0.1, parseFloat(mapa.sitemap_priority) || 0.7))
    const limite   = Math.min(50000, Math.max(10, parseInt(mapa.sitemap_limite, 10) || 1000))
    const cacheMin = Math.min(1440, Math.max(1, parseInt(mapa.sitemap_cache_min, 10) || 10))

    return { changefreq, priority, limite, cacheTtl: cacheMin * 60 }
  } catch {
    return { changefreq: 'weekly', priority: 0.7, limite: 1000, cacheTtl: 600 }
  }
}

// ─── Rota GET /sitemap.xml ────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const cached = await cacheGet(CACHE_KEY)
    if (cached) {
      res.set('Content-Type', 'application/xml; charset=utf-8')
      res.set('X-Sitemap-Cache', 'HIT')
      return res.send(cached)
    }

    const cfg     = await carregarConfig()
    const baseUrl = (process.env.FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')

    const noticias = await Noticia
      .find({}, 'criado_em atualizado_em')
      .sort({ criado_em: -1 })
      .limit(cfg.limite)
      .lean()

    const linhasHome = urlEntry({
      loc        : baseUrl,
      changefreq : 'daily',
      priority   : '1.0',
    })

    const linhasNoticias = noticias.map(n => {
      const data = n.atualizado_em || n.criado_em
      return urlEntry({
        loc        : `${baseUrl}/noticia/${n._id}`,
        lastmod    : data ? data.toISOString().split('T')[0] : undefined,
        changefreq : cfg.changefreq,
        priority   : cfg.priority.toFixed(1),
      })
    })

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      linhasHome,
      ...linhasNoticias,
      '</urlset>',
    ].join('\n')

    await cacheSet(CACHE_KEY, xml, cfg.cacheTtl)

    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('X-Sitemap-Cache', 'MISS')
    res.set('X-Sitemap-Count', String(noticias.length + 1))
    res.send(xml)
  } catch (err) { next(err) }
})

export default router
