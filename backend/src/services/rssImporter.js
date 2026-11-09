/**
 * rssImporter.js  — v2.2
 * ─────────────────────────────────────
 * Serviço central de importação de notícias via RSS.
 *
 * CORREÇÕES v2.1:
 *  1. parseFeed: wrapping de erro com mensagem clara + fallback via fetch nativo
 *     quando rss-parser é bloqueado pelo servidor remoto.
 *  2. importarTodasFontes: respeita auto_update e intervalo_min por fonte,
 *     comportamento antes feito pelo rssScheduler.js (agora descontinuado).
 *  3. Erros de fetch remoto são distinguidos de erros de configuração local.
 *
 * CORREÇÕES v2.2:
 *  4. fetchFeedXmlFallback: remove BOM UTF-8 (\uFEFF) e whitespace antes do XML.
 *     Corrige "Non-whitespace before first tag. Line: 0, Column: 1" em feeds de
 *     servidores Windows/IIS e geradores PHP legados.
 *  5. parseFeed fallback: em vez de re-lançar o erro original, agora tenta
 *     parser.parseString(xml) com o XML já limpo do BOM, permitindo importar
 *     feeds que o rss-parser recusava por esse motivo.
 *
 * Estratégia de deduplicação:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Índice único no campo `guid` do model Noticia                  │
 *   │  + insertMany({ ordered: false })                               │
 *   │  O MongoDB rejeita silenciosamente os docs já existentes        │
 *   └─────────────────────────────────────────────────────────────────┘
 */
import Parser from 'rss-parser'
import slugify from 'slugify'
import crypto  from 'node:crypto'

import RssFonte from '../models/RssFonte.js'
import Noticia  from '../models/Noticia.js'
import Fonte    from '../models/Fonte.js'
import { sanitizeContent, makeExcerpt, extractFirstImage } from './rssSanitizer.js'
import { logger } from '../utils/logger.js'

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (compatible; ALSistemas/2.1 RSS Importer; +https://alsistemas.com.br)'

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

// ─── Parser RSS (rss-parser) ─────────────────────────────────────────────────

const parser = new Parser({
  timeout: 15_000,
  headers: FETCH_HEADERS,
  requestOptions: {
    // Segue redirecionamentos automaticamente
    rejectUnauthorized: false, // tolera SSL self-signed em fontes locais
  },
  customFields: {
    feed: [],
    item: [
      ['media:content',   'mediaContent',   { keepArray: false }],
      ['media:thumbnail', 'mediaThumbnail',  { keepArray: false }],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
      ['dc:date',    'dcDate'],
    ],
  },
})

// ─── Helpers internos ─────────────────────────────────────────────────────────

function buildGuid(item) {
  const raw = (item.guid || item.id || item.link || item.title || '').trim()
  if (!raw) return null
  return crypto.createHash('md5').update(raw).digest('hex')
}

function buildSlug(title = '') {
  const base = slugify(title, {
    lower:  true,
    strict: true,
    locale: 'pt',
    trim:   true,
  }).substring(0, 80)

  const suffix = Date.now().toString(36)
  return `${base || 'noticia'}-${suffix}`
}

function extractBestImage(item, rawContent = '') {
  return (
    item.enclosure?.url                          ||
    item.mediaContent?.$?.url                    ||
    item['media:content']?.$?.url                ||
    item.mediaThumbnail?.$?.url                  ||
    item['media:thumbnail']?.$?.url              ||
    extractFirstImage(rawContent)                ||
    extractFirstImage(item.contentSnippet || item.summary || '') ||
    null
  )
}

function parsePublishedAt(item) {
  const raw = item.pubDate || item.isoDate || item.dcDate || ''
  if (!raw) return new Date()
  const d = new Date(raw)
  return isNaN(d.getTime()) ? new Date() : d
}

function buildDoc(item, { fonteRssId, fonteId, categoriaId }) {
  const guid = buildGuid(item)
  if (!guid) return null

  const titulo = item.title?.trim()
  if (!titulo) return null

  const rawContent =
    item.contentEncoded              ||
    item['content:encoded']          ||
    item.content                     ||
    item.summary                     ||
    item.description                 ||
    ''

  const conteudoSanitizado = sanitizeContent(rawContent)
  const resumo = makeExcerpt(conteudoSanitizado || item.contentSnippet || '', 300)
  const imagem = extractBestImage(item, rawContent)

  return {
    guid,
    titulo,
    slug:        buildSlug(titulo),
    conteudo:    conteudoSanitizado || resumo || '(conteúdo não disponível)',
    resumo:      resumo || '',
    imagem_url:  imagem,
    url_original: item.link?.trim() || null,
    publicado_em: parsePublishedAt(item),
    fonte_id:    fonteId,
    categoria_id: categoriaId ?? null,
    rss_fonte_id: fonteRssId,
    status:    'rascunho',
    importado: true,
    autor:     item.creator || item.author || null,
  }
}

// ─── FIX: Fallback fetch para feeds que bloqueiam rss-parser ─────────────────

/**
 * Tenta buscar o feed via fetch nativo (fallback quando rss-parser é bloqueado).
 * Retorna o XML bruto como string ou lança erro.
 */
async function fetchFeedXmlFallback(url) {
  const res = await fetch(url, {
    headers: {
      ...FETCH_HEADERS,
      // Header extra que alguns servidores exigem
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    // FIX: mensagem clara distinguindo erro remoto de erro local
    const detail = res.status === 404
      ? 'Feed não encontrado (HTTP 404) — verifique se a URL do feed ainda é válida'
      : res.status === 403
        ? 'Acesso negado pelo servidor do feed (HTTP 403) — o site pode bloquear importadores'
        : res.status === 401
          ? 'Feed requer autenticação (HTTP 401)'
          : `Servidor do feed retornou HTTP ${res.status}`
    throw new Error(detail)
  }

  // FIX v2.2: Remove BOM UTF-8 (\uFEFF) e qualquer whitespace antes do primeiro '<'.
  // Isso resolve "Non-whitespace before first tag" — feeds que emitem BOM ou espaços
  // antes do prólogo XML, algo comum em servidores Windows/IIS e geradores PHP legados.
  let text = await res.text()
  text = text.replace(/^\uFEFF/, '').trimStart()

  if (!text.startsWith('<')) {
    throw new Error('Resposta do feed não é um XML válido — verifique se a URL é um feed RSS ou Atom')
  }
  return text
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Faz o parse de um feed RSS/Atom e retorna os itens brutos.
 *
 * FIX v2.1: Wrapping de erro com mensagem amigável + fallback via fetch nativo.
 * O fallback é acionado quando rss-parser falha (ex.: o servidor remoto bloqueia
 * o User-Agent do rss-parser mas aceita um User-Agent de navegador).
 *
 * @param {string} url
 * @returns {Promise<Object[]>}
 */
export async function parseFeed(url) {
  // Tentativa 1: rss-parser (suporte completo a RSS 2.0 + Atom + namespaces)
  try {
    const feed = await parser.parseURL(url)
    return feed.items ?? []
  } catch (errPrimario) {
    const msg = errPrimario.message || ''

    // FIX: identifica se o erro é HTTP do servidor remoto (não de configuração)
    const isHttpError = /status code \d{3}/i.test(msg)
    const isNetworkError = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg)

    if (isHttpError) {
      // Reformata o erro para ser mais claro ao usuário
      const statusMatch = msg.match(/(\d{3})/)
      const httpStatus  = statusMatch ? parseInt(statusMatch[1]) : 0

      if (httpStatus === 404) {
        throw new Error('Feed não encontrado (HTTP 404) — verifique se a URL do feed ainda é válida')
      }
      if (httpStatus === 403) {
        // 403 pode ser contorno via User-Agent de navegador — tenta fallback
        logger.warn({ url, err: msg }, '⚠️  rss-parser recebeu 403 — tentando fallback via fetch')
      } else {
        throw new Error(`Servidor do feed retornou HTTP ${httpStatus}`)
      }
    }

    if (isNetworkError) {
      throw new Error(`Não foi possível conectar ao feed: ${msg}`)
    }

    // Tentativa 2 (fallback): fetch nativo com User-Agent de navegador + stripagem de BOM.
    // FIX v2.2: Antes apenas validava o acesso HTTP e re-lançava o erro original.
    // Agora busca o XML, remove o BOM/whitespace e tenta parseString() diretamente.
    // Isso corrige feeds com BOM UTF-8 ou espaços antes do prólogo XML que causam
    // "Non-whitespace before first tag. Line: 0, Column: 1".
    logger.warn({ url, err: msg }, '⚠️  rss-parser falhou — tentando fallback com fetch nativo + BOM strip')
    try {
      const xml = await fetchFeedXmlFallback(url)  // já remove BOM e valida que começa com '<'

      // Tenta parsear o XML limpo diretamente (sem re-fetch pelo rss-parser)
      try {
        const feedFallback = await parser.parseString(xml)
        logger.info({ url }, '✅ Fallback com parseString bem-sucedido após remoção de BOM')
        return feedFallback.items ?? []
      } catch (parseErr) {
        // XML acessível mas estruturalmente inválido para RSS/Atom
        throw new Error(
          `Feed acessível, mas não pôde ser interpretado: ${parseErr.message}. Verifique se é RSS.`
        )
      }
    } catch (errFallback) {
      // Fallback de fetch também falhou (HTTP error, sem conectividade, XML inválido)
      const finalMsg = errFallback.message.startsWith('Feed')
        ? errFallback.message
        : `Falha ao importar feed: ${errPrimario.message}`
      throw new Error(finalMsg)
    }
  }
}

/**
 * Importa notícias de uma única fonte RSS e persiste no banco.
 *
 * @param {mongoose.Document} rssFonte
 * @param {Object}  [opts]
 * @param {string}  [opts.categoria_id]
 * @returns {Promise<{ importadas, ignoradas, erros, total }>}
 */
export async function importarFonte(rssFonte, opts = {}) {
  const ctx = { fonte: rssFonte.nome }

  // ── 1. Resolve (ou cria) o documento Fonte correspondente ──────────────────
  let fonteDoc = await Fonte.findOne({ nome: rssFonte.nome })
  if (!fonteDoc) {
    fonteDoc = await Fonte.create({ nome: rssFonte.nome, url: rssFonte.url ?? null })
    logger.info({ ...ctx, fonteId: fonteDoc._id }, '🆕 Fonte criada automaticamente')
  }

  // ── 2. Parse do feed ───────────────────────────────────────────────────────
  let rawItems
  try {
    rawItems = await parseFeed(rssFonte.url)
  } catch (err) {
    logger.error({ ...ctx, err: err.message }, '❌ Falha ao buscar/parsear feed')
    throw err
  }

  const max   = Math.min(Number(rssFonte.max_items) || 10, rawItems.length)
  const slice = rawItems.slice(0, max)
  logger.debug({ ...ctx, total: rawItems.length, processando: slice.length }, '📥 Feed obtido')

  // ── 3. Conversão de itens → documentos ────────────────────────────────────
  const docs              = []
  const errosConversao    = []

  for (const item of slice) {
    try {
      const doc = buildDoc(item, {
        fonteRssId:  rssFonte._id,
        fonteId:     fonteDoc._id,
        categoriaId: opts.categoria_id ?? rssFonte.categoria_id ?? null,
      })
      if (doc) {
        docs.push(doc)
      } else {
        errosConversao.push({
          item: item?.title ?? '(sem título)',
          motivo: 'GUID ou título ausente',
        })
      }
    } catch (err) {
      errosConversao.push({ item: item?.title ?? '(sem título)', motivo: err.message })
      logger.warn({ ...ctx, item: item?.title, err: err.message }, '⚠️ Erro ao converter item')
    }
  }

  if (!docs.length) {
    logger.warn({ ...ctx, erros: errosConversao.length }, '⚠️ Nenhum documento válido para inserir')
    return { importadas: 0, ignoradas: slice.length, erros: errosConversao, total: slice.length }
  }

  // ── 4. Bulk insert com tolerância a duplicatas ─────────────────────────────
  let importadas  = 0
  let ignoradas   = errosConversao.length
  const errosBulk = []

  try {
    const result = await Noticia.insertMany(docs, { ordered: false })
    importadas = result.length
    ignoradas += docs.length - result.length
  } catch (err) {
    const isDuplicateOrBulk =
      err.name === 'BulkWriteError'      ||
      err.name === 'MongoBulkWriteError' ||
      err.code  === 11000

    if (!isDuplicateOrBulk) {
      logger.error({ ...ctx, err: err.message }, '❌ Erro inesperado no bulk insert')
      throw err
    }

    importadas =
      err.insertedDocs?.length ??
      err.result?.nInserted    ??
      0

    const writeErrors =
      err.writeErrors                              ??
      err.result?.getWriteErrors?.()              ??
      []

    for (const we of writeErrors) {
      const code  = we.code ?? we.err?.code
      const errmsg = we.errmsg ?? we.err?.errmsg ?? ''
      if (code === 11000) {
        ignoradas++
      } else {
        errosBulk.push({ code, motivo: errmsg.substring(0, 200) })
        logger.warn({ ...ctx, code, errmsg }, '⚠️ Erro de escrita não-duplicata no bulk')
      }
    }
  }

  // ── 5. Atualiza estatísticas da fonte RSS ──────────────────────────────────
  await RssFonte.findByIdAndUpdate(rssFonte._id, {
    ultima_importacao: new Date(),
    $inc: { total_importadas: importadas },
  })

  const todosErros = [...errosConversao, ...errosBulk]
  logger.info(
    { ...ctx, importadas, ignoradas, erros: todosErros.length },
    '📰 Feed importado com sucesso'
  )

  return { importadas, ignoradas, erros: todosErros, total: slice.length }
}

/**
 * Importa todas as fontes RSS ativas em paralelo controlado.
 *
 * FIX v2.1: Respeita auto_update e intervalo_min por fonte — comportamento
 * antes implementado pelo rssScheduler.js (agora descontinuado). Isso garante
 * que fontes configuradas com auto_update=false NÃO sejam importadas pelo
 * scheduler automático, apenas pela importação manual do admin.
 *
 * @param {number}  [concorrencia=3]
 * @param {boolean} [respeitarIntervalo=false]
 *   Se true (uso pelo scheduler), respeita intervalo_min e auto_update por fonte.
 *   Se false (importação manual via admin), importa todas as fontes ativas.
 * @returns {Promise<Array>}
 */
export async function importarTodasFontes(concorrencia = 3, respeitarIntervalo = false) {
  // FIX: quando chamado pelo scheduler automático, filtra fontes com auto_update
  const query = respeitarIntervalo
    ? { ativa: true, auto_update: true }
    : { ativa: true }

  const fontes = await RssFonte.find(query).lean()

  if (!fontes.length) {
    logger.info('📭 Nenhuma fonte RSS ativa encontrada')
    return []
  }

  // FIX: quando chamado pelo scheduler, filtra fontes cujo intervalo ainda não venceu
  const agora = Date.now()
  const fontesParaImportar = respeitarIntervalo
    ? fontes.filter(f => {
        const ultimaMs    = f.ultima_importacao ? new Date(f.ultima_importacao).getTime() : 0
        const intervaloMs = (f.intervalo_min || 60) * 60 * 1_000
        return agora - ultimaMs >= intervaloMs
      })
    : fontes

  if (!fontesParaImportar.length) {
    logger.info('⏳ Nenhuma fonte RSS com intervalo vencido neste ciclo')
    return []
  }

  logger.info({ total: fontesParaImportar.length, concorrencia }, '🚀 Iniciando importação em massa')

  const resultados = []

  for (let i = 0; i < fontesParaImportar.length; i += concorrencia) {
    const lote = fontesParaImportar.slice(i, i + concorrencia)

    const loteResultados = await Promise.all(
      lote.map(async fonte => {
        try {
          const r = await importarFonte(fonte)
          return { fonte: fonte.nome, ...r, erro: null }
        } catch (err) {
          return {
            fonte:      fonte.nome,
            importadas: 0,
            ignoradas:  0,
            erros:      [],
            total:      0,
            erro:       err.message,
          }
        }
      })
    )

    resultados.push(...loteResultados)
  }

  const totais = resultados.reduce(
    (acc, r) => ({
      importadas:    acc.importadas    + (r.importadas    ?? 0),
      ignoradas:     acc.ignoradas     + (r.ignoradas     ?? 0),
      fontesComErro: acc.fontesComErro + (r.erro ? 1 : 0),
    }),
    { importadas: 0, ignoradas: 0, fontesComErro: 0 }
  )

  logger.info({ ...totais, fontes: fontesParaImportar.length }, '✅ Importação em massa concluída')
  return resultados
}
