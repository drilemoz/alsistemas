/**
 * rssSanitizer.js  — v2.1 (corrigido)
 * ─────────────────────────────────────
 * Utilitários de sanitização de conteúdo HTML vindo de feeds RSS.
 *
 * CORREÇÃO v2.1:
 *  - Removido `exclusiveFilter`: era código morto — sanitize-html só o invoca
 *    para tags presentes em allowedTags; script/style/iframe não estão na
 *    whitelist, portanto o callback nunca era chamado para eles.
 *  - Adicionado `nonTextTags` explícito: garante que o CONTEÚDO TEXTUAL de
 *    tags perigosas (script, style, noscript, template…) seja descartado,
 *    não apenas as tags em si. Sem isso, `<script>alert(1)</script>` poderia
 *    vazar como texto puro `alert(1)`.
 *  - Adicionado `disallowedTagsMode: 'discard'` explícito para deixar claro
 *    que tags fora da whitelist têm apenas o tag removido, preservando o
 *    texto filho (comportamento desejado para tags genéricas como <div class="x">).
 *
 * Responsabilidades:
 *  - Remover tags e atributos perigosos (XSS, injeção de script)
 *  - Normalizar links externos (target + rel)
 *  - Gerar excerpts em texto puro
 *  - Extrair a primeira imagem do conteúdo
 */
import sanitizeHtml from 'sanitize-html'

// ─── Whitelist de tags permitidas em artigos de notícia ─────────────────────

const ALLOWED_TAGS = [
  // Headings (h1 é convertido para h2 via transformTags)
  'h2', 'h3', 'h4', 'h5', 'h6',
  // Parágrafos e formatação inline
  'p', 'br', 'hr', 'span',
  'strong', 'em', 'b', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
  // Citações e código
  'blockquote', 'pre', 'code',
  // Listas
  'ul', 'ol', 'li',
  // Links e mídia
  'a', 'img', 'picture', 'source',
  // Agrupamento
  'figure', 'figcaption', 'div', 'section', 'article',
  // Tabelas
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
]

const ALLOWED_ATTRS = {
  'a':      ['href', 'title', 'rel', 'target'],
  'img':    ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
  'source': ['srcset', 'type', 'media'],
  'picture': [],
  'td':     ['colspan', 'rowspan', 'align'],
  'th':     ['colspan', 'rowspan', 'align', 'scope'],
  'table':  ['border', 'cellpadding', 'cellspacing'],
  'code':   ['class'],
  'pre':    ['class'],
  'span':   ['class'],
  'div':    ['class'],
  'blockquote': ['cite'],
}

// ─── Configuração principal do sanitize-html ─────────────────────────────────

const SANITIZE_OPTIONS = {
  allowedTags:       ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,

  // Apenas protocolos seguros em href e src
  allowedSchemes:    ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img:    ['http', 'https'],   // bloqueia data: e blob: em imagens
    source: ['http', 'https'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset'],

  // FIX: tags cujo CONTEÚDO TEXTUAL também deve ser descartado.
  // Para tags fora de allowedTags, sanitize-html remove a tag mas preserva
  // o texto por padrão. nonTextTags força o descarte completo (tag + texto).
  // Isso evita que `<script>alert(1)</script>` vire o texto `alert(1)`.
  nonTextTags: [
    'script', 'style', 'noscript',
    'template',       // web components — pode conter JS/CSS inline
    'textarea',       // evita preservar conteúdo de formulários
    'option',         // conteúdo de <select> não tem sentido editorial
    'head', 'title',  // alguns feeds incluem fragmentos HTML completos
  ],

  // FIX: explicita o comportamento padrão para tags não-whitelistadas:
  // remove a tag mas mantém o texto filho (correto para tags genéricas
  // como <div class="paywall"> que envolve conteúdo legítimo).
  disallowedTagsMode: 'discard',

  // ── Transformações por tag ───────────────────────────────────────────────
  transformTags: {
    /**
     * Links externos: força target="_blank" + rel="noopener noreferrer".
     * Links internos (começam com /) ou âncoras (#) ficam sem target.
     */
    a: (tagName, attribs) => {
      const href = attribs.href || ''
      const isExternal = /^https?:\/\//i.test(href)
      return {
        tagName: 'a',
        attribs: {
          href,
          ...(attribs.title && { title: attribs.title }),
          rel: 'noopener noreferrer',
          ...(isExternal && { target: '_blank' }),
        },
      }
    },

    /**
     * Imagens: remove data URI (pode conter payloads XSS ou rastreadores),
     * adiciona loading="lazy" por padrão e preserva alt.
     */
    img: (tagName, attribs) => {
      const src = attribs.src || ''
      if (src.startsWith('data:') || src.startsWith('blob:')) {
        return { tagName: 'span', attribs: {} }
      }
      return {
        tagName: 'img',
        attribs: {
          src,
          alt:      attribs.alt     || '',
          loading:  attribs.loading || 'lazy',
          decoding: 'async',
          ...(attribs.width  && { width:  attribs.width }),
          ...(attribs.height && { height: attribs.height }),
        },
      }
    },

    // h1 no conteúdo vira h2 (h1 é reservado ao título da página)
    h1: () => ({ tagName: 'h2', attribs: {} }),
  },
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Sanitiza HTML de conteúdo editorial (artigos RSS).
 *
 * @param {string} html  HTML bruto do feed
 * @returns {string}     HTML limpo e seguro
 */
export function sanitizeContent(html = '') {
  if (!html?.trim()) return ''
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}

/**
 * Converte HTML para texto puro (sem nenhuma tag).
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html = '') {
  if (!html?.trim()) return ''
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'noscript', 'template', 'textarea', 'option'],
  })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Gera um excerpt de no máximo `maxLen` caracteres a partir de HTML,
 * cortando sempre em limite de palavra.
 *
 * @param {string} html
 * @param {number} maxLen  (default: 300)
 * @returns {string}
 */
export function makeExcerpt(html = '', maxLen = 300) {
  const text = htmlToText(html)
  if (!text) return ''
  if (text.length <= maxLen) return text
  const cut = text.substring(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.substring(0, lastSpace) : cut) + '…'
}

/**
 * Extrai a URL da primeira imagem encontrada no HTML.
 * Ignora imagens com data URI.
 *
 * @param {string} html
 * @returns {string|null}
 */
export function extractFirstImage(html = '') {
  if (!html) return null
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (!match) return null
  const src = match[1]
  return src.startsWith('data:') || src.startsWith('blob:') ? null : src
}
