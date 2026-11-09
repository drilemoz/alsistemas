import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useNoticias, useCategorias } from '../hooks/useNoticias'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage   from '../components/ErrorMessage'
import { NoticiaCardItem, NoticiaCardV } from '../components/NoticiaCard'
import {
  Newspaper, Star, ArrowRight, Tag, X, Globe,
  BookOpen, Mountain, Users, Heart,
  Church, ExternalLink, Bus, CalendarDays,
  Search, ChevronLeft, ChevronRight, Mail,
} from 'lucide-react'
import {
  configuracoesService,
  modulosService,
  noticiasExternasService,
  topicosService,
  eventosService,
  onibusService,
  newsletterService,
} from '../services/api'

/* ─── Ícones de tópico ─────────────────────────────────────── */
const ICON_MAP = {
  church: Church, mountain: Mountain, users: Users, heart: Heart,
  book: BookOpen, globe: Globe, star: Star, newspaper: Newspaper,
  bus: Bus, calendarDays: CalendarDays, calendar: CalendarDays,
}

function labelOnibus(t) {
  return t.icone === 'bus' ? 'Ônibus' : t.label
}

function textoEventoDias(dataISO) {
  if (!dataISO) return null
  const evento = new Date(dataISO); evento.setHours(0, 0, 0, 0)
  const hoje   = new Date();        hoje.setHours(0, 0, 0, 0)
  const dias   = Math.round((evento - hoje) / 86_400_000)
  if (dias === 0) return '📅 Hoje!'
  if (dias === 1) return '📅 Amanhã'
  return `📅 Em ${dias} dias`
}

/* ═══════════════════════════════════════════════════════════
   HERO
═══════════════════════════════════════════════════════════ */
function Hero({ cfg, destaqueImg }) {
  const titulo1   = cfg.hero_titulo_linha1 || 'Sua cidade,'
  const titulo2   = cfg.hero_titulo_linha2 || 'em destaque.'
  const subtitulo = cfg.hero_subtitulo     || 'Jornalismo local para quem ama Iguatama. Notícias, eventos, curiosidades e muito mais.'
  const btn1Label = cfg.hero_btn1_label    || 'Últimas Notícias'
  const btn1Link  = cfg.hero_btn1_link     || '/#noticias'
  const btn2Label = cfg.hero_btn2_label    || 'Curiosidades'
  const btn2Link  = cfg.hero_btn2_link     || '/?categoria=curiosidades'
  const imgUrl    = cfg.hero_imagem_url    || destaqueImg || ''

  return (
    <section className="relative overflow-hidden bg-white">
      {/* Eyebrow */}
      <div className="bg-brand-500 py-2 px-4">
        <p className="text-white text-xs font-grotesk font-bold tracking-widest uppercase text-center">
          🗺️ Iguatama, MG — Portal de Notícias Local
        </p>
      </div>

      <div className="wrap pt-10 pb-0">
        <div className="max-w-xl mb-8">
          <h1
            className="font-display font-bold text-gray-900 leading-[1.05] animate-slide-up"
            style={{ fontSize: 'clamp(2.4rem, 7vw, 3.8rem)', animationDelay: '80ms' }}>
            {titulo1}
          </h1>
          <h1
            className="font-display font-bold italic text-brand-500 leading-[1.05] mb-5 animate-slide-up"
            style={{ fontSize: 'clamp(2.4rem, 7vw, 3.8rem)', animationDelay: '160ms' }}>
            {titulo2}
          </h1>
          <p className="font-grotesk text-gray-500 text-base sm:text-lg leading-relaxed max-w-md mb-8
                        animate-slide-up" style={{ animationDelay: '240ms' }}>
            {subtitulo}
          </p>
          <div className="flex items-center gap-3 flex-wrap animate-slide-up" style={{ animationDelay: '320ms' }}>
            <Link to={btn1Link}
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600
                         text-white font-grotesk font-bold text-sm px-6 py-3 rounded-xl
                         transition-colors shadow-sm">
              <Newspaper size={16}/> {btn1Label}
            </Link>
            <Link to={btn2Link}
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200
                         text-gray-700 font-grotesk font-bold text-sm px-6 py-3 rounded-xl
                         transition-colors">
              <Heart size={16}/> {btn2Label}
            </Link>
          </div>
        </div>

        {imgUrl && (
          <div className="w-full rounded-t-2xl overflow-hidden" style={{ maxHeight: 280 }}>
            <img
              src={imgUrl}
              alt="Destaque"
              className="w-full h-full object-cover animate-fade-in"
              style={{ maxHeight: 280 }}
            />
          </div>
        )}
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════
   FAIXA DE TÓPICOS
═══════════════════════════════════════════════════════════ */
function FaixaTopicos({ topicos, proximoEvento, proximoOnibus, modulos }) {
  if (!topicos.length) return null

  const onibusMod  = modulos?.['horario-onibus']?.ativo !== false
  const eventosMod = modulos?.['eventos']?.ativo !== false

  return (
    <div className="wrap">
      <div
        className="bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden
                   grid divide-x divide-gray-100"
        style={{ gridTemplateColumns: `repeat(${topicos.length}, 1fr)` }}>
        {topicos.map(t => {
          const Icon      = ICON_MAP[t.icone] || Heart
          const isInterno = t.link?.startsWith('/')
          const isOnibus  = t.icone === 'bus'
          const isEventos = ['calendarDays', 'calendar'].includes(t.icone)

          let detalhe = null
          if (isOnibus && onibusMod) {
            detalhe = proximoOnibus
              ? <p className="text-brand-500 text-[10px] font-bold font-grotesk leading-snug">🚌 {proximoOnibus}</p>
              : t.descricao
                ? <p className="text-gray-400 text-[10px] font-grotesk">{t.descricao}</p>
                : null
          } else if (isEventos && eventosMod) {
            const txt = textoEventoDias(proximoEvento)
            detalhe = txt
              ? <p className="text-brand-500 text-[10px] font-bold font-grotesk leading-snug">{txt}</p>
              : t.descricao
                ? <p className="text-gray-400 text-[10px] font-grotesk">{t.descricao}</p>
                : null
          } else if (t.descricao) {
            detalhe = <p className="text-gray-400 text-[10px] font-grotesk">{t.descricao}</p>
          }

          const inner = (
            <div className="flex flex-col items-center text-center gap-2 py-4 px-2
                            group-hover:bg-brand-50 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-gray-50 group-hover:bg-brand-100
                              flex items-center justify-center transition-colors">
                <Icon size={20} className="text-gray-400 group-hover:text-brand-500 transition-colors" strokeWidth={1.5}/>
              </div>
              <p className="font-grotesk font-bold text-[11px] text-gray-800 leading-tight">
                {labelOnibus(t)}
              </p>
              {detalhe}
            </div>
          )

          return isInterno ? (
            <Link key={t._id || t.id} to={t.link} className="group">{inner}</Link>
          ) : (
            <a key={t._id || t.id} href={t.link || '/'} className="group">{inner}</a>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ABAS DE CATEGORIA
═══════════════════════════════════════════════════════════ */
function AbasCategorias({ catAtual, onMudar }) {
  const { categorias } = useCategorias()

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <button
        onClick={() => onMudar(null)}
        className={`flex-shrink-0 font-grotesk font-bold text-sm px-4 py-2 rounded-xl
                    border-2 transition-all whitespace-nowrap
                    ${!catAtual
                      ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                      : 'bg-gray-50 border-transparent text-gray-600 hover:border-gray-200'}`}>
        Tudo
      </button>
      {categorias.map(c => (
        <button
          key={c._id || c.id}
          onClick={() => onMudar(c.slug)}
          className={`flex-shrink-0 font-grotesk font-bold text-sm px-4 py-2 rounded-xl
                      border-2 transition-all whitespace-nowrap
                      ${catAtual === c.slug
                        ? 'text-white border-transparent shadow-sm'
                        : 'bg-gray-50 border-transparent text-gray-600 hover:border-gray-200'}`}
          style={catAtual === c.slug ? { backgroundColor: c.cor || '#ff5c00' } : {}}>
          {c.nome}
        </button>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   NOTÍCIAS EXTERNAS
═══════════════════════════════════════════════════════════ */
function NoticiasExternas({ items }) {
  if (!items.length) return null
  return (
    <section>
      <div className="section-title">
        <h2 className="section-title-text font-grotesk">
          <Globe size={20} className="text-brand-500"/> Notícias do Brasil e do Mundo
        </h2>
      </div>
      <div className="scroll-x pb-2">
        {items.slice(0, 4).map(item => (
          <a key={item._id || item.id} href={item.url_externa} target="_blank" rel="noopener noreferrer"
            className="group block w-44 sm:w-52 flex-shrink-0">
            <div className="card h-full flex flex-col">
              <div className="relative h-28 overflow-hidden bg-gray-100 flex-shrink-0">
                {item.imagem_url ? (
                  <img src={item.imagem_url} alt={item.titulo}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                    <Globe size={24} className="text-gray-300"/>
                  </div>
                )}
                {item.categoria_label && (
                  <div className="absolute top-2 left-2">
                    <span className="text-[10px] font-bold font-grotesk px-2 py-0.5 rounded-full
                                     text-white uppercase tracking-wide shadow-sm"
                      style={{ backgroundColor: item.categoria_cor || '#ff5c00' }}>
                      {item.categoria_label}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
                <p className="font-display font-semibold text-gray-900 text-xs leading-snug
                               group-hover:text-brand-500 transition-colors line-clamp-3 flex-1">
                  {item.titulo}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  <span className="text-xs font-grotesk font-bold text-gray-400 uppercase tracking-wide">
                    {item.fonte_nome}
                  </span>
                  <ExternalLink size={12} className="text-gray-300 group-hover:text-brand-500 transition-colors"/>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════
   PAGINAÇÃO
═══════════════════════════════════════════════════════════ */
function Paginacao({ pagina, paginas, onMudar }) {
  if (paginas <= 1) return null
  const pages = Array.from({ length: paginas }, (_, i) => i + 1)
  return (
    <div className="flex items-center justify-center gap-1.5 pt-6">
      <button onClick={() => onMudar(pagina - 1)} disabled={pagina === 1}
        className="p-2 rounded-xl border border-gray-200 text-gray-500
                   hover:border-brand-400 hover:text-brand-500 disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors">
        <ChevronLeft size={16}/>
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onMudar(p)}
          className={`w-9 h-9 rounded-xl text-sm font-grotesk font-bold transition-colors ${
            p === pagina
              ? 'bg-brand-500 text-white shadow-sm'
              : 'border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-500'
          }`}>
          {p}
        </button>
      ))}
      <button onClick={() => onMudar(pagina + 1)} disabled={pagina === paginas}
        className="p-2 rounded-xl border border-gray-200 text-gray-500
                   hover:border-brand-400 hover:text-brand-500 disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors">
        <ChevronRight size={16}/>
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   NEWSLETTER CTA
═══════════════════════════════════════════════════════════ */
function NewsletterCTA() {
  const [email,    setEmail]    = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok,       setOk]       = useState(false)
  const [erro,     setErro]     = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    try {
      setEnviando(true)
      setErro(null)
      await newsletterService.assinar({ email })
      setOk(true)
      setEmail('')
    } catch (err) {
      setErro(err.message || 'Erro ao assinar. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={20} className="text-white/80"/>
            <h3 className="font-display font-bold text-white text-xl">Fique por dentro</h3>
          </div>
          <p className="font-grotesk text-white/80 text-sm leading-relaxed">
            Receba as principais notícias de Iguatama direto no seu e-mail, sem spam.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          {ok ? (
            <div className="flex items-center gap-2 bg-white/20 text-white font-grotesk font-bold
                            text-sm px-5 py-3 rounded-xl">
              ✅ Assinatura confirmada!
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="flex-1 min-w-0 bg-white/20 border border-white/30 text-white
                           placeholder-white/60 font-grotesk text-sm rounded-xl px-4 py-2.5
                           focus:outline-none focus:ring-2 focus:ring-white/50 w-48"
              />
              <button
                type="submit"
                disabled={enviando}
                className="bg-white text-brand-500 font-grotesk font-bold text-sm
                           px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors
                           disabled:opacity-60 whitespace-nowrap">
                {enviando ? '...' : 'Assinar'}
              </button>
            </form>
          )}
          {erro && <p className="text-white/80 text-xs mt-1.5 font-grotesk">{erro}</p>}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════
   HOME — componente principal
═══════════════════════════════════════════════════════════ */
export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const catSlug    = searchParams.get('categoria') || null
  const q          = searchParams.get('q')         || null
  const page       = parseInt(searchParams.get('page') || '1', 10)
  const dataInicio = searchParams.get('dataInicio') || null
  const dataFim    = searchParams.get('dataFim')    || null
  const ordem      = searchParams.get('ordem')      || 'recente'

  const { noticias, total, paginas, loading, error, recarregar } =
    useNoticias({ categoriaSlug: catSlug, q, page, limit: 12, dataInicio, dataFim, ordem })

  const [cfg,           setCfg]           = useState({})
  const [modulos,       setModulos]       = useState({})
  const [topicos,       setTopicos]       = useState([])
  const [externas,      setExternas]      = useState([])
  const [proximoEvento, setProximoEvento] = useState(null)
  const [proximoOnibus, setProximoOnibus] = useState(null)

  useEffect(() => {
    configuracoesService.listar().then(setCfg).catch(() => {})
    modulosService.listar().then(list => {
      const map = {}
      list.forEach(m => { map[m.chave] = m })
      setModulos(map)
    }).catch(() => {})
    topicosService.listar().then(setTopicos).catch(() => {})
    noticiasExternasService.listar().then(setExternas).catch(() => {})

    eventosService.listar().then(evs => {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const proximo = evs
        .filter(e => new Date(e.data) >= hoje)
        .sort((a, b) => new Date(a.data) - new Date(b.data))[0]
      if (proximo) setProximoEvento(proximo.data)
    }).catch(() => {})

    onibusService.listar().then(linhas => {
      if (!linhas.length) return
      const diasMap  = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
      const diaAtual = diasMap[new Date().getDay()]
      const minAgora = new Date().getHours() * 60 + new Date().getMinutes()
      for (const linha of linhas) {
        const candidatos = (linha.horarios || [])
          .filter(h => h.dias?.includes(diaAtual))
          .map(h => {
            const [hh, mm] = h.hora.split(':').map(Number)
            return { hora: h.hora, min: hh * 60 + mm }
          })
          .filter(h => h.min >= minAgora)
          .sort((a, b) => a.min - b.min)
        if (candidatos.length) {
          setProximoOnibus(candidatos[0].hora)
          break
        }
      }
    }).catch(() => {})
  }, [])

  const destaques   = noticias.filter(n => n.destaque)
  const recentes    = noticias.filter(n => !n.destaque)
  const destaqueImg = destaques[0]?.imagem_url || noticias[0]?.imagem_url || ''
  const emFiltro    = !!(catSlug || q || dataInicio || dataFim || (ordem && ordem !== 'recente'))
  const isAtivo     = chave => modulos[chave]?.ativo !== false

  function mudarParam(key, value) {
    const next = new URLSearchParams(searchParams)
    next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  function mudarPagina(p) {
    const next = new URLSearchParams(searchParams)
    if (p === 1) next.delete('page')
    else next.set('page', String(p))
    setSearchParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function mudarCategoria(slug) {
    const next = new URLSearchParams(searchParams)
    next.delete('page')
    if (slug) next.set('categoria', slug)
    else next.delete('categoria')
    setSearchParams(next)
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Hero */}
      {!emFiltro && isAtivo('hero') && (
        <Hero cfg={cfg} destaqueImg={destaqueImg} />
      )}

      {/* Tópicos */}
      {!emFiltro && isAtivo('topicos') && topicos.length > 0 && (
        <div className="py-5">
          <FaixaTopicos
            topicos={topicos}
            proximoEvento={proximoEvento}
            proximoOnibus={proximoOnibus}
            modulos={modulos}
          />
        </div>
      )}

      {/* Conteúdo */}
      <div className="wrap py-8 space-y-10">

        {/* Filtros ativos */}
        {(q || catSlug || dataInicio || dataFim) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {catSlug && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50
                                 text-brand-600 rounded-full text-sm font-grotesk font-bold">
                  <Tag size={13}/> {catSlug}
                </span>
              )}
              {q && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100
                                 text-gray-700 rounded-full text-sm font-grotesk font-bold">
                  <Search size={13}/> &ldquo;{q}&rdquo;
                </span>
              )}
              {dataInicio && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50
                                 text-purple-700 rounded-full text-sm font-grotesk font-bold">
                  De: {dataInicio}
                </span>
              )}
              {dataFim && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50
                                 text-purple-700 rounded-full text-sm font-grotesk font-bold">
                  Até: {dataFim}
                </span>
              )}
              <Link to="/" className="inline-flex items-center gap-1 text-sm font-grotesk font-semibold
                                      text-gray-400 hover:text-gray-600 transition-colors ml-auto">
                <X size={14}/> Limpar tudo
              </Link>
            </div>

            <div className="flex items-end gap-3 flex-wrap border-t border-gray-50 pt-3">
              <div>
                <label htmlFor="filtro-data-inicio" className="label text-xs font-grotesk">De</label>
                <input id="filtro-data-inicio" type="date"
                  value={dataInicio || ''}
                  onChange={e => mudarParam('dataInicio', e.target.value)}
                  className="input text-sm py-1.5 w-36"/>
              </div>
              <div>
                <label htmlFor="filtro-data-fim" className="label text-xs font-grotesk">Até</label>
                <input id="filtro-data-fim" type="date"
                  value={dataFim || ''}
                  onChange={e => mudarParam('dataFim', e.target.value)}
                  className="input text-sm py-1.5 w-36"/>
              </div>
              <div className="ml-auto">
                <label htmlFor="filtro-ordem" className="label text-xs font-grotesk">Ordenar por</label>
                <select id="filtro-ordem" value={ordem}
                  onChange={e => mudarParam('ordem', e.target.value === 'recente' ? '' : e.target.value)}
                  className="input text-sm py-1.5 w-44">
                  <option value="recente">Mais recentes</option>
                  <option value="antigo">Mais antigos</option>
                  {q && <option value="relevancia">Relevância</option>}
                </select>
              </div>
            </div>

            {!loading && (
              <p className="text-xs text-gray-400 font-grotesk font-medium pt-1">
                {total} resultado{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}

        {loading && <LoadingSpinner texto="Buscando notícias..."/>}
        {error   && <ErrorMessage mensagem={error} onRetry={recarregar}/>}

        {!loading && !error && noticias.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">{q ? '🔍' : '📰'}</p>
            <p className="font-grotesk font-bold text-gray-500 text-lg">
              {q
                ? `Nenhuma notícia encontrada para "${q}".`
                : catSlug
                  ? `Nenhuma notícia em "${catSlug}".`
                  : 'Nenhuma notícia publicada ainda.'}
            </p>
            {emFiltro && <Link to="/" className="btn-primary mt-5 inline-flex">Ver todas</Link>}
          </div>
        )}

        {/* ── MODO FILTRO / BUSCA ── */}
        {!loading && !error && emFiltro && noticias.length > 0 && (
          <section id="noticias">
            <div className="section-title mb-4">
              <h2 className="section-title-text font-grotesk">
                <Newspaper size={20} className="text-brand-500"/>
                {q ? `Resultados para "${q}"` : 'Notícias'}
              </h2>
            </div>
            <div className="mb-5">
              <AbasCategorias catAtual={catSlug} onMudar={mudarCategoria}/>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {noticias.map((n, i) => (
                <div key={n._id || n.id} className="animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <NoticiaCardItem noticia={n}/>
                </div>
              ))}
            </div>
            <Paginacao pagina={page} paginas={paginas} onMudar={mudarPagina}/>
          </section>
        )}

        {/* ── MODO NORMAL ── */}
        {!loading && !error && !emFiltro && noticias.length > 0 && (
          <>
            {isAtivo('ultimas_noticias') && (
              <section id="noticias">
                <div className="section-title mb-4">
                  <h2 className="section-title-text font-grotesk">
                    <Newspaper size={20} className="text-brand-500"/> Últimas Notícias
                  </h2>
                  <Link to="/?page=1"
                    className="text-sm font-grotesk font-bold text-brand-500 hover:text-brand-600
                               flex items-center gap-1 transition-colors">
                    Ver todas <ArrowRight size={14}/>
                  </Link>
                </div>

                <div className="mb-5">
                  <AbasCategorias catAtual={catSlug} onMudar={mudarCategoria}/>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {recentes.slice(0, 8).map((n, i) => (
                    <div key={n._id || n.id} className="animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                      <NoticiaCardItem noticia={n}/>
                    </div>
                  ))}
                </div>
                <Paginacao pagina={page} paginas={paginas} onMudar={mudarPagina}/>
              </section>
            )}

            {isAtivo('noticias_externas') && externas.length > 0 && (
              <NoticiasExternas items={externas}/>
            )}

            {isAtivo('destaques') && destaques.length > 0 && (
              <section>
                <div className="section-title">
                  <h2 className="section-title-text font-grotesk">
                    <Star size={20} className="text-brand-500"/> Destaques
                  </h2>
                  <Link to="/eventos"
                    className="text-sm font-grotesk font-bold text-brand-500 hover:text-brand-600
                               flex items-center gap-1 transition-colors">
                    Ver eventos <ArrowRight size={14}/>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {destaques.slice(0, 3).map((n, i) => (
                    <div key={n._id || n.id} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                      <NoticiaCardV noticia={n} fullWidth/>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isAtivo('newsletter') && <NewsletterCTA/>}
          </>
        )}
      </div>
    </div>
  )
}
