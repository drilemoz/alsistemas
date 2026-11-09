/**
 * AdminMonitor.jsx — Monitor em Tempo Real
 *
 * Nova funcionalidade: painel de monitoramento com gráficos históricos
 * de CPU, RAM e V8 Heap coletados durante a sessão.
 *
 * - Coleta automática a cada 5s (configurável)
 * - Armazena até 60 pontos (~5 min de histórico)
 * - Gráficos SVG de linha com área preenchida
 * - Cards de status ao vivo com indicador pulsante
 * - Exporta histórico como JSON
 * - Link para página de Sistema para detalhes
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { infraestruturaService } from '../../services/api'
import { useSystemLogs } from '../../hooks/useSystemLogs'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { Spin } from '../../components/admin/infra/InfraBase'
import toast from 'react-hot-toast'

const MAX_PONTOS  = 60
const INTERVALO_PADRAO = 5000

// ── Gráfico de Área SVG ───────────────────────────────────────
function GraficoArea({ dados = [], cor = '#22c55e', label = '', unidade = '', altura = 80 }) {
  const largura = 500

  if (dados.length < 2) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: FONT.sm }}>
        Coletando dados…
      </div>
    )
  }

  const max = Math.max(...dados, 0.01)
  const pts = dados.map((v, i) => {
    const x = (i / (MAX_PONTOS - 1)) * largura
    const y = altura - (v / max) * (altura - 4)
    return [x, y]
  })

  const linhaPath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath  = `${linhaPath} L${pts[pts.length-1][0].toFixed(1)},${altura} L0,${altura} Z`

  const ultimo = dados[dados.length - 1]
  const penultimo = dados[dados.length - 2] ?? ultimo
  const tendencia = ultimo > penultimo ? '↑' : ultimo < penultimo ? '↓' : '→'
  const corTend   = ultimo > penultimo ? C.red : ultimo < penultimo ? '#22c55e' : C.muted

  // Linhas de grade: 25%, 50%, 75%
  const grades = [0.25, 0.5, 0.75].map(f => ({
    y: altura - f * (altura - 4),
    label: `${(max * f).toFixed(unidade === '%' ? 0 : 1)}${unidade}`,
  }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.sm }}>
        <span style={{ fontSize: FONT.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={{ fontSize: FONT.sm, color: corTend, fontWeight: 700 }}>{tendencia}</span>
          <span style={{ fontSize: FONT.xl - 4, fontWeight: 900, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {ultimo?.toFixed(unidade === '%' ? 1 : 2)}{unidade}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: altura, display: 'block' }}
        >
          {/* Linhas de grade */}
          {grades.map(({ y }, i) => (
            <line key={i} x1={0} y1={y} x2={largura} y2={y}
              stroke={C.border} strokeWidth="1" strokeDasharray="4 4" />
          ))}
          {/* Área */}
          <path d={areaPath} fill={`${cor}18`} />
          {/* Linha */}
          <path d={linhaPath} fill="none" stroke={cor} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
          {/* Ponto atual */}
          <circle
            cx={pts[pts.length - 1][0]}
            cy={pts[pts.length - 1][1]}
            r="3.5" fill={cor}
          />
        </svg>
        {/* Labels da grade */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 2 }}>
          {grades.reverse().map(({ label: gl }, i) => (
            <span key={i} style={{ fontSize: 9, color: C.muted, lineHeight: 1 }}>{gl}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Card de métrica ao vivo ───────────────────────────────────
function MetricaCard({ label, valor, unidade = '', cor = '#22c55e', sub, loading }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.xl, padding: `${SPACE.lg}px 14px`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: cor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: FONT.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: SPACE.xs }}>
          {label}
        </div>
        {/* Indicador pulsante */}
        {!loading && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: cor,
            display: 'inline-block', boxShadow: `0 0 0 3px ${cor}33`,
          }} />
        )}
      </div>
      <div style={{ fontSize: FONT.xl + 4, fontWeight: 900, color: loading ? C.muted : C.text, fontVariantNumeric: 'tabular-nums' }}>
        {loading ? '···' : `${valor}${unidade}`}
      </div>
      {sub && <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Linha de evento recente ───────────────────────────────────
function EventoRow({ tipo, msg, tempo, cor }) {
  return (
    <div style={{ display: 'flex', gap: SPACE.md, padding: `7px 0`, borderBottom: `1px solid ${C.border}`, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, fontSize: FONT.xs, fontWeight: 700, padding: '2px 6px',
        borderRadius: RADIUS.xs, background: `${cor}18`, color: cor,
        marginTop: 1,
      }}>{tipo}</span>
      <span style={{ flex: 1, fontSize: FONT.base, color: C.text, lineHeight: 1.4 }}>{msg}</span>
      <span style={{ fontSize: FONT.xs, color: C.muted, flexShrink: 0 }}>{tempo}</span>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function AdminMonitor() {
  const [snapshots,   setSnapshots]   = useState([])    // array de métricas históricas
  const [atual,       setAtual]       = useState(null)  // última leitura
  const [coletando,   setColetando]   = useState(false)
  const [iniciado,    setIniciado]    = useState(false)
  const [intervalo,   setIntervaloMs] = useState(INTERVALO_PADRAO)
  const [uptime,      setUptime]      = useState(0)     // segundos de monitoramento
  const logs = useSystemLogs({ limitErros: 6, limitAudit: 0 })

  const timerRef  = useRef(null)
  const uptimeRef = useRef(null)

  // Coleta uma leitura
  const coletar = useCallback(async () => {
    try {
      const dados = await infraestruturaService.sistemaMetricas()
      const snap = {
        ts:       Date.now(),
        cpuLoad:  dados.cpu?.loadAvg1min   ?? 0,
        cpuPct:   dados.cpu?.cores ? Math.min(100, (dados.cpu.loadAvg1min / dados.cpu.cores) * 100) : 0,
        ramPct:   dados.memoria?.usoPercentual ?? 0,
        heapPct:  dados.v8?.usoPercentual  ?? 0,
        ramUsada: dados.memoria?.usada      ?? 0,
        cores:    dados.cpu?.cores          ?? 1,
      }
      setAtual(dados)
      setSnapshots(prev => [...prev.slice(-(MAX_PONTOS - 1)), snap])
    } catch {
      // silencioso
    }
  }, [])

  // Iniciar/parar monitoramento
  function alternarMonitor() {
    if (iniciado) {
      clearInterval(timerRef.current)
      clearInterval(uptimeRef.current)
      setIniciado(false)
      toast('Monitor pausado')
    } else {
      setColetando(true)
      coletar().finally(() => setColetando(false))
      timerRef.current  = setInterval(coletar, intervalo)
      uptimeRef.current = setInterval(() => setUptime(p => p + 1), 1000)
      setIniciado(true)
      toast.success('Monitoramento iniciado')
    }
  }

  // Mudar intervalo sem reiniciar
  function mudarIntervalo(ms) {
    setIntervaloMs(ms)
    if (iniciado) {
      clearInterval(timerRef.current)
      timerRef.current = setInterval(coletar, ms)
    }
  }

  // Cleanup
  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearInterval(uptimeRef.current)
  }, [])

  // Exportar histórico
  function exportar() {
    const blob = new Blob([JSON.stringify({ snapshots, exportado_em: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `monitor_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Histórico exportado')
  }

  // Derivados para gráficos
  const serCpu    = snapshots.map(s => s.cpuPct)
  const serRam    = snapshots.map(s => s.ramPct)
  const serHeap   = snapshots.map(s => s.heapPct)
  const ultimoSnap = snapshots[snapshots.length - 1]

  function corCpu(v)  { return v > 80 ? C.red ?? '#ef4444' : v > 50 ? '#f59e0b' : '#22c55e' }
  function corMem(v)  { return v > 90 ? '#ef4444' : v > 75 ? '#f59e0b' : '#22c55e' }

  function fmtUptime(s) {
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  function fmtBytes(b) {
    if (!b) return '0 B'
    const u = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
    return `${b.toFixed(1)} ${u[i]}`
  }

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Monitor em Tempo Real</h1>
          <p className="adm-page-sub">
            Gráficos históricos de CPU, RAM e Heap coletados durante a sessão
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
          {iniciado && (
            <span style={{ fontSize: FONT.sm, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              ⏱ {fmtUptime(uptime)} · {snapshots.length} pontos
            </span>
          )}
          {snapshots.length > 0 && (
            <button onClick={exportar} style={{
              padding: '5px 12px', borderRadius: RADIUS.md, fontSize: FONT.sm,
              border: `1px solid ${C.border}`, background: 'transparent',
              cursor: 'pointer', color: C.muted, fontWeight: 600,
            }}>
              ↓ Exportar JSON
            </button>
          )}
          <button onClick={alternarMonitor} style={{
            padding: '6px 16px', borderRadius: RADIUS.md, fontSize: FONT.sm, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: iniciado ? '#ef444418' : '#22c55e18',
            color: iniciado ? '#ef4444' : '#22c55e',
          }}>
            {coletando ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Spin size={12} /> Iniciando…</span>
              : iniciado ? '⏸ Pausar' : '▶ Iniciar'}
          </button>
        </div>
      </div>

      {/* ── Intervalos ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE.md,
        padding: `${SPACE.md}px 14px`, borderRadius: RADIUS.lg,
        background: C.surface, border: `1px solid ${C.border}`,
        fontSize: FONT.sm, marginBottom: SPACE.xl2, flexWrap: 'wrap',
      }}>
        <span style={{ color: C.muted, fontWeight: 600 }}>Intervalo:</span>
        {[
          { label: '5s',  ms: 5000  },
          { label: '10s', ms: 10000 },
          { label: '30s', ms: 30000 },
          { label: '1min',ms: 60000 },
        ].map(op => (
          <button key={op.ms} onClick={() => mudarIntervalo(op.ms)} style={{
            padding: '3px 12px', borderRadius: RADIUS.pill, cursor: 'pointer', fontSize: FONT.sm,
            background: intervalo === op.ms ? '#22c55e' : C.border,
            color: intervalo === op.ms ? '#fff' : C.text,
            border: 'none', fontWeight: intervalo === op.ms ? 700 : 400,
            transition: 'all .15s',
          }}>{op.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: FONT.xs, color: C.muted }}>
          Máx. {MAX_PONTOS} pontos · ~{Math.round(MAX_PONTOS * intervalo / 60000)} min de histórico
        </span>
        <Link to="/admin/sistema" style={{ fontSize: FONT.sm, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
          Ver detalhes →
        </Link>
      </div>

      {/* ── Estado inicial ─────────────────────────────────── */}
      {!iniciado && snapshots.length === 0 && (
        <div style={{
          textAlign: 'center', padding: `${SPACE.xl5}px 0`,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: RADIUS.xl,
        }}>
          <div style={{ fontSize: 40, marginBottom: SPACE.xl }}>📊</div>
          <p style={{ fontSize: FONT.lg, fontWeight: 700, color: C.text, marginBottom: SPACE.md }}>
            Monitor pausado
          </p>
          <p style={{ fontSize: FONT.base, color: C.muted, marginBottom: SPACE.xl2 }}>
            Clique em <b>▶ Iniciar</b> para começar a coletar métricas em tempo real
          </p>
          <button onClick={alternarMonitor} style={{
            padding: '10px 28px', borderRadius: RADIUS.lg, fontSize: FONT.md, fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: '#22c55e', color: '#fff',
          }}>
            ▶ Iniciar Monitoramento
          </button>
        </div>
      )}

      {/* ── Cards de status ao vivo ────────────────────────── */}
      {snapshots.length > 0 && (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: SPACE.md, marginBottom: SPACE.xl2,
          }}>
            <MetricaCard
              label="CPU Load %"
              valor={ultimoSnap?.cpuPct?.toFixed(1) ?? '—'}
              unidade="%"
              cor={corCpu(ultimoSnap?.cpuPct ?? 0)}
              sub={`load ${ultimoSnap?.cpuLoad?.toFixed(2) ?? '—'} · ${ultimoSnap?.cores ?? '—'} cores`}
            />
            <MetricaCard
              label="RAM"
              valor={ultimoSnap?.ramPct?.toFixed(1) ?? '—'}
              unidade="%"
              cor={corMem(ultimoSnap?.ramPct ?? 0)}
              sub={fmtBytes(ultimoSnap?.ramUsada)}
            />
            <MetricaCard
              label="V8 Heap"
              valor={ultimoSnap?.heapPct?.toFixed(1) ?? '—'}
              unidade="%"
              cor={corMem(ultimoSnap?.heapPct ?? 0)}
            />
            <MetricaCard
              label="Erros (total)"
              valor={logs.contagemErros?.total ?? '—'}
              cor={logs.contagemErros?.nao_lidos > 0 ? '#ef4444' : '#22c55e'}
              sub={logs.contagemErros?.nao_lidos > 0 ? `${logs.contagemErros.nao_lidos} não lidos` : 'todos lidos'}
            />
          </div>

          {/* ── Gráficos ─────────────────────────────────────── */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: SPACE.xl, marginBottom: SPACE.xl2,
          }}>
            {[
              { dados: serCpu,  cor: corCpu(ultimoSnap?.cpuPct ?? 0),  label: 'CPU Load',  unidade: '%' },
              { dados: serRam,  cor: corMem(ultimoSnap?.ramPct ?? 0),  label: 'RAM',       unidade: '%' },
              { dados: serHeap, cor: corMem(ultimoSnap?.heapPct ?? 0), label: 'V8 Heap',   unidade: '%' },
            ].map(({ dados, cor, label, unidade }) => (
              <div key={label} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: RADIUS.xl, padding: SPACE.xl,
              }}>
                <GraficoArea dados={dados} cor={cor} label={label} unidade={unidade} altura={72} />
              </div>
            ))}
          </div>

          {/* ── Timeline de erros ────────────────────────────── */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: RADIUS.xl, padding: SPACE.xl,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg }}>
              <span style={{ fontSize: FONT.sm, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Erros Recentes
              </span>
              <Link to="/admin/erros" style={{ fontSize: FONT.sm, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                Ver todos →
              </Link>
            </div>
            {logs.loading
              ? <div style={{ display: 'flex', gap: SPACE.md, color: C.muted, fontSize: FONT.base }}><Spin size={14} /> Carregando…</div>
              : logs.erros.length === 0
                ? <div style={{ textAlign: 'center', padding: `${SPACE.xl2}px 0`, color: C.muted, opacity: .6 }}>✓ Nenhum erro</div>
                : logs.erros.map((e, i) => {
                    const diff = Date.now() - new Date(e.criado_em).getTime()
                    const m = Math.floor(diff / 60000)
                    const tempo = m < 1 ? 'agora' : m < 60 ? `${m}min` : `${Math.floor(m / 60)}h`
                    const corMap = { render: '#ef4444', js_error: '#f59e0b', unhandled_rejection: '#8b5cf6', api: '#2563eb' }
                    const cor = corMap[e.tipo] || C.muted
                    return (
                      <EventoRow
                        key={e._id ?? i}
                        tipo={e.tipo || 'erro'}
                        msg={e.mensagem || '(sem mensagem)'}
                        tempo={tempo}
                        cor={cor}
                      />
                    )
                  })
            }
          </div>
        </>
      )}
    </div>
  )
}
