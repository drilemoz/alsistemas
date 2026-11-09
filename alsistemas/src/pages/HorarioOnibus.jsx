import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Bus, ArrowLeft, AlertCircle, Clock, MapPin,
  ArrowRight, Wifi, WifiOff,
} from 'lucide-react'
import { onibusService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'

// ─── Constantes ─────────────────────────────────────────────────
const DIAS_LABEL = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' }
const TODOS_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']

const DIA_IDX_MAP = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

// ─── Helpers de horário ─────────────────────────────────────────
function getDiaSemana() {
  return DIA_IDX_MAP[new Date().getDay()]
}

function horaParaMinutos(horaStr) {
  if (!horaStr) return -1
  const parts = horaStr.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10)
}

function minutosParaHHMM(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatarTempoRestante(diffMin) {
  if (diffMin <= 0) return 'Partindo agora'
  if (diffMin < 60) return `Em ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  if (m === 0) return `Em ${h}h`
  return `Em ${h}h ${m}min`
}

/** Retorna o próximo horário válido para hoje nesta linha */
function calcularProximoOnibus(linha) {
  const agora = new Date()
  const diaAtual = getDiaSemana()
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()

  const candidatos = (linha.horarios || [])
    .filter(h => h.dias?.includes(diaAtual))
    .map(h => ({ ...h, minutos: horaParaMinutos(h.hora) }))
    .filter(h => h.minutos >= minutosAgora)
    .sort((a, b) => a.minutos - b.minutos)

  if (!candidatos.length) return null

  const proximo = candidatos[0]
  return {
    hora: proximo.hora,
    diffMin: proximo.minutos - minutosAgora,
    observacao: proximo.observacao || null,
    totalHoje: candidatos.length,
  }
}

/** Retorna todos os horários de hoje, passados e futuros */
function horariosDeHoje(linha) {
  const diaAtual = getDiaSemana()
  const minutosAgora = new Date().getHours() * 60 + new Date().getMinutes()
  return (linha.horarios || [])
    .filter(h => h.dias?.includes(diaAtual))
    .map(h => ({ ...h, minutos: horaParaMinutos(h.hora) }))
    .sort((a, b) => a.minutos - b.minutos)
    .map(h => ({ ...h, passado: h.minutos < minutosAgora }))
}

// ─── Período / cor ───────────────────────────────────────────────
function getPeriodo(hora) {
  const h = parseInt(hora.split(':')[0], 10)
  if (h < 12) return { label: 'Manhã', bg: '#FFFBEB', text: '#92400E', dot: '#FBBF24' }
  if (h < 18) return { label: 'Tarde', bg: '#EFF6FF', text: '#1E40AF', dot: '#60A5FA' }
  return { label: 'Noite', bg: '#EEF2FF', text: '#3730A3', dot: '#818CF8' }
}

// ─── Card de próximo ônibus ──────────────────────────────────────
function ProximoOnibusCard({ linha, agora }) {
  const proximo = calcularProximoOnibus(linha)
  const cor = linha.cor || '#1B5E3B'

  if (!proximo) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3 text-sm font-semibold text-gray-400"
        style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
        <WifiOff size={16} className="flex-shrink-0" />
        <span>Sem mais partidas hoje nesta linha.</span>
      </div>
    )
  }

  const urgente = proximo.diffMin <= 15

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-4 transition-all"
      style={{
        background: urgente ? cor + '12' : '#F0FDF4',
        border: `1.5px solid ${urgente ? cor + '40' : '#BBF7D0'}`,
      }}
    >
      {/* Ícone */}
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: cor + '20' }}>
        <Bus size={20} style={{ color: cor }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">
          Próxima partida hoje
        </p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-black text-2xl leading-none" style={{ color: cor }}>
            {proximo.hora}
          </span>
          <span
            className="text-sm font-extrabold px-2.5 py-0.5 rounded-full"
            style={{
              background: urgente ? cor : '#16A34A',
              color: '#fff',
            }}
          >
            {formatarTempoRestante(proximo.diffMin)}
          </span>
        </div>
        {proximo.observacao && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <AlertCircle size={10} className="flex-shrink-0" />
            {proximo.observacao}
          </p>
        )}
        {proximo.totalHoje > 1 && (
          <p className="text-[11px] text-gray-400 mt-1">
            + {proximo.totalHoje - 1} partida{proximo.totalHoje - 1 > 1 ? 's' : ''} restante{proximo.totalHoje - 1 > 1 ? 's' : ''} hoje
          </p>
        )}
      </div>

      {/* Pulso vivo */}
      <div className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold"
        style={{ color: urgente ? cor : '#16A34A' }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: urgente ? cor : '#16A34A' }} />
          <span className="relative inline-flex rounded-full h-2 w-2"
            style={{ background: urgente ? cor : '#16A34A' }} />
        </span>
        Ao vivo
      </div>
    </div>
  )
}

// ─── Grade de horários do dia ─────────────────────────────────────
function HorariosDia({ linha }) {
  const hoje = horariosDeHoje(linha)
  if (!hoje.length) return (
    <p className="text-sm text-gray-400 text-center py-4">
      Nenhuma partida hoje nesta linha.
    </p>
  )

  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
        Horários de hoje
      </p>
      <div className="flex flex-wrap gap-2">
        {hoje.map((h, i) => {
          const per = getPeriodo(h.hora)
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: h.passado ? '#F9FAFB' : per.bg,
                color: h.passado ? '#9CA3AF' : per.text,
                textDecoration: h.passado ? 'line-through' : 'none',
                border: `1px solid ${h.passado ? '#F3F4F6' : per.dot + '40'}`,
                opacity: h.passado ? 0.7 : 1,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: h.passado ? '#D1D5DB' : per.dot }} />
              {h.hora}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Todos os horários (grid completo) ───────────────────────────
function TodosHorarios({ linha }) {
  const cor = linha.cor || '#1B5E3B'
  const horarios = [...(linha.horarios || [])].sort(
    (a, b) => horaParaMinutos(a.hora) - horaParaMinutos(b.hora)
  )

  if (!horarios.length) return (
    <p className="text-sm text-gray-400 text-center py-6">
      Nenhum horário cadastrado para esta linha.
    </p>
  )

  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
        Todos os horários
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {horarios.map((h, idx) => {
          const per = getPeriodo(h.hora)
          const diasTodos = TODOS_DIAS.every(d => h.dias?.includes(d))
          return (
            <div key={idx}
              className="rounded-xl p-3.5 flex items-center gap-3"
              style={{ background: per.bg, border: `1px solid ${per.dot}30` }}>
              {/* Horário */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 52 }}>
                <span className="font-black text-xl leading-none" style={{ color: per.text }}>
                  {h.hora}
                </span>
                <span className="text-[10px] font-semibold mt-0.5" style={{ color: per.text + 'CC' }}>
                  {per.label}
                </span>
              </div>

              {/* Separador */}
              <div className="w-px self-stretch" style={{ background: per.dot + '40' }} />

              {/* Dias */}
              <div className="flex-1 min-w-0">
                {diasTodos ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold
                                   px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Todos os dias
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {TODOS_DIAS.map(d => (
                      <span key={d}
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md transition-colors
                                    ${h.dias?.includes(d)
                                      ? 'bg-gray-800 text-white'
                                      : 'bg-gray-100 text-gray-300'}`}>
                        {DIAS_LABEL[d]}
                      </span>
                    ))}
                  </div>
                )}
                {h.observacao && (
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} className="flex-shrink-0" /> {h.observacao}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────
export default function HorarioOnibus() {
  const [linhas,   setLinhas]   = useState([])
  const [ativo,    setAtivo]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [agora,    setAgora]    = useState(new Date())
  const [abaView,  setAbaView]  = useState('hoje') // 'hoje' | 'todos'

  // Recarrega a hora a cada 30 segundos para manter o contador atualizado
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    onibusService.listar()
      .then(data => { setLinhas(data); setAtivo(0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Reseta a aba de visualização ao trocar de linha
  const selecionarLinha = useCallback((i) => {
    setAtivo(i)
    setAbaView('hoje')
  }, [])

  const linha = linhas[ativo]

  return (
    <div className="wrap py-6 sm:py-8 max-w-3xl">

      {/* Voltar */}
      <Link to="/"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-600
                   text-sm font-bold mb-6 transition-colors group">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Voltar para início
      </Link>

      {/* Título */}
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Bus size={20} className="text-brand-500" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl sm:text-2xl text-gray-900 leading-tight">
            Horário de Ônibus
          </h1>
          <p className="text-sm text-gray-500 font-medium">Iguatama e região</p>
        </div>
      </div>

      {loading && <LoadingSpinner texto="Carregando horários..." />}

      {!loading && linhas.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Bus size={44} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold">Nenhum horário cadastrado ainda.</p>
        </div>
      )}

      {!loading && linhas.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* ── Abas de linhas ── */}
          <div className="border-b border-gray-100 overflow-x-auto scrollbar-hide">
            <div className="flex gap-0 min-w-max">
              {linhas.map((l, i) => (
                <button key={l._id || l.id} onClick={() => selecionarLinha(i)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-extrabold whitespace-nowrap
                              border-b-2 transition-all duration-200
                              ${i === ativo
                                ? 'border-brand-500 text-brand-600 bg-brand-50'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: l.cor || '#1B5E3B' }} />
                  {l.destino}
                </button>
              ))}
            </div>
          </div>

          {/* ── Info da linha ── */}
          <div className="px-4 sm:px-5 py-4 flex items-center gap-3 bg-gray-50 border-b border-gray-100">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: (linha.cor || '#1B5E3B') + '18' }}>
              <Bus size={18} style={{ color: linha.cor || '#1B5E3B' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-900 text-sm leading-tight">
                {linha.origem || 'Iguatama'} <ArrowRight size={12} className="inline" /> {linha.destino}
              </p>
              {linha.empresa && (
                <p className="text-xs text-gray-400 mt-0.5">{linha.empresa}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400 font-semibold">{linha.horarios?.length || 0} partidas</p>
            </div>
          </div>

          {/* ── Próximo ônibus (tempo real) ── */}
          <div className="px-4 sm:px-5 pt-4">
            <ProximoOnibusCard linha={linha} agora={agora} />
          </div>

          {/* ── Seletor de visualização ── */}
          <div className="px-4 sm:px-5 pt-4 pb-1">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {[
                { key: 'hoje', label: 'Hoje' },
                { key: 'todos', label: 'Todos os horários' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAbaView(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all
                    ${abaView === key
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Conteúdo da aba ── */}
          <div className="px-4 sm:px-5 py-4">
            {abaView === 'hoje'
              ? <HorariosDia linha={linha} />
              : <TodosHorarios linha={linha} />
            }

            <p className="text-[11px] text-gray-400 mt-5 text-center font-medium flex items-center justify-center gap-1">
              <AlertCircle size={10} />
              Horários sujeitos a alteração. Confirme com a empresa de transporte.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
