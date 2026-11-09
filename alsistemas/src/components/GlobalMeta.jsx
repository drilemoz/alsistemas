import { useEffect, useState } from 'react'
import { configuracoesService } from '../services/api'

export default function GlobalMeta() {
  const [cfg, setCfg] = useState({})

  useEffect(() => {
    configuracoesService.listar().then(setCfg).catch(() => {})
  }, [])

  useEffect(() => {
    const titulo      = cfg.site_titulo       || 'AL Sistemas'
    const descricao   = cfg.site_descricao    || 'Seu portal de notícias, curiosidades e histórias sobre Iguatama.'
    const imagem      = cfg.site_imagem       || 'https://images.unsplash.com/photo-1598395927056-8d895e701c3b?w=1200&q=80'
    const keywords    = cfg.site_keywords     || 'Iguatama, notícias, portal, cidade'
    const author      = cfg.site_author       || 'AL Sistemas'
    const twitterCard = cfg.site_twitter_card || 'summary_large_image'
    const twitterSite = cfg.site_twitter_site || ''
    const robots      = cfg.site_robots       || 'index, follow'
    const favicon     = cfg.site_favicon      || ''
    const gaId        = cfg.site_ga_id        || ''
    const gscCode     = cfg.site_gsc_verification || ''

    // ── <title> ─────────────────────────────────────────────
    document.title = titulo

    // ── Auxiliar para meta tags ──────────────────────────────
    const setMeta = (name, content, isProp = false) => {
      if (!content) return
      const attr = isProp ? 'property' : 'name'
      let el = document.querySelector(`meta[${attr}="${name}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }

    // ── Meta básicas ────────────────────────────────────────
    setMeta('description', descricao)
    setMeta('keywords', keywords)
    setMeta('author', author)
    setMeta('robots', robots)

    // ── Open Graph ──────────────────────────────────────────
    setMeta('og:title',       titulo,                 true)
    setMeta('og:description', descricao,              true)
    setMeta('og:image',       imagem,                 true)
    setMeta('og:url',         window.location.origin, true)
    setMeta('og:type',        'website',              true)
    setMeta('og:site_name',   titulo,                 true)

    // ── Twitter Card ────────────────────────────────────────
    setMeta('twitter:card',        twitterCard)
    setMeta('twitter:title',       titulo)
    setMeta('twitter:description', descricao)
    setMeta('twitter:image',       imagem)
    if (twitterSite) setMeta('twitter:site', twitterSite)

    // ── Google Search Console ───────────────────────────────
    if (gscCode) {
      let gscEl = document.querySelector('meta[name="google-site-verification"]')
      if (!gscEl) {
        gscEl = document.createElement('meta')
        gscEl.setAttribute('name', 'google-site-verification')
        document.head.appendChild(gscEl)
      }
      gscEl.setAttribute('content', gscCode)
    }

    // ── Favicon dinâmico ────────────────────────────────────
    if (favicon) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = favicon
    }

    // ── Google Analytics 4 ──────────────────────────────────
    if (gaId) {
      if (!document.getElementById('ga4-script')) {
        const scriptSrc   = document.createElement('script')
        scriptSrc.id      = 'ga4-script'
        scriptSrc.async   = true
        scriptSrc.src     = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
        document.head.appendChild(scriptSrc)

        const scriptInit       = document.createElement('script')
        scriptInit.id          = 'ga4-init'
        scriptInit.textContent = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}');
        `
        document.head.appendChild(scriptInit)
      } else if (window.gtag) {
        window.gtag('config', gaId)
      }
    }
  }, [cfg])

  return null
}