/**
 * AdminErros.jsx — Monitor de Erros
 *
 * MIGRADO: DS Sprint
 *   - TipoBadge   → DSBadge (variant mapeado de TIPO_META)
 *   - StatusBadge → DSBadge (variant mapeado de STATUS_META)
 *   - StatsBar    → usa DSBadge em vez de spans inline
 *   - BulkToolbar → usa T.blue como background ao invés de hex
 *   - Cores hex   → tokens T.*
 *   - SPACE/RADIUS/FONT em todos os espaçamentos inline remanescentes
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { errosService } from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { formatarDataRelativa } from '../../utils/formatters'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSBadge } from '../../components/admin/ui/DS'

// ─── Constantes ──────────────────────────────────────────────
const TIPO_META = {
  render:              { label: 'Render',  variant: 'red'    },
  js_error:            { label: 'JS',      variant: 'amber'  },
  unhandled_rejection: { label: 'Promise', variant: 'purple' },
  api:                 { label: 'API',     variant: 'blue'   },
}
const STATUS_META = {
  novo:         { label: 'Novo',         variant: 'red'   },
  investigando: { label: 'Investigando', variant: 'amber' },
  resolvido:    { label: 'Resolvido',    variant: 'green' },
  ignorado:     { label: 'Ignorado',     variant: 'gray'  },
}
const TIPOS_FILTRO = [
  { key: '', label: 'Todos' },
  { key: 'render',              label: 'Render'  },
  { key: 'js_error',            label: 'JS'      },
  { key: 'unhandled_rejection', label: 'Promise' },
  { key: 'api',                 label: 'API'     },
]
const PERIODOS = [
  { value: '',    label: 'Todo período'     },
  { value: '24h', label: 'Últimas 24h'     },
  { value: '7d',  label: 'Últimos 7 dias'  },
  { value: '30d', label: 'Últimos 30 dias' },
]

// ─── ID helper ────────────────────────────────────────────────
const eid = (e) => String(e._id)

// ─── Badges — agora usa DSBadge ──────────────────────────────
function TipoBadge({ tipo }) {
  const m = TIPO_META[tipo] || { label: tipo, variant: 'gray' }
  return <DSBadge variant={m.variant}>{m.label}</DSBadge>
}
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.novo
  return <DSBadge variant={m.variant}>{m.label}</DSBadge>
}

// ─── Parse User-Agent ─────────────────────────────────────────
function parsearUA(ua) {
  if (!ua) return { browser: '—', os: '—', icone: '🌐' }
  const browsers = [
    { re: /Edg\/[\d.]+/,     nome: 'Edge',    icone: '🔷' },
    { re: /OPR\/[\d.]+/,     nome: 'Opera',   icone: '🔴' },
    { re: /Chrome\/[\d.]+/,  nome: 'Chrome',  icone: '🟡' },
    { re: /Firefox\/[\d.]+/, nome: 'Firefox', icone: '🦊' },
    { re: /Safari\/[\d.]+/,  nome: 'Safari',  icone: '🧭' },
  ]
  const sistemas = [
    { re: /Windows NT [\d.]+/, nome: 'Windows' },
    { re: /Mac OS X [\d_.]+/,  nome: 'macOS'   },
    { re: /Android [\d.]+/,    nome: 'Android' },
    { re: /iPhone OS [\d_]+/,  nome: 'iOS'     },
    { re: /Linux/,             nome: 'Linux'   },
  ]
  const b = browsers.find(b => b.re.test(ua))
  const s = sistemas.find(s => s.re.test(ua))
  return { browser: b?.nome || ua.slice(0, 40), os: s?.nome || '—', icone: b?.icone || '🌐' }
}

// ─── Helpers ──────────────────────────────────────────────────
function extrairFramePrincipal(stack) {
  if (!stack) return null
  const linha = stack.split('\n').find(l => l.includes('/src/'))
  if (!linha) return null
  const m = linha.match(/\((.+):(\d+):(\d+)\)/) || linha.match(/at (.+):(\d+):(\d+)/)
  return m ? { arquivo: m[1], linha: m[2], coluna: m[3] } : null
}
function gerarFingerprint(erro) {
  const frame = extrairFramePrincipal(erro.stack)
  const arquivo = frame?.arquivo?.split('/').pop() || 'desconhecido'
  return `${erro.mensagem}::${arquivo}`
}

// ─── Stack Trace ──────────────────────────────────────────────
function StackTrace({ stack }) {
  if (!stack) return <p style={{ color: C.muted }}>Sem stack trace</p>
  const linhas = stack.split('\n')
  return (
    <div style={{
      fontFamily: '"JetBrains Mono","Fira Code",monospace',
      fontSize: FONT.sm,
      lineHeight: 1.7,
      background: `${C.red}0d`,
      border: `1px solid ${C.redBorder}`,
      borderRadius: RADIUS.md,
      overflow: 'auto',
      maxHeight: 300,
    }}>
      <div style={{
        padding: `${SPACE.md}px 14px`,
        background: C.redBg,
        borderBottom: `1px solid ${C.redBorder}`,
        color: '#fca5a5',
        fontWeight: 700,
        wordBreak: 'break-word',
      }}>
        {linhas[0]}
      </div>
      <div style={{ padding: `${SPACE.md}px 0` }}>
        {linhas.slice(1).map((linha, i) => {
          const isSrc = linha.includes('/src/')
          const m = linha.match(/\((.+):(\d+):(\d+)\)$/) || linha.match(/at (.+):(\d+):(\d+)$/)
          return (
            <div key={i} style={{
              padding: `1px 14px`,
              color: isSrc ? '#fcd34d' : 'rgba(252,165,165,.5)',
              background: isSrc ? 'rgba(252,211,77,.08)' : 'transparent',
              display: 'flex', gap: SPACE.md, alignItems: 'baseline',
            }}>
              <span style={{ color: 'rgba(255,255,255,.2)', flexShrink: 0 }}>{i + 1}</span>
              {isSrc && m
                ? <span style={{ wordBreak: 'break-all' }}>
                    <span style={{ opacity: .6 }}>at </span>
                    <span style={{ color: '#86efac' }}>{m[1].split('/').pop()}</span>
                    <span style={{ opacity: .5 }}>:{m[2]}:{m[3]}</span>
                  </span>
                : <span style={{ opacity: .4, wordBreak: 'break-all' }}>{linha.replace(/^\s*at\s*/, '')}</span>
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetaItem({ label, value }) {
  return (
    <div style={{ background: 'var(--adm-surface)', borderRadius: RADIUS.md, padding: `${SPACE.md}px ${SPACE.lg}px`, border: '1px solid var(--adm-border)' }}>
      <div style={{ fontSize: FONT.xs, color: 'var(--adm-muted)', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: FONT.base, color: 'var(--adm-text)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

// ─── Barra de estatísticas — usa DSBadge ──────────────────────
function StatsBar({ erros }) {
  if (!erros.length) return null
  const byTipo   = Object.fromEntries(Object.keys(TIPO_META).map(k => [k, 0]))
  const byStatus = Object.fromEntries(Object.keys(STATUS_META).map(k => [k, 0]))
  erros.forEach(e => {
    if (byTipo[e.tipo]     !== undefined) byTipo[e.tipo]++
    if (byStatus[e.status] !== undefined) byStatus[e.status]++
    else byStatus.novo++
  })
  return (
    <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: SPACE.lg }}>
      {Object.entries(TIPO_META).map(([k, m]) => byTipo[k] > 0 && (
        <DSBadge key={k} variant={m.variant}>
          {m.label} {byTipo[k]}
        </DSBadge>
      ))}
      <span style={{ width: 1, background: 'var(--adm-border)', margin: `0 ${SPACE.xs}px` }} />
      {Object.entries(STATUS_META).map(([k, m]) => byStatus[k] > 0 && (
        <DSBadge key={k} variant={m.variant}>
          {m.label} {byStatus[k]}
        </DSBadge>
      ))}
    </div>
  )
}

// ─── Toolbar de seleção bulk ──────────────────────────────────
function BulkToolbar({ selected, onBulkStatus, onBulkDelete, onClear }) {
  if (selected.size === 0) return null
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: C.blue,
      color: '#fff',
      padding: `${SPACE.md + 2}px ${SPACE.xl}px`,
      display: 'flex', alignItems: 'center', gap: SPACE.md + 2,
      flexWrap: 'wrap',
      borderRadius: RADIUS.md,
      marginBottom: SPACE.md,
    }}>
      <span style={{ fontWeight: 700, fontSize: FONT.md }}>{selected.size} selecionado(s)</span>
      <div style={{ display: 'flex', gap: SPACE.sm, marginLeft: 'auto' }}>
        {Object.entries(STATUS_META).map(([k, m]) => (
          <button key={k} onClick={() => onBulkStatus(k)}
            style={{ padding: `${SPACE.xs}px ${SPACE.md + 2}px`, borderRadius: RADIUS.sm, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', fontSize: FONT.base, fontWeight: 600 }}>
            → {m.label}
          </button>
        ))}
        <button onClick={onBulkDelete}
          style={{ padding: `${SPACE.xs}px ${SPACE.md + 2}px`, borderRadius: RADIUS.sm, border: 'none', background: C.red, color: '#fff', cursor: 'pointer', fontSize: FONT.base, fontWeight: 700 }}>
          🗑 Excluir
        </button>
        <button onClick={onClear}
          style={{ padding: `${SPACE.xs}px ${SPACE.md + 2}px`, borderRadius: RADIUS.sm, border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: FONT.base }}>
          ✕ Limpar seleção
        </button>
      </div>
    </div>
  )
}

// ─── Row expandível ───────────────────────────────────────────
function ErroRow({ erro, onAtualizarStatus, onExcluir, selected, onToggleSelect }) {
  const [expandido, setExpandido] = useState(false)
  const [uaExpand,  setUaExpand]  = useState(false)
  const ua    = parsearUA(erro.user_agent)
  const frame = extrairFramePrincipal(erro.stack)
  const id    = eid(erro)

  async function copiarMarkdown() {
    const md = [
      `## Bug Report — ${new Date(erro.criado_em).toLocaleString('pt-BR')}`,
      `**Tipo:** ${erro.tipo}`,
      `**Mensagem:** ${erro.mensagem}`,
      `**URL:** ${erro.url || '—'}`,
      `**Rota:** ${erro.rota || '—'}`,
      `**Navegador:** ${ua.browser} — ${ua.os}`,
      `**Status:** ${STATUS_META[erro.status]?.label || 'Novo'}`,
      '', '### Stack Trace', '```', erro.stack || '(sem stack)', '```',
    ].join('\n')
    await navigator.clipboard.writeText(md)
    toast.success('Relatório copiado!')
  }

  return (
    <>
      <tr style={{ opacity: erro.status === 'resolvido' ? .55 : 1, background: selected ? `${C.blue}14` : 'transparent' }}>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.md}px`, width: 16 }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(id)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xs}px`, width: 12 }} onClick={() => setExpandido(e => !e)}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: erro.status === 'novo' ? C.red : 'transparent', border: erro.status !== 'novo' ? `1.5px solid var(--adm-border2)` : 'none' }} />
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.md}px` }} onClick={() => setExpandido(e => !e)}>
          <TipoBadge tipo={erro.tipo} />
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.md}px` }} onClick={() => setExpandido(e => !e)}>
          <StatusBadge status={erro.status || 'novo'} />
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xl}px`, maxWidth: 300, cursor: 'pointer' }} onClick={() => setExpandido(e => !e)}>
          <div style={{ fontSize: FONT.md, fontWeight: 500, color: 'var(--adm-text)', wordBreak: 'break-word' }}>{erro.mensagem}</div>
          <div style={{ display: 'flex', gap: SPACE.md, marginTop: 2, flexWrap: 'wrap' }}>
            {frame && <span style={{ fontSize: FONT.sm, color: '#fcd34d', opacity: .8 }}>{frame.arquivo.split('/').pop()}:{frame.linha}</span>}
            <span style={{ fontSize: FONT.sm, color: 'var(--adm-muted)' }}>{formatarDataRelativa(erro.criado_em)}</span>
            {erro.rota && <span style={{ fontSize: FONT.sm, color: 'var(--adm-muted)' }}>{erro.rota}</span>}
          </div>
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xl}px` }}>
          <div style={{ display: 'flex', gap: SPACE.xs, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button onClick={copiarMarkdown} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" title="Copiar Markdown">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <select value={erro.status || 'novo'} onChange={e => onAtualizarStatus(id, e.target.value)} className="adm-filter-select" style={{ fontSize: FONT.sm, padding: `2px ${SPACE.xs}px` }}>
              {Object.entries(STATUS_META).map(([val, m]) => <option key={val} value={val}>{m.label}</option>)}
            </select>
            <button onClick={() => onExcluir(id)} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" title="Excluir">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
            </button>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" style={{ color: 'var(--adm-muted)', transform: expandido ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} onClick={() => setExpandido(e => !e)}><path d="M6 9l6 6 6-6"/></svg>
          </div>
        </td>
      </tr>
      {expandido && (
        <tr style={{ background: 'rgba(0,0,0,.15)' }}>
          <td colSpan={6} style={{ padding: `0 ${SPACE.xl}px ${SPACE.xl}px` }}>
            <div style={{ paddingTop: SPACE.lg, display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: SPACE.md }}>
                <MetaItem label="🕐 Data/hora"        value={new Date(erro.criado_em).toLocaleString('pt-BR')} />
                <MetaItem label="🔗 URL"              value={erro.url || '—'} />
                <MetaItem label="👤 Usuário"          value={erro.usuario_email || '(não logado)'} />
                <MetaItem label={`${ua.icone} Navegador`} value={`${ua.browser} / ${ua.os}`} />
              </div>
              {erro.user_agent && (
                <div>
                  <button onClick={() => setUaExpand(v => !v)} style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {uaExpand ? '▲' : '▶'} User-Agent completo
                  </button>
                  {uaExpand && <pre style={{ marginTop: SPACE.sm, fontSize: FONT.xs, color: 'var(--adm-muted)', background: 'var(--adm-surface)', border: '1px solid var(--adm-border)', borderRadius: RADIUS.sm, padding: SPACE.sm, whiteSpace: 'pre-wrap' }}>{erro.user_agent}</pre>}
                </div>
              )}
              <div>
                <div style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', marginBottom: SPACE.sm, fontWeight: 600, textTransform: 'uppercase' }}>Stack Trace</div>
                <StackTrace stack={erro.stack} />
              </div>
              {erro.dados && Object.keys(erro.dados).length > 0 && (
                <div>
                  <div style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', marginBottom: SPACE.sm, fontWeight: 600, textTransform: 'uppercase' }}>Contexto</div>
                  <pre style={{ fontSize: FONT.sm, color: 'var(--adm-text)', background: 'var(--adm-surface)', border: '1px solid var(--adm-border)', borderRadius: RADIUS.md, padding: SPACE.md + 2, overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(erro.dados, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── GrupoRow ─────────────────────────────────────────────────
function GrupoRow({ grupo }) {
  const [expandido, setExpandido] = useState(false)
  const primeiro = grupo.exemplos[0]
  const frame    = extrairFramePrincipal(primeiro.stack)
  const ua       = parsearUA(primeiro.user_agent)

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpandido(e => !e)}>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.md}px`, width: 40 }}>
          <DSBadge variant="red">{grupo.count}</DSBadge>
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.md}px` }}><TipoBadge tipo={primeiro.tipo} /></td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xl}px`, maxWidth: 400 }}>
          <div style={{ fontSize: FONT.md, fontWeight: 500, color: 'var(--adm-text)' }}>{primeiro.mensagem}</div>
          <div style={{ display: 'flex', gap: SPACE.md, marginTop: 2, flexWrap: 'wrap' }}>
            {frame && <span style={{ fontSize: FONT.sm, color: '#fcd34d' }}>{frame.arquivo.split('/').pop()}:{frame.linha}</span>}
            <span style={{ fontSize: FONT.sm, color: 'var(--adm-muted)' }}>Última: {formatarDataRelativa(grupo.lastOccurrence)}</span>
          </div>
        </td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xl}px`, fontSize: FONT.sm, color: 'var(--adm-muted)' }}>{ua.browser} / {ua.os}</td>
        <td style={{ padding: `${SPACE.md + 2}px ${SPACE.xl}px` }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
            style={{ color: 'var(--adm-muted)', transform: expandido ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </td>
      </tr>
      {expandido && (
        <tr style={{ background: 'rgba(0,0,0,.1)' }}>
          <td colSpan={5} style={{ padding: `0 ${SPACE.xl}px ${SPACE.xl}px` }}>
            <div style={{ paddingTop: SPACE.lg }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Data', 'Navegador', 'Usuário', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: SPACE.md, fontSize: FONT.sm, color: 'var(--adm-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupo.exemplos.map(e => (
                    <tr key={eid(e)}>
                      <td style={{ padding: SPACE.sm, fontSize: FONT.base }}>{new Date(e.criado_em).toLocaleString('pt-BR')}</td>
                      <td style={{ padding: SPACE.sm, fontSize: FONT.base }}>{parsearUA(e.user_agent).browser}</td>
                      <td style={{ padding: SPACE.sm, fontSize: FONT.base }}>{e.usuario_email || '—'}</td>
                      <td style={{ padding: SPACE.sm }}><StatusBadge status={e.status || 'novo'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Página Principal ─────────────────────────────────────────
export default function AdminErros() {
  const [erros,         setErros]         = useState([])
  const [total,         setTotal]         = useState(0)
  const [naoLidos,      setNaoLidos]      = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [modoAgrupado,  setModoAgrupado]  = useState(true)
  const [filtroTipo,    setFiltroTipo]    = useState('')
  const [filtroStatus,  setFiltroStatus]  = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('')
  const [filtroOrigem,  setFiltroOrigem]  = useState('')
  const [filtroMsg,     setFiltroMsg]     = useState('')
  const [pagina,        setPagina]        = useState(1)
  const [selected,      setSelected]      = useState(new Set())
  const [confirm, setConfirm] = useState({ aberto: false, titulo: '', msg: '', fn: null, carregando: false })

  const errosFiltrados = useMemo(() => {
    let lista = erros
    if (filtroPeriodo) {
      const ms = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 }[filtroPeriodo]
      const limite = Date.now() - ms
      lista = lista.filter(e => new Date(e.criado_em).getTime() >= limite)
    }
    if (filtroOrigem.trim()) {
      const q = filtroOrigem.toLowerCase()
      lista = lista.filter(e => e.rota?.toLowerCase().includes(q) || e.url?.toLowerCase().includes(q))
    }
    if (filtroMsg.trim()) {
      const q = filtroMsg.toLowerCase()
      lista = lista.filter(e => e.mensagem?.toLowerCase().includes(q))
    }
    return lista
  }, [erros, filtroPeriodo, filtroOrigem, filtroMsg])

  const grupos = useMemo(() => {
    if (!modoAgrupado) return []
    const map = new Map()
    errosFiltrados.forEach(e => {
      const fp = gerarFingerprint(e)
      if (!map.has(fp)) map.set(fp, { fingerprint: fp, count: 0, exemplos: [], lastOccurrence: e.criado_em, firstOccurrence: e.criado_em })
      const g = map.get(fp)
      g.count++
      if (g.exemplos.length < 10) g.exemplos.push(e)
      if (new Date(e.criado_em) > new Date(g.lastOccurrence)) g.lastOccurrence = e.criado_em
    })
    return Array.from(map.values()).sort((a, b) => new Date(b.lastOccurrence) - new Date(a.lastOccurrence))
  }, [errosFiltrados, modoAgrupado])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: pagina, limit: 50 }
      if (filtroTipo)   params.tipo   = filtroTipo
      if (filtroStatus) params.status = filtroStatus
      const [res, cnt] = await Promise.all([errosService.listar(params), errosService.contagem()])
      setErros(res.erros ?? [])
      setTotal(res.total ?? 0)
      setNaoLidos(cnt.nao_lidos ?? 0)
    } catch (err) { toast.error(err.message) }
    finally      { setLoading(false) }
  }, [filtroTipo, filtroStatus, pagina])

  useEffect(() => { carregar() }, [carregar])

  async function handleAtualizarStatus(id, novoStatus) {
    try {
      await errosService.atualizarStatus(id, novoStatus)
      setErros(es => es.map(e => eid(e) === id ? { ...e, status: novoStatus } : e))
      toast.success('Status atualizado')
    } catch (err) { toast.error(err.message) }
  }

  function confirmar(titulo, msg, fn) {
    setConfirm({ aberto: true, titulo, msg, fn, carregando: false })
  }
  async function executarConfirm() {
    setConfirm(c => ({ ...c, carregando: true }))
    try {
      await confirm.fn()
      setConfirm({ aberto: false, titulo: '', msg: '', fn: null, carregando: false })
      setSelected(new Set())
      carregar()
    } catch (err) {
      toast.error(err.message)
      setConfirm(c => ({ ...c, carregando: false }))
    }
  }

  function handleExcluir(id) {
    confirmar('Excluir erro?', 'O registro será removido permanentemente.', async () => {
      await errosService.excluir(id)
      toast.success('Removido!')
    })
  }
  function handleLimpar(titulo, params) {
    confirmar(titulo, 'Essa ação não pode ser desfeita.', async () => {
      const r = await errosService.limpar(params)
      toast.success(`${r.removidos} erro(s) removido(s)!`)
    })
  }

  function handleToggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function handleToggleAll() {
    if (selected.size === errosFiltrados.length) setSelected(new Set())
    else setSelected(new Set(errosFiltrados.map(eid)))
  }
  function handleBulkStatus(status) {
    const ids = [...selected]
    confirmar(`Marcar ${ids.length} como ${STATUS_META[status].label}?`, '', async () => {
      const r = await errosService.bulkStatus(ids, status)
      toast.success(`${r.atualizados} atualizado(s)`)
    })
  }
  function handleBulkDelete() {
    const ids = [...selected]
    confirmar(`Excluir ${ids.length} erros?`, 'Esta ação não pode ser desfeita.', async () => {
      const r = await errosService.bulkDelete(ids)
      toast.success(`${r.removidos} removido(s)`)
    })
  }

  async function handleMarcarTodosLidos() {
    try {
      await errosService.marcarTodosLidos()
      setErros(es => es.map(e => ({ ...e, lido: true })))
      setNaoLidos(0)
      toast.success('Todos marcados como lidos!')
    } catch (err) { toast.error(err.message) }
  }

  function exportar(format = 'csv') {
    const dados = modoAgrupado ? grupos.flatMap(g => g.exemplos) : errosFiltrados
    if (format === 'csv') {
      const csv = ['Tipo,Status,Mensagem,Data,URL,Rota'].concat(
        dados.map(e => `"${e.tipo}","${e.status || 'novo'}","${e.mensagem.replace(/"/g, '""')}","${e.criado_em}","${e.url || ''}","${e.rota || ''}"`)
      ).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `erros_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
    } else {
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `erros_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
    }
    toast.success(`Exportado ${dados.length} registros`)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / 50))
  const listaExibida = modoAgrupado ? grupos : errosFiltrados

  return (
    <>
      <ConfirmModal
        aberto={confirm.aberto}
        titulo={confirm.titulo}
        mensagem={confirm.msg}
        labelConfirmar="Confirmar"
        carregando={confirm.carregando}
        onConfirmar={executarConfirm}
        onCancelar={() => setConfirm({ aberto: false, titulo: '', msg: '', fn: null, carregando: false })}
      />

      <div className="adm-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md + 2 }}>
            <div className="adm-page-title">Monitor de Erros</div>
            {naoLidos > 0 && <DSBadge variant="red">{naoLidos} novo{naoLidos !== 1 ? 's' : ''}</DSBadge>}
          </div>
          <div className="adm-page-sub">{total} erros registrados</div>
        </div>
        <div className="adm-page-actions" style={{ flexWrap: 'wrap', gap: SPACE.sm }}>
          <button onClick={() => setModoAgrupado(m => !m)} className="adm-btn adm-btn-secondary adm-btn-sm">
            {modoAgrupado ? '📋 Detalhado' : '📊 Agrupado'}
          </button>
          <button onClick={() => exportar('csv')}  className="adm-btn adm-btn-secondary adm-btn-sm">↓ CSV</button>
          <button onClick={() => exportar('json')} className="adm-btn adm-btn-secondary adm-btn-sm">↓ JSON</button>
          {naoLidos > 0 && (
            <button onClick={handleMarcarTodosLidos} className="adm-btn adm-btn-secondary adm-btn-sm">✓ Todos lidos</button>
          )}
          {total > 0 && (<>
            <button onClick={() => handleLimpar('Limpar erros resolvidos?', { status: 'resolvido' })}
              className="adm-btn adm-btn-sm" style={{ background: C.greenBg, color: C.greenSolid }}>
              Limpar resolvidos
            </button>
            <button onClick={() => handleLimpar('Limpar erros ignorados?', { status: 'ignorado' })}
              className="adm-btn adm-btn-sm" style={{ background: 'rgba(100,116,139,.12)', color: '#64748b' }}>
              Limpar ignorados
            </button>
            <button onClick={() => handleLimpar('Limpar todos os erros?', {})}
              className="adm-btn adm-btn-sm" style={{ background: C.redBg, color: C.red }}>
              Limpar tudo
            </button>
          </>)}
        </div>
      </div>

      <StatsBar erros={errosFiltrados} />
      <BulkToolbar selected={selected} onBulkStatus={handleBulkStatus} onBulkDelete={handleBulkDelete} onClear={() => setSelected(new Set())} />

      <div className="adm-card" style={{ marginBottom: 0 }}>
        <div className="adm-table-header" style={{ borderBottom: '1px solid var(--adm-border)', padding: `${SPACE.lg}px ${SPACE.xl}px`, gap: SPACE.md, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
            {TIPOS_FILTRO.map(({ key, label }) => (
              <button key={key} onClick={() => { setFiltroTipo(key); setPagina(1) }}
                className={`adm-btn adm-btn-sm${filtroTipo === key ? ' adm-btn-primary' : ' adm-btn-ghost'}`}>
                {label}
              </button>
            ))}
          </div>
          <select className="adm-filter-select" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(1) }}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_META).map(([val, m]) => <option key={val} value={val}>{m.label}</option>)}
          </select>
          <select className="adm-filter-select" value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)}>
            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input type="text" placeholder="Buscar na mensagem…" value={filtroMsg} onChange={e => setFiltroMsg(e.target.value)}
            style={{ background: 'var(--adm-surface2)', border: '1px solid var(--adm-border)', borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.lg}px`, fontSize: FONT.base, color: 'var(--adm-text)', outline: 'none', minWidth: 180 }} />
          <input type="text" placeholder="Filtrar por rota/URL…" value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}
            style={{ background: 'var(--adm-surface2)', border: '1px solid var(--adm-border)', borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.lg}px`, fontSize: FONT.base, color: 'var(--adm-text)', outline: 'none', minWidth: 160 }} />
          <button onClick={carregar} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" title="Atualizar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="adm-empty">
            <svg className="adm-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/>
            </svg>
          </div>
        ) : listaExibida.length === 0 ? (
          <div className="adm-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .2 }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p>Nenhum erro encontrado</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ minWidth: modoAgrupado ? 700 : 820 }}>
              <thead>
                <tr>
                  {!modoAgrupado && (
                    <th style={{ width: 40, padding: `${SPACE.md + 2}px ${SPACE.md}px` }}>
                      <input type="checkbox"
                        checked={selected.size > 0 && selected.size === errosFiltrados.length}
                        onChange={handleToggleAll}
                        style={{ width: 14, height: 14, cursor: 'pointer' }} />
                    </th>
                  )}
                  <th style={{ width: 20 }}></th>
                  <th style={{ width: 80 }}>Tipo</th>
                  {!modoAgrupado && <th style={{ width: 110 }}>Status</th>}
                  <th>Mensagem</th>
                  {modoAgrupado && <th style={{ width: 160 }}>Navegador</th>}
                  <th style={{ width: modoAgrupado ? 80 : 160 }}></th>
                </tr>
              </thead>
              <tbody>
                {modoAgrupado
                  ? grupos.map(g => <GrupoRow key={g.fingerprint} grupo={g} />)
                  : errosFiltrados.map(e => (
                    <ErroRow
                      key={eid(e)}
                      erro={e}
                      selected={selected.has(eid(e))}
                      onToggleSelect={handleToggleSelect}
                      onAtualizarStatus={handleAtualizarStatus}
                      onExcluir={handleExcluir}
                    />
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: SPACE.md, padding: `${SPACE.lg}px ${SPACE.xl}px`, borderTop: '1px solid var(--adm-border)' }}>
            <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1} className="adm-btn adm-btn-secondary adm-btn-sm">← Anterior</button>
            <span style={{ fontSize: FONT.base, color: 'var(--adm-muted)' }}>{pagina} / {totalPaginas}</span>
            <button onClick={() => setPagina(p => p + 1)} disabled={pagina >= totalPaginas} className="adm-btn adm-btn-secondary adm-btn-sm">Próximo →</button>
          </div>
        )}
      </div>
    </>
  )
}
