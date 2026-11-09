/**
 * #17 — RSS Feed das últimas notícias.
 * Retorna as 50 notícias mais recentes em formato RSS 2.0 válido.
 * Resposta cacheada por 5 minutos.
 */
import { Router } from 'express'
import Noticia from '../models/Noticia.js'
import { cacheGet, cacheSet } from '../utils/cache.js'

const router = Router()
const CACHE_KEY = 'rss_feed'
const CACHE_TTL = 300 // 5 minutos

router.get('/', async (_req, res, next) => {
  try {
    const cached = await cacheGet(CACHE_KEY)
    if (cached) {
      res.set('Content-Type', 'application/rss+xml; charset=utf-8')
      return res.send(cached)
    }

    const baseUrl  = process.env.FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173'
    const siteName = 'AL Sistemas'
    const siteDesc = 'As últimas notícias de Iguatama e região'

    const noticias = await Noticia
      .find({}, 'titulo conteudo imagem_url criado_em atualizado_em categoria_id')
      .populate('categoria_id', 'nome')
      .sort({ criado_em: -1 })
      .limit(50)
      .lean()

    const items = noticias.map(n => {
      const link    = `${baseUrl}/noticia/${n._id}`
      const pubDate = new Date(n.criado_em).toUTCString()
      const desc    = stripHtml(n.conteudo || '').slice(0, 300)
      const cat     = n.categoria_id?.nome || ''

      return `
    <item>
      <title>${escapeXml(n.titulo || '')}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(desc)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      ${cat ? `<category>${escapeXml(cat)}</category>` : ''}
      ${n.imagem_url ? `<enclosure url="${escapeXml(n.imagem_url)}" type="image/jpeg"/>` : ''}
    </item>`
    }).join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl + '/rss')}" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`

    await cacheSet(CACHE_KEY, xml, CACHE_TTL)
    res.set('Content-Type', 'application/rss+xml; charset=utf-8')
    res.send(xml)
  } catch (err) { next(err) }
})

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export default router
