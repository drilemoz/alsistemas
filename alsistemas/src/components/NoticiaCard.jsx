import { Link } from 'react-router-dom'
import { Clock, ChevronRight } from 'lucide-react'
import { formatarDataRelativa } from '../utils/formatters'

// Badge da categoria com cor personalizada
export function CategoriaBadge({ categoria, small = false }) {
  if (!categoria) return null
  const cor = categoria.cor || '#1B5E3B'
  return (
    <Link
      to={`/?categoria=${categoria.slug}`}
      onClick={e => e.stopPropagation()}
      style={{ backgroundColor: cor }}
      className={`inline-block font-extrabold rounded-full text-white uppercase tracking-wide
                  shadow-sm hover:opacity-90 transition-opacity
                  ${small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
      {categoria.nome}
    </Link>
  )
}

// ── Card vertical — Seção "Últimas Notícias" (scroll horizontal)
export function NoticiaCardV({ noticia, fullWidth = false }) {
  const cat = noticia.categoria_id || null
  const nid = noticia._id?.toString() || noticia.id
  return (
    <Link to={`/noticia/${nid}`} className={`group block ${fullWidth ? 'w-full' : 'w-56 sm:w-64 flex-shrink-0'}`}>
      <div className="card h-full flex flex-col">
        {/* Imagem */}
        <div className="relative overflow-hidden bg-gray-100 flex-shrink-0"
          style={{ aspectRatio: '16/10' }}>
          {noticia.imagem_url ? (
            <img src={noticia.imagem_url} alt={noticia.titulo}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
          ) : (
            <div className="w-full h-full flex items-center justify-center
                            bg-gradient-to-br from-forest-100 to-forest-50">
              <span className="text-4xl">📰</span>
            </div>
          )}
          {cat && (
            <div className="absolute top-3 left-3">
              <CategoriaBadge categoria={cat} />
            </div>
          )}
        </div>
        {/* Conteúdo */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-display font-bold text-gray-900 text-base leading-snug
                         group-hover:text-brand-500 transition-colors line-clamp-3 flex-1">
            {noticia.titulo}
          </h3>
          {noticia.conteudo && (
            <p className="text-gray-500 text-sm mt-2 line-clamp-2 font-normal">
              {noticia.conteudo.slice(0, 110)}
            </p>
          )}
          <div className="flex items-center gap-1.5 text-gray-400 text-xs font-semibold mt-3">
            <Clock size={11} />
            {formatarDataRelativa(noticia.criado_em)}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Card horizontal pequeno — seção "Notícias do Mundo"
export function NoticiaCardH({ noticia }) {
  const cat = noticia.categoria_id || null
  const nid = noticia._id?.toString() || noticia.id
  return (
    <Link to={`/noticia/${nid}`} className="group block w-56 sm:w-64 flex-shrink-0">
      <div className="card h-full flex flex-col">
        <div className="relative h-36 overflow-hidden bg-gray-100 flex-shrink-0">
          {noticia.imagem_url ? (
            <img src={noticia.imagem_url} alt={noticia.titulo}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
          ) : (
            <div className="w-full h-full flex items-center justify-center
                            bg-gradient-to-br from-forest-100 to-forest-50">
              <span className="text-3xl">📰</span>
            </div>
          )}
          {cat && (
            <div className="absolute top-2 left-2">
              <CategoriaBadge categoria={cat} small />
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col flex-1">
          <h3 className="font-display font-bold text-gray-900 text-sm leading-snug
                         group-hover:text-brand-500 transition-colors line-clamp-2 flex-1">
            {noticia.titulo}
          </h3>
          <div className="flex items-center gap-1 text-gray-400 text-xs mt-2">
            <Clock size={10}/> {formatarDataRelativa(noticia.criado_em)}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Card lista — Seção "Destaques"
export function NoticiaCardLista({ noticia }) {
  const nid = noticia._id?.toString() || noticia.id
  return (
    <Link to={`/noticia/${nid}`}
      className="group flex items-center gap-4 bg-white rounded-2xl p-3
                 hover:shadow-md transition-all duration-300 border border-gray-100">
      {/* Thumb */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
        {noticia.imagem_url ? (
          <img src={noticia.imagem_url} alt={noticia.titulo}
              loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-forest-100 to-forest-50">
            <span className="text-2xl">📰</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-display font-bold text-gray-900 text-sm leading-snug
                       group-hover:text-brand-500 transition-colors line-clamp-2">
          {noticia.titulo}
        </h3>
        {noticia.conteudo && (
          <p className="text-gray-500 text-xs mt-1 line-clamp-2 font-normal">
            {noticia.conteudo.slice(0, 90)}
          </p>
        )}
      </div>
      <ChevronRight size={18}
        className="text-gray-300 group-hover:text-brand-400 flex-shrink-0 transition-colors"/>
    </Link>
  )
}

// ─── NoticiaCardItem ─────────────────────────────────────────
// Card de lista usado na Home v3 (Moderno Urbano)
export function NoticiaCardItem({ noticia }) {
  const nid = noticia._id?.toString() || noticia.id
  const dataFmt = noticia.data_publicacao
    ? formatarDataRelativa(noticia.data_publicacao)
    : ''
  return (
    <Link to={`/noticia/${nid}`}
      className="group flex items-center gap-4 px-4 py-4
                 hover:bg-gray-50 transition-colors">
      {/* Thumb */}
      <div className="w-20 h-16 sm:w-24 sm:h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
        {noticia.imagem_url ? (
          <img src={noticia.imagem_url} alt={noticia.titulo} loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100">
            <span className="text-2xl">📰</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {noticia.categoria && (
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wide
                       text-white rounded-full px-2 py-0.5 mb-1.5"
            style={{ backgroundColor: noticia.categoria.cor || '#ff5c00' }}>
            {noticia.categoria.nome}
          </span>
        )}
        <h3 className="font-display font-bold text-gray-900 text-sm leading-snug
                       group-hover:text-brand-500 transition-colors line-clamp-2">
          {noticia.titulo}
        </h3>
        <p className="text-gray-400 text-xs font-grotesk font-medium mt-1 flex items-center gap-1">
          <Clock size={11}/> {dataFmt}
        </p>
      </div>

      <ChevronRight size={16}
        className="text-gray-200 group-hover:text-brand-400 flex-shrink-0 transition-colors"/>
    </Link>
  )
}

// Default export para compatibilidade
export default function NoticiaCard({ noticia, destaque = false }) {
  if (destaque) return <NoticiaCardH noticia={noticia} />
  return <NoticiaCardLista noticia={noticia} />
}
