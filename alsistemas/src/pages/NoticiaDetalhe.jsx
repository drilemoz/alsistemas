import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, Tag, Globe, Star, Share2, Check, Eye } from 'lucide-react'
import { useNoticia } from '../hooks/useNoticias'
import { formatarData, formatarDataRelativa } from '../utils/formatters'
import { markdownParaHtml } from '../utils/markdown'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'

// ─── SEO: atualiza <title> e meta tags dinamicamente ──────────
function useSEO({ titulo, descricao, imagem, url }) {
  useEffect(() => {
    const siteName = 'AL Sistemas'
    const fullTitle = titulo ? `${titulo} | ${siteName}` : siteName

    document.title = fullTitle

    function setMeta(name, content, isProp = false) {
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

    setMeta('description', descricao)
    setMeta('og:title',       fullTitle,  true)
    setMeta('og:description', descricao,  true)
    setMeta('og:image',       imagem,     true)
    setMeta('og:url',         url || window.location.href, true)
    setMeta('og:type',        'article',  true)
    setMeta('og:site_name',   siteName,   true)
    setMeta('twitter:card',        'summary_large_image')
    setMeta('twitter:title',       fullTitle)
    setMeta('twitter:description', descricao)
    setMeta('twitter:image',       imagem)

    return () => { document.title = siteName }
  }, [titulo, descricao, imagem, url])
}

// ─── Calcula tempo de leitura (palavras ÷ 200 wpm) ────────────
function calcularTempoLeitura(texto) {
  if (!texto) return 1
  const semMarkdown = texto.replace(/[#*>`\-\[\]!()_~]/g, ' ')
  const palavras = semMarkdown.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(palavras / 200))
}

// ─── Botão de compartilhamento (Web Share API + fallback clipboard) ──
function BotaoCompartilhar({ titulo, url }) {
  const [copiado, setCopiado] = useState(false)
  const temWebShare = typeof navigator !== 'undefined' && !!navigator.share

  async function handleCompartilhar() {
    const shareData = {
      title: titulo,
      text:  `Leia: ${titulo}`,
      url:   url || window.location.href,
    }

    if (temWebShare) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('share error', err)
      }
    } else {
      // Fallback: copia link para área de transferência
      try {
        await navigator.clipboard.writeText(shareData.url)
      } catch {
        // último recurso para contextos sem clipboard API
        const el = document.createElement('input')
        el.value = shareData.url
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }

  return (
    <button
      onClick={handleCompartilhar}
      title={temWebShare ? 'Compartilhar' : copiado ? 'Link copiado!' : 'Copiar link'}
      aria-label={temWebShare ? 'Compartilhar notícia' : copiado ? 'Link copiado!' : 'Copiar link da notícia'}
      className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full
                 border border-gray-200 text-gray-600 bg-white hover:border-forest-400
                 hover:text-brand-500 hover:bg-brand-50 transition-all duration-200
                 focus:outline-none focus:ring-2 focus:ring-forest-400 focus:ring-offset-1"
    >
      {copiado
        ? <><Check size={15} className="text-brand-500" aria-hidden="true"/> Link copiado!</>
        : <><Share2 size={15} aria-hidden="true"/> Compartilhar</>
      }
    </button>
  )
}

// ─── Renderiza conteúdo (markdown ou texto puro) ───────────────
function renderConteudo(texto) {
  if (!texto) return null
  const temMarkdown = /(\*\*|^##|^- )/m.test(texto)

  if (temMarkdown) {
    return (
      <div
        className="prose-news"
        dangerouslySetInnerHTML={{ __html: markdownParaHtml(texto) }}
      />
    )
  }

  return (
    <div className="text-gray-700 leading-relaxed space-y-4 text-base sm:text-lg font-normal">
      {texto.split('\n').map((p, i) =>
        p.trim() ? <p key={i}>{p}</p> : <br key={i}/>
      )}
    </div>
  )
}

export default function NoticiaDetalhe() {
  const { id } = useParams()
  const { noticia, loading, error } = useNoticia(id)

  const descricaoSEO = noticia?.conteudo?.replace(/[#*>\-\[\]]/g, '').slice(0, 160).trim()
  const tempoLeitura = calcularTempoLeitura(noticia?.conteudo)

  useSEO({
    titulo:    noticia?.titulo,
    descricao: descricaoSEO,
    imagem:    noticia?.imagem_url,
  })

  if (loading) return <div className="wrap py-10"><LoadingSpinner texto="Carregando notícia..."/></div>
  if (error)   return <div className="wrap py-10"><ErrorMessage mensagem={error}/></div>
  if (!noticia) return (
    <div className="wrap py-10 text-center">
      <p className="text-gray-500 font-semibold">Notícia não encontrada.</p>
      <Link to="/" className="btn-primary mt-4 inline-flex">Voltar</Link>
    </div>
  )

  const cat   = noticia.categoria_id || null
  const fonte = noticia.fonte_id     || null

  return (
    <article className="wrap py-8 animate-fade-in max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-600
                               text-sm font-bold mb-6 transition-colors group">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform"/> Voltar para início
      </Link>

      {noticia.destaque && (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1
                         bg-amber-100 text-amber-700 rounded-full mb-3 font-grotesk">
          <Star size={11} fill="currentColor"/> Destaque
        </span>
      )}

      {/* Categoria */}
      {cat && (
        <div className="mb-3">
          <Link to={`/?categoria=${cat.slug}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1
                       text-white rounded-full hover:opacity-90 transition-opacity
                       uppercase tracking-wider font-grotesk"
            style={{ backgroundColor: cat.cor || '#ff5c00' }}>
            <Tag size={10}/> {cat.nome}
          </Link>
        </div>
      )}

      {/* Título — menor e mais denso */}
      <h1 className="font-display font-bold text-2xl sm:text-3xl text-gray-900 leading-snug mb-4">
        {noticia.titulo}
      </h1>

      {/* ── Barra de meta compacta — uma linha só ── */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {/* Data de publicação */}
        <span className="inline-flex items-center gap-1 text-[11px] font-grotesk font-semibold
                         text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
          <Calendar size={11}/> {formatarData(noticia.publicado_em || noticia.criado_em)}
        </span>

        {/* Tempo relativo */}
        <span className="inline-flex items-center gap-1 text-[11px] font-grotesk font-semibold
                         text-gray-400 whitespace-nowrap">
          · {formatarDataRelativa(noticia.publicado_em || noticia.criado_em)}
        </span>

        {/* Separador */}
        <span className="text-gray-200 text-xs select-none">|</span>

        {/* Tempo de leitura */}
        <span className="inline-flex items-center gap-1 text-[11px] font-grotesk font-bold
                         text-brand-500 bg-brand-50 px-2.5 py-1 rounded-full whitespace-nowrap">
          <Clock size={11}/> {tempoLeitura} min
        </span>

        {/* Visualizações */}
        {noticia.views > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-grotesk font-semibold
                           text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
            <Eye size={11}/> {noticia.views.toLocaleString('pt-BR')}
          </span>
        )}

        {/* Fonte */}
        {fonte && (
          <>
            <span className="text-gray-200 text-xs select-none">|</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-grotesk font-semibold
                             text-gray-500 whitespace-nowrap">
              <Globe size={11}/>
              {fonte.url
                ? <a href={fonte.url} target="_blank" rel="noopener noreferrer"
                     className="hover:text-brand-500 transition-colors underline underline-offset-2">
                    {fonte.nome}
                  </a>
                : fonte.nome
              }
            </span>
          </>
        )}

        {/* Compartilhar — direita, desktop */}
        <span className="ml-auto hidden sm:block">
          <BotaoCompartilhar titulo={noticia.titulo} url={window.location.href} />
        </span>
      </div>

      {/* Imagem de capa + legenda */}
      {noticia.imagem_url && (
        <figure className="mb-8">
          <div className="w-full rounded-2xl overflow-hidden shadow-md"
               style={{ maxHeight: '480px' }}>
            <img
              src={noticia.imagem_url}
              alt={noticia.imagem_legenda || noticia.titulo}
              className="w-full h-full object-cover"
              style={{ maxHeight: '480px' }}
            />
          </div>
          {noticia.imagem_legenda && (
            <figcaption className="mt-2 text-center text-xs text-gray-400
                                   font-grotesk leading-relaxed px-2">
              {noticia.imagem_legenda}
            </figcaption>
          )}
        </figure>
      )}

      <div className="w-12 h-1 bg-brand-500 rounded-full mb-8"/>

      {renderConteudo(noticia.conteudo)}

      {/* ── Rodapé do artigo ─────────────────────────────────── */}
      <div className="mt-12 pt-6 border-t border-gray-100 flex items-center gap-4 flex-wrap">
        <Link to="/" className="btn-secondary">
          <ArrowLeft size={15}/> Mais notícias
        </Link>
        {cat && (
          <Link to={`/?categoria=${cat.slug}`}
            className="text-sm font-bold text-brand-500 hover:text-brand-600 flex items-center gap-1">
            <Tag size={13}/> Mais em {cat.nome}
          </Link>
        )}

        {/* Compartilhar — mobile (no rodapé) */}
        <span className="ml-auto sm:hidden">
          <BotaoCompartilhar titulo={noticia.titulo} url={window.location.href} />
        </span>
      </div>
    </article>
  )
}
