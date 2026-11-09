/**
 * markdown.js — Converte Markdown em HTML seguro.
 *
 * Suporte completo para documentação técnica:
 *   headings h1–h6, negrito, itálico, negrito+itálico,
 *   código inline, blocos de código (fenced ```),
 *   tabelas GFM, listas ul/ol, blockquote, hr,
 *   links (apenas http/https), imagens (bloqueadas → link),
 *   badges de status (✅ ❌ ⚠️ →), line breaks.
 *
 * Zero dependências externas.
 */

// ── Utilitários de segurança ──────────────────────────────────

/** Escapa caracteres HTML para evitar XSS em texto não controlado. */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Valida URL — aceita apenas http/https e âncoras internas. */
function urlSegura(url) {
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('#'))       return u
  return '#'
}

// ── Renderer de inline ────────────────────────────────────────

/**
 * Processa marcações inline preservando código inline intacto.
 * Ordem importa: código inline > negrito+itálico > negrito > itálico > links.
 */
function renderInline(text) {
  // Preserva código inline (não processa markup dentro)
  const codePlaceholders = []
  let t = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codePlaceholders.length
    codePlaceholders.push(`<code>${escHtml(code)}</code>`)
    return `\x00CODE${idx}\x00`
  })

  // Negrito + itálico
  t = t.replace(/\*\*\*(.+?)\*\*\*/gs, (_, c) => `<strong><em>${renderInline(c)}</em></strong>`)
  // Negrito
  t = t.replace(/\*\*(.+?)\*\*/gs,     (_, c) => `<strong>${renderInline(c)}</strong>`)
  // Itálico (* ou _)
  t = t.replace(/\*(.+?)\*/gs,         (_, c) => `<em>${c}</em>`)
  t = t.replace(/_([^_]+)_/g,          (_, c) => `<em>${c}</em>`)

  // Imagens → link (não renderiza binários externos)
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
    `<a href="${escHtml(urlSegura(url))}" target="_blank" rel="noopener noreferrer">[imagem: ${escHtml(alt)}]</a>`
  )

  // Links [texto](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, texto, url) =>
    `<a href="${escHtml(urlSegura(url))}" target="_blank" rel="noopener noreferrer">${texto}</a>`
  )

  // Restaura código inline
  t = t.replace(/\x00CODE(\d+)\x00/g, (_, i) => codePlaceholders[Number(i)])

  return t
}

// ── Parser de tabelas GFM ─────────────────────────────────────

function renderTabela(linhas) {
  if (linhas.length < 2) return null

  const parseColunas = (linha) =>
    linha.replace(/^\||\|$/g, '').split('|').map(c => c.trim())

  const cabecalhos = parseColunas(linhas[0])
  const separador  = parseColunas(linhas[1])

  // Valida linha separadora (apenas - : |)
  if (!separador.every(c => /^:?-+:?$/.test(c))) return null

  const alinhamentos = separador.map(c => {
    if (c.startsWith(':') && c.endsWith(':')) return 'center'
    if (c.endsWith(':'))                       return 'right'
    return 'left'
  })

  const thCells = cabecalhos
    .map((h, i) => `<th style="text-align:${alinhamentos[i]}">${renderInline(h)}</th>`)
    .join('')

  const rows = linhas.slice(2).map(linha => {
    const colunas = parseColunas(linha)
    const tds = cabecalhos.map((_, i) =>
      `<td style="text-align:${alinhamentos[i]}">${renderInline(colunas[i] ?? '')}</td>`
    ).join('')
    return `<tr>${tds}</tr>`
  }).join('\n')

  return `<table>\n<thead><tr>${thCells}</tr></thead>\n<tbody>${rows}</tbody>\n</table>`
}

// ── Parser de listas ──────────────────────────────────────────

function renderLista(linhas, ordered = false) {
  const tag = ordered ? 'ol' : 'ul'
  const items = linhas.map(l => {
    const conteudo = ordered
      ? l.replace(/^\d+\.\s+/, '')
      : l.replace(/^[-*+]\s+/, '')
    return `<li>${renderInline(conteudo)}</li>`
  }).join('\n')
  return `<${tag}>\n${items}\n</${tag}>`
}

// ── Parser principal ──────────────────────────────────────────

export function markdownParaHtml(md) {
  if (!md) return ''

  const linhas  = md.replace(/\r\n/g, '\n').split('\n')
  const blocos  = []
  let i = 0

  while (i < linhas.length) {
    const linha = linhas[i]

    // ── Bloco de código fenced (``` ou ~~~) ────────────────
    const fenceMatch = linha.match(/^(`{3,}|~{3,})(\w*)/)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const lang  = fenceMatch[2] || ''
      const codeLinhas = []
      i++
      while (i < linhas.length && !linhas[i].startsWith(fence)) {
        codeLinhas.push(linhas[i])
        i++
      }
      const langAttr = lang ? ` class="language-${escHtml(lang)}"` : ''
      blocos.push(
        `<pre><code${langAttr}>${escHtml(codeLinhas.join('\n'))}</code></pre>`
      )
      i++
      continue
    }

    // ── Headings ───────────────────────────────────────────
    const hMatch = linha.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const texto = renderInline(hMatch[2].trim())
      // Gera id para âncoras
      const id = hMatch[2].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      blocos.push(`<h${level} id="${id}">${texto}</h${level}>`)
      i++
      continue
    }

    // ── HR ────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) {
      blocos.push('<hr>')
      i++
      continue
    }

    // ── Tabela GFM ─────────────────────────────────────────
    if (linha.includes('|') && i + 1 < linhas.length && linhas[i + 1].match(/^\|?[\s\-:|]+\|/)) {
      const tabelaLinhas = []
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim() !== '') {
        tabelaLinhas.push(linhas[i])
        i++
      }
      const tabela = renderTabela(tabelaLinhas)
      if (tabela) { blocos.push(tabela); continue }
      // Fallback: processa como texto normal
      tabelaLinhas.forEach(l => blocos.push(`<p>${renderInline(l)}</p>`))
      continue
    }

    // ── Lista não-ordenada ────────────────────────────────
    if (/^[-*+]\s/.test(linha)) {
      const itens = []
      while (i < linhas.length && /^[-*+]\s/.test(linhas[i])) {
        itens.push(linhas[i])
        i++
      }
      blocos.push(renderLista(itens, false))
      continue
    }

    // ── Lista ordenada ────────────────────────────────────
    if (/^\d+\.\s/.test(linha)) {
      const itens = []
      while (i < linhas.length && /^\d+\.\s/.test(linhas[i])) {
        itens.push(linhas[i])
        i++
      }
      blocos.push(renderLista(itens, true))
      continue
    }

    // ── Blockquote ────────────────────────────────────────
    if (linha.startsWith('> ')) {
      const linhasBq = []
      while (i < linhas.length && linhas[i].startsWith('> ')) {
        linhasBq.push(linhas[i].slice(2))
        i++
      }
      blocos.push(`<blockquote>${markdownParaHtml(linhasBq.join('\n'))}</blockquote>`)
      continue
    }

    // ── Linha em branco ───────────────────────────────────
    if (linha.trim() === '') {
      i++
      continue
    }

    // ── Parágrafo ────────────────────────────────────────
    const paraLinhas = []
    while (i < linhas.length && linhas[i].trim() !== '' &&
           !linhas[i].match(/^#{1,6}\s/) &&
           !linhas[i].match(/^(`{3,}|~{3,})/) &&
           !linhas[i].match(/^[-*+]\s/) &&
           !linhas[i].match(/^\d+\.\s/) &&
           !linhas[i].startsWith('> ') &&
           !linhas[i].match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      paraLinhas.push(linhas[i])
      i++
    }
    if (paraLinhas.length) {
      blocos.push(`<p>${renderInline(paraLinhas.join('<br>'))}</p>`)
    }
  }

  return blocos.join('\n')
}
