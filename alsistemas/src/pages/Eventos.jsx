import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, ArrowLeft, MapPin, Clock, AlertCircle,
  X, Tag, Ticket, Heart, DollarSign,
} from 'lucide-react'
import { eventosService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'

// ─── Helpers ────────────────────────────────────────────────────

function formatarDataEvento(dataStr) {
  if (!dataStr) return ''
  const d = new Date(dataStr)
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function formatarMesAno(dataStr) {
  if (!dataStr) return ''
  const d = new Date(dataStr)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function mesKey(dataStr) {
  const d = new Date(dataStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Retorna o tempo restante para TODOS os eventos futuros.
 * Para eventos passados retorna null.
 */
function tempoRestante(dataStr) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const data  = new Date(dataStr); data.setHours(0, 0, 0, 0)
  const diff  = Math.ceil((data - hoje) / 86400000)
  if (diff < 0)  return null          // passado — sem badge
  if (diff === 0) return 'Hoje!'
  if (diff === 1) return 'Amanhã'
  if (diff < 7)   return `Em ${diff} dias`
  if (diff < 14)  return 'Em 1 semana'
  const semanas = Math.round(diff / 7)
  if (semanas < 5) return `Em ${semanas} semanas`
  const meses = Math.round(diff / 30)
  return `Em ${meses} ${meses === 1 ? 'mês' : 'meses'}`
}

function corEvento(cor) {
  return cor || '#1B5E3B'
}

// ─── Tipo de Entrada ────────────────────────────────────────────
const ENTRADA_CONFIG = {
  gratuito: { label: 'Gratuito',        cor: '#1B5E3B', Icon: Ticket  },
  pago:     { label: 'Pago',            cor: '#C62828', Icon: DollarSign },
  doacoes:  { label: 'Aceita doações',  cor: '#E65100', Icon: Heart   },
}

function BadgeEntrada({ tipo }) {
  const cfg = ENTRADA_CONFIG[tipo] || ENTRADA_CONFIG.gratuito
  const { label, cor, Icon } = cfg
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: cor + '18', color: cor }}
    >
      <Icon size={11} strokeWidth={2.5} /> {label}
    </span>
  )
}

// ─── Modal de detalhes do evento ────────────────────────────────
function EventoModal({ ev, onClose }) {
  const cor = corEvento(ev.cor)
  const badge = tempoRestante(ev.data)

  // Fechar com ESC
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Travar scroll do body enquanto o modal estiver aberto
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Barra colorida no topo */}
        <div style={{ height: 6, background: cor, flexShrink: 0 }} />

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            {/* Data compacta */}
            <div
              className="flex flex-col items-center justify-center rounded-xl px-3 py-2 text-center"
              style={{ backgroundColor: cor + '14', minWidth: 56 }}
            >
              <span className="font-black text-2xl leading-none" style={{ color: cor }}>
                {new Date(ev.data).getDate()}
              </span>
              <span className="text-[11px] font-bold uppercase leading-tight mt-0.5 text-gray-500">
                {new Date(ev.data).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
              </span>
            </div>
            <div>
              <h2 className="font-display font-bold text-gray-900 text-lg leading-tight">
                {ev.titulo}
              </h2>
              <p className="text-xs text-gray-400 font-semibold capitalize mt-0.5">
                {formatarDataEvento(ev.data)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="overflow-y-auto px-5 pb-6 space-y-4" style={{ overscrollBehavior: 'contain' }}>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {badge && (
              <span
                className="inline-flex items-center text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: cor + '20', color: cor }}
              >
                {badge}
              </span>
            )}
            {ev.tipoEntrada && <BadgeEntrada tipo={ev.tipoEntrada} />}
          </div>

          {/* Informações */}
          <div className="space-y-2">
            {ev.horario && (
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <Clock size={15} className="text-gray-400 flex-shrink-0" />
                <span className="font-semibold">{ev.horario}</span>
              </div>
            )}
            {ev.local && (
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <MapPin size={15} className="text-gray-400 flex-shrink-0" />
                <span className="font-semibold">{ev.local}</span>
              </div>
            )}
          </div>

          {/* Descrição */}
          {ev.descricao && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                {ev.descricao}
              </p>
            </div>
          )}

          {/* Aviso */}
          <p className="text-[11px] text-gray-400 flex items-start gap-1 pt-1">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            Programação sujeita a alteração. Confirme com os organizadores.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────
export default function Eventos() {
  const [eventos,  setEventos]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modalEv,  setModalEv]  = useState(null)   // evento selecionado para ver detalhes

  useEffect(() => {
    eventosService.listar()
      .then(setEventos)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fecharModal = useCallback(() => setModalEv(null), [])

  // Agrupa por mês
  const porMes = eventos.reduce((acc, ev) => {
    const k = mesKey(ev.data)
    if (!acc[k]) acc[k] = { label: formatarMesAno(ev.data), items: [] }
    acc[k].items.push(ev)
    return acc
  }, {})

  return (
    <>
      {/* Modal de detalhes */}
      {modalEv && <EventoModal ev={modalEv} onClose={fecharModal} />}

      <div className="wrap py-6 sm:py-8 max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-600
                     text-sm font-bold mb-6 transition-colors group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Voltar para início
        </Link>

        {/* Título */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <CalendarDays size={20} className="text-brand-500" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl sm:text-2xl text-gray-900 leading-tight">
              Agenda de Eventos
            </h1>
            <p className="text-sm text-gray-500 font-medium">Iguatama e região</p>
          </div>
        </div>

        {loading && <LoadingSpinner texto="Carregando eventos..." />}

        {!loading && eventos.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <CalendarDays size={44} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">Nenhum evento programado no momento.</p>
            <p className="text-gray-400 text-sm mt-1">Volte em breve para conferir a agenda.</p>
          </div>
        )}

        {!loading && eventos.length > 0 && (
          <div className="space-y-8 sm:space-y-10">
            {Object.entries(porMes).map(([, { label, items }]) => (
              <div key={label}>
                {/* Cabeçalho do mês */}
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <h2 className="font-display font-bold text-sm text-gray-400 uppercase tracking-widest capitalize whitespace-nowrap">
                    {label}
                  </h2>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* Eventos do mês */}
                <div className="space-y-2.5 sm:space-y-3">
                  {items.map(ev => {
                    const badge = tempoRestante(ev.data)
                    const cor   = corEvento(ev.cor)

                    return (
                      <button
                        key={ev.id}
                        onClick={() => setModalEv(ev)}
                        className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm
                                   hover:shadow-md hover:border-gray-200 active:scale-[0.99]
                                   transition-all duration-200 overflow-hidden flex items-stretch
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
                        aria-label={`Ver detalhes: ${ev.titulo}`}
                      >
                        {/* Barra colorida lateral */}
                        <div
                          className="w-1.5 flex-shrink-0 rounded-l-2xl"
                          style={{ backgroundColor: cor }}
                        />

                        {/* Data compacta */}
                        <div
                          className="flex-shrink-0 flex flex-col items-center justify-center
                                     px-3 sm:px-4 py-3 sm:py-4 text-center"
                          style={{ minWidth: 56 }}
                        >
                          <span className="font-black text-xl sm:text-2xl leading-none text-gray-900">
                            {new Date(ev.data).getDate()}
                          </span>
                          <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase leading-tight mt-0.5">
                            {new Date(ev.data).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                          </span>
                        </div>

                        {/* Divider */}
                        <div className="w-px bg-gray-100 self-stretch my-3" />

                        {/* Conteúdo */}
                        <div className="flex-1 px-3 sm:px-4 py-3 sm:py-4 min-w-0">
                          {/* Título + badge de tempo */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display font-bold text-gray-900 text-sm sm:text-base leading-snug">
                              {ev.titulo}
                            </h3>
                            {badge && (
                              <span
                                className="inline-flex items-center text-[10px] font-extrabold
                                           px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
                                style={{
                                  backgroundColor: cor + '20',
                                  color: cor,
                                }}
                              >
                                {badge}
                              </span>
                            )}
                          </div>

                          {ev.descricao && (
                            <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-snug line-clamp-2">
                              {ev.descricao}
                            </p>
                          )}

                          {/* Metadados */}
                          <div className="flex items-center gap-2 sm:gap-3 mt-2 flex-wrap">
                            {ev.horario && (
                              <span className="flex items-center gap-1 text-[11px] text-gray-400 font-semibold">
                                <Clock size={11} /> {ev.horario}
                              </span>
                            )}
                            {ev.local && (
                              <span className="flex items-center gap-1 text-[11px] text-gray-400 font-semibold">
                                <MapPin size={11} /> {ev.local}
                              </span>
                            )}
                            {ev.tipoEntrada && <BadgeEntrada tipo={ev.tipoEntrada} />}
                          </div>
                        </div>

                        {/* Indicador de clicável */}
                        <div className="flex items-center pr-3 sm:pr-4 pl-1 text-gray-300">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <p className="text-[11px] text-gray-400 text-center font-medium flex items-center justify-center gap-1">
              <AlertCircle size={10} /> Programação sujeita a alteração. Confirme com os organizadores.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
