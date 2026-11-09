/**
 * AdminAIAssistant.jsx — IA Assistant (Sprint 4)
 *
 * Sprint 4 — ADIÇÃO PURA.
 * Módulo de inteligência do AL Sistemas:
 *  - Overview de saúde do sistema
 *  - Alertas críticos
 *  - Cards de stats (projetos ativos/abandonados, repos desatualizados)
 *  - Comparação local ↔ GitHub
 *  - Chat com IA (Claude) — APENAS sugestões, sem execução automática
 *
 * UX: segue padrão AdminGitHub.jsx / AdminProjetos.jsx / AdminInfraestrutura.jsx
 */
import { useState, useRef, useEffect } from 'react'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import AdminIcon  from '../../components/admin/ui/AdminIcon'
import { useAnalysisOverview, useAIChat } from '../../modules/analysis/useAnalysis.js'
import { analysisService } from '../../services/domains/analysis.js'

/* ─── Utilitários ─────────────────────────────────────────────── */
function relTime(iso) {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1)   return 'hoje'
  if (d < 7)   return `${d}d atrás`
  if (d < 30)  return `${Math.floor(d / 7)}sem atrás`
  if (d < 365) return `${Math.floor(d / 30)}mo atrás`
  return `${Math.floor(d / 365)}a atrás`
}

/* ─── Componentes base ────────────────────────────────────────── */
function Spin() {
  return (
    <span style={{
      display:'inline-block', width:14, height:14, borderRadius:'50%',
      border:`2px solid ${C.border}`, borderTopColor: C.primary || C.accent,
      animation:'spin .7s linear infinite',
    }} />
  )
}

function SectionHead({ icon, title, action, badge }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:SPACE.xl }}>
      <div style={{ display:'flex', alignItems:'center', gap:SPACE.md }}>
        <span style={{ color: C.muted }}>{icon}</span>
        <span style={{ fontSize:FONT.sm, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'.08em' }}>{title}</span>
        {badge != null && badge > 0 && (
          <span style={{ fontSize:FONT.xs, fontWeight:800, color:'#fff', background:C.red, borderRadius:RADIUS.lg, padding:'1px 7px' }}>
            {badge}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

/* ─── Score de saúde ──────────────────────────────────────────── */
function HealthScore({ saude, loading }) {
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0' }}>
      <Spin /><span style={{ color:C.muted, fontSize:FONT.md }}>Analisando sistema…</span>
    </div>
  )

  const cor    = saude?.nivel?.cor  || C.accent
  const emoji  = saude?.nivel?.emoji || '⚪'
  const label  = saude?.nivel?.label || '—'
  const score  = saude?.score ?? 0
  const radius = 36
  const circ   = 2 * Math.PI * radius
  const prog   = (score / 100) * circ

  return (
    <div style={{ display:'flex', alignItems:'center', gap:20 }}>
      {/* Gauge circular */}
      <div style={{ position:'relative', width:90, height:90, flexShrink:0 }}>
        <svg width={90} height={90} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={45} cy={45} r={radius} fill="none" stroke={C.border} strokeWidth={7} />
          <circle
            cx={45} cy={45} r={radius} fill="none"
            stroke={cor} strokeWidth={7}
            strokeDasharray={`${prog} ${circ}`}
            strokeLinecap="round"
            style={{ transition:'stroke-dasharray .6s ease' }}
          />
        </svg>
        <div style={{
          position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
        }}>
          <span style={{ fontSize:20, fontWeight:900, color:cor, lineHeight:1 }}>{score}</span>
          <span style={{ fontSize:FONT.xs, color:C.muted, fontWeight:600 }}>/100</span>
        </div>
      </div>
      {/* Label + problemas */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:SPACE.sm, marginBottom:SPACE.sm }}>
          <span style={{ fontSize:16 }}>{emoji}</span>
          <span style={{ fontSize:15, fontWeight:800, color:cor }}>{label}</span>
        </div>
        {saude?.problemas?.length > 0 ? (
          <ul style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:3 }}>
            {saude.problemas.slice(0, 4).map((p, i) => (
              <li key={i} style={{ fontSize:FONT.sm, color:C.muted, display:'flex', alignItems:'center', gap:SPACE.sm }}>
                <span style={{ width:4, height:4, borderRadius:'50%', background:C.amber, flexShrink:0 }} />
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ fontSize:FONT.sm, color:C.greenSolid }}>✓ Sistema em boas condições</span>
        )}
      </div>
    </div>
  )
}

/* ─── Stat card ───────────────────────────────────────────────── */
function StatCard({ label, value, cor, sub, loading }) {
  return (
    <div style={{
      background:C.surface, border:`1px solid ${C.border}`, borderRadius:RADIUS.lg,
      padding:'14px 16px', position:'relative', overflow:'hidden',
    }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:cor, borderRadius:'10px 10px 0 0' }} />
      <div style={{ fontSize:FONT.xs, color:C.muted, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:SPACE.sm, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color:C.text, lineHeight:1 }}>
        {loading ? <span style={{ opacity:.3 }}>···</span> : (value ?? 0)}
      </div>
      {sub && <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:4 }}>{sub}</div>}
    </div>
  )
}

/* ─── Alerta card ─────────────────────────────────────────────── */
const SEV_COR = {
  critico: C.red, alto: C.orange, medio: C.amber, baixo: C.blue, info: C.purple,
}
const SEV_LABEL = {
  critico: 'CRÍTICO', alto: 'ALTO', medio: 'MÉDIO', baixo: 'BAIXO', info: 'INFO',
}

function AlertaCard({ alerta }) {
  const cor = SEV_COR[alerta.severidade] || C.muted
  return (
    <div style={{
      background:C.surface, border:`1px solid ${cor}30`,
      borderLeft:`3px solid ${cor}`, borderRadius:RADIUS.md,
      padding:'12px 14px', display:'flex', flexDirection:'column', gap:4,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:SPACE.md }}>
        <span style={{ fontSize:FONT.xs, fontWeight:800, color:cor, background:`${cor}18`, borderRadius:RADIUS.xs, padding:'2px 6px' }}>
          {SEV_LABEL[alerta.severidade] || alerta.severidade}
        </span>
        {alerta.projeto && (
          <span style={{ fontSize:FONT.xs, color:C.muted, fontFamily:'monospace' }}>{alerta.projeto}</span>
        )}
        {alerta.origem && (
          <span style={{ fontSize:FONT.xs, color:C.muted, background:`${C.muted}15`, borderRadius:RADIUS.xs, padding:'1px 5px' }}>
            {alerta.origem === 'github' ? 'GitHub' : 'Local'}
          </span>
        )}
      </div>
      <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>{alerta.titulo}</div>
      <div style={{ fontSize:FONT.sm, color:C.muted, lineHeight:1.4 }}>{alerta.descricao}</div>
      {alerta.sugestao && (
        <div style={{ fontSize:FONT.sm, color:C.blue, fontStyle:'italic', marginTop:2 }}>
          💡 {alerta.sugestao}
        </div>
      )}
    </div>
  )
}

/* ─── Projeto saúde row ───────────────────────────────────────── */
function ProjetoRow({ projeto }) {
  const cor = projeto.saude?.cor || C.muted
  const emoji = projeto.saude?.emoji || '⚪'
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 0', borderBottom:`1px solid ${C.border}`,
    }}>
      <span style={{ fontSize:14, flexShrink:0 }}>{emoji}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>{projeto.nome}</div>
        <div style={{ fontSize:FONT.xs, color:C.muted, display:'flex', gap:SPACE.sm, flexWrap:'wrap', marginTop:2 }}>
          <span>{projeto.tipo || 'desconhecido'}</span>
          {projeto.stack?.length > 0 && <span>· {projeto.stack.slice(0,2).join(', ')}</span>}
          {projeto.diasInatividade != null && <span>· {projeto.diasInatividade}d sem alteração</span>}
        </div>
      </div>
      {projeto.totalAlertas > 0 && (
        <span style={{
          fontSize:FONT.xs, fontWeight:800, color:C.red,
          background:'#ef444418', borderRadius:RADIUS.lg, padding:'2px 7px',
        }}>
          {projeto.totalAlertas} alerta{projeto.totalAlertas > 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

/* ─── Sync card ────────────────────────────────────────────────── */
function SyncStatus({ status }) {
  const MAP = {
    sincronizado:    { label:'Sincronizado',   cor:C.greenSolid, emoji:'✅' },
    atencao:         { label:'Atenção',         cor:C.amber, emoji:'⚠️' },
    divergente:      { label:'Divergente',      cor:C.red, emoji:'❌' },
    sem_repositorio: { label:'Sem repositório', cor:C.muted,   emoji:'❔' },
  }
  const meta = MAP[status] || { label: status, cor: C.muted, emoji: '❔' }
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:SPACE.sm,
      fontSize:FONT.sm, fontWeight:700, color:meta.cor,
      background:`${meta.cor}15`, border:`1px solid ${meta.cor}30`,
      borderRadius:RADIUS.sm, padding:'3px 10px',
    }}>
      {meta.emoji} {meta.label}
    </span>
  )
}

/* ─── Chat message ─────────────────────────────────────────────── */
function ChatMessage({ msg }) {
  const isUser  = msg.role === 'user'
  const isError = msg.role === 'error'
  const cor     = isUser ? C.accent : isError ? C.red : C.surface

  return (
    <div style={{
      display:'flex', flexDirection:'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap:4, marginBottom:SPACE.lg,
    }}>
      <div style={{
        maxWidth:'85%', borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding:'10px 14px',
        background: isUser ? `${cor}22` : isError ? '#ef444418' : C.surf2,
        border: `1px solid ${isUser ? `${cor}40` : isError ? '#ef444430' : C.border}`,
      }}>
        {!isUser && !isError && (
          <div style={{ fontSize:FONT.xs, fontWeight:700, color:C.accent, marginBottom:SPACE.sm, display:'flex', alignItems:'center', gap:SPACE.sm }}>
            <AdminIcon name="ia" size={11} /> AL Sistemas IA
          </div>
        )}
        <div style={{
          fontSize:FONT.base, color:C.text, lineHeight:1.55, whiteSpace:'pre-wrap',
          wordBreak:'break-word',
        }}>
          {msg.conteudo}
        </div>
        {msg.aviso && (
          <div style={{ fontSize:FONT.xs, color:C.muted, fontStyle:'italic', marginTop:6, paddingTop:6, borderTop:`1px solid ${C.border}` }}>
            ⚠️ {msg.aviso}
          </div>
        )}
      </div>
      <span style={{ fontSize:FONT.xs, color:C.muted }}>
        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PAINEL PRINCIPAL
═══════════════════════════════════════════════════════════════ */
const PERGUNTAS_SUGERIDAS = [
  'Qual projeto está mais desatualizado?',
  'Quais repos não recebem commits há mais de 30 dias?',
  'Qual projeto tem mais alertas críticos?',
  'Como está a saúde geral do sistema?',
  'Quais projetos precisam de atenção imediata?',
  'Existe algum repositório sem README?',
]

export default function AdminAIAssistant() {
  const { data, loading, erro, recarregar } = useAnalysisOverview()
  const { mensagens, loading: chatLoading, enviar, limpar } = useAIChat()

  const [abaAtiva,    setAbaAtiva]    = useState('overview')   // 'overview' | 'alertas' | 'projetos' | 'chat' | 'sync'
  const [pergunta,    setPergunta]    = useState('')
  const [syncNome,    setSyncNome]    = useState('')
  const [syncData,    setSyncData]    = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncErro,    setSyncErro]    = useState(null)

  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [mensagens, chatLoading])

  /* ── contexto passado para o chat ── */
  const contextoChat = data ? {
    projetos: data.projetos || [],
    repos:    data.repos    || [],
    saude:    data.saude,
  } : {}

  /* ── enviar pergunta ao chat ── */
  async function handleEnviar() {
    const q = pergunta.trim()
    if (!q || chatLoading) return
    setPergunta('')
    await enviar(q, contextoChat)
  }

  /* ── sync ── */
  async function handleSync() {
    const nome = syncNome.trim()
    if (!nome || syncLoading) return
    setSyncLoading(true)
    setSyncErro(null)
    setSyncData(null)
    try {
      const res = await analysisService.sync(nome)
      setSyncData(res)
    } catch (e) {
      setSyncErro(e.message)
    } finally {
      setSyncLoading(false)
    }
  }

  /* ── stats ── */
  const stats     = data?.stats
  const saude     = data?.saude
  const alertas   = data?.alertasCriticos || []
  const projetos  = data?.projetos || []
  const repos     = data?.repos    || []

  const ABA = [
    { id:'overview',  label:'Visão Geral',    icon:'server'  },
    { id:'alertas',   label:'Alertas',        icon:'alert',   badge: alertas.length },
    { id:'projetos',  label:'Projetos',       icon:'layers'  },
    { id:'chat',      label:'IA Chat',        icon:'ia'      },
    { id:'sync',      label:'Sync Local↔GH', icon:'git'     },
  ]

  return (
    <>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        .ai-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
        @media(max-width:900px) { .ai-grid-4 { grid-template-columns:repeat(2,1fr); } }
        @media(max-width:480px) { .ai-grid-4 { grid-template-columns:repeat(2,1fr); } }
        .ai-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
        @media(max-width:700px) { .ai-grid-2 { grid-template-columns:1fr; } }
        .ai-card { background:var(--adm-surface); border:1px solid var(--adm-border); border-radius:12px; padding:18px; }
        .ai-tab-btn {
          display:flex; align-items:center; gap:SPACE.smpx; padding:7px 14px;
          border-radius:8px; border:none; cursor:pointer; font-size:12px; font-weight:600;
          transition:all .15s; white-space:nowrap; position:relative;
        }
        .ai-tab-btn.active { color:#fff; }
        .ai-tab-btn:not(.active) { background:transparent; }
        .ai-chat-input {
          flex:1; background:transparent; border:none; outline:none;
          font-size:13px; color:var(--adm-text); resize:none;
        }
        .ai-chat-input::placeholder { color:var(--adm-muted); }
        .ai-send-btn {
          padding:8px 16px; border-radius:8px; border:none; cursor:pointer;
          font-size:12px; font-weight:700; color:#fff; transition:opacity .15s;
        }
        .ai-send-btn:hover { opacity:.85; }
        .ai-send-btn:disabled { opacity:.4; cursor:default; }
      `}</style>

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title" style={{ display:'flex', alignItems:'center', gap:SPACE.md }}>
            <AdminIcon name="ia" size={20} />
            IA Assistant
          </div>
          <div className="adm-page-sub">
            Análise inteligente de projetos locais e GitHub · Sprint 4
          </div>
        </div>
        <div style={{ display:'flex', gap:SPACE.md }}>
          {data?.saude && (
            <div style={{
              padding:'6px 14px', borderRadius:RADIUS.md, fontSize:FONT.base, fontWeight:700,
              background:`${data.saude.nivel.cor}14`, border:`1px solid ${data.saude.nivel.cor}30`,
              color:data.saude.nivel.cor, display:'flex', alignItems:'center', gap:SPACE.sm,
            }}>
              {data.saude.nivel.emoji} Score: {data.saude.score}/100
            </div>
          )}
          <button
            onClick={recarregar}
            disabled={loading}
            style={{
              display:'flex', alignItems:'center', gap:SPACE.sm, padding:'6px 14px',
              borderRadius:RADIUS.md, border:`1px solid ${C.border}`, background:C.surface,
              color:C.text, fontSize:FONT.base, fontWeight:600, cursor:'pointer',
            }}
          >
            {loading ? <Spin /> : <AdminIcon name="refresh" size={13} />}
            {loading ? 'Analisando…' : 'Reanalisar'}
          </button>
        </div>
      </div>

      {/* ── Aviso de erro geral ───────────────────────────────── */}
      {erro && !loading && (
        <div style={{
          background:'#ef444412', border:'1px solid #ef444430', borderRadius:RADIUS.lg,
          padding:`${SPACE.lg}px ${SPACE.xl}px`, marginBottom:SPACE.xl, fontSize:FONT.base, color:C.red,
        }}>
          ⚠️ {erro}
        </div>
      )}

      {/* ── Abas ─────────────────────────────────────────────── */}
      <div style={{
        display:'flex', gap:SPACE.sm, marginBottom:20, flexWrap:'wrap',
        background:C.surf2, border:`1px solid ${C.border}`, borderRadius:RADIUS.lg, padding:6,
      }}>
        {ABA.map(aba => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={`ai-tab-btn${abaAtiva === aba.id ? ' active' : ''}`}
            style={{
              background: abaAtiva === aba.id ? C.accent : 'transparent',
              color:      abaAtiva === aba.id ? '#fff'    : C.muted,
            }}
          >
            <AdminIcon name={aba.icon} size={13} />
            {aba.label}
            {aba.badge > 0 && (
              <span style={{
                position:'absolute', top:2, right:2,
                background:C.red, color:'#fff', fontSize:FONT.xs, fontWeight:800,
                borderRadius:RADIUS.lg, padding:'0 4px', minWidth:14, textAlign:'center',
              }}>
                {aba.badge > 99 ? '99+' : aba.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ABA: VISÃO GERAL
      ══════════════════════════════════════════════════════════ */}
      {abaAtiva === 'overview' && (
        <>
          {/* Score + stats */}
          <div className="ai-card" style={{ marginBottom:SPACE.xl }}>
            <SectionHead
              icon={<AdminIcon name="server" size={14} />}
              title="Saúde do Sistema"
            />
            <HealthScore saude={saude} loading={loading} />
          </div>

          <div className="ai-grid-4">
            <StatCard label="Projetos Ativos"    value={stats?.projetos?.ativos}     cor="#22c55e" loading={loading} sub="local" />
            <StatCard label="Proj. Abandonados"  value={stats?.projetos?.abandonados} cor="#ef4444" loading={loading} sub="local" />
            <StatCard label="Repos Desatualizados" value={stats?.repos?.abandonados} cor="#f97316" loading={loading} sub="GitHub" />
            <StatCard label="Alertas Críticos"   value={alertas.length}              cor="#8b5cf6" loading={loading} sub="sistema" />
          </div>

          {/* GitHub status */}
          {data && (
            <div style={{
              display:'flex', alignItems:'center', gap:SPACE.md, padding:'8px 14px',
              borderRadius:RADIUS.md, border:`1px solid ${C.border}`, background:C.surf2,
              marginBottom:SPACE.xl, fontSize:FONT.base,
            }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background: data.github?.disponivel ? C.greenSolid : C.amber, flexShrink:0 }} />
              <span style={{ color:C.muted }}>GitHub:</span>
              <span style={{ color:C.text, fontWeight:600 }}>
                {data.github?.disponivel
                  ? `${stats?.repos?.total || 0} repositórios · ${stats?.repos?.ativos || 0} ativos`
                  : data.github?.erro || 'Token não configurado'
                }
              </span>
            </div>
          )}

          {/* Top alertas */}
          {alertas.length > 0 && (
            <div className="ai-card">
              <SectionHead
                icon={<AdminIcon name="alert" size={14} />}
                title="Alertas Críticos"
                badge={alertas.length}
                action={
                  <button
                    onClick={() => setAbaAtiva('alertas')}
                    style={{ background:'none', border:'none', color:C.blue, fontSize:FONT.sm, cursor:'pointer', fontWeight:600 }}
                  >
                    Ver todos →
                  </button>
                }
              />
              <div style={{ display:'flex', flexDirection:'column', gap:SPACE.md }}>
                {alertas.slice(0,3).map((a, i) => <AlertaCard key={i} alerta={a} />)}
              </div>
            </div>
          )}

          {!loading && alertas.length === 0 && (
            <div className="ai-card" style={{ textAlign:'center', padding:'30px 0' }}>
              <div style={{ fontSize:28, marginBottom:SPACE.md }}>✅</div>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>Nenhum alerta crítico</div>
              <div style={{ fontSize:FONT.base, color:C.muted }}>O sistema está em boas condições</div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          ABA: ALERTAS
      ══════════════════════════════════════════════════════════ */}
      {abaAtiva === 'alertas' && (
        <div className="ai-card">
          <SectionHead
            icon={<AdminIcon name="alert" size={14} />}
            title="Todos os Alertas"
            badge={alertas.length}
          />
          {loading && (
            <div style={{ display:'flex', gap:SPACE.md, padding:'20px 0', color:C.muted }}>
              <Spin /> Analisando…
            </div>
          )}
          {!loading && alertas.length === 0 && (
            <div style={{ textAlign:'center', padding:'30px 0', color:C.muted, fontSize:FONT.md }}>
              ✅ Nenhum alerta crítico ou alto detectado
            </div>
          )}
          {!loading && alertas.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:SPACE.md }}>
              {alertas.map((a, i) => <AlertaCard key={i} alerta={a} />)}
            </div>
          )}

          {/* Alertas de projetos individuais (médio/baixo) */}
          {!loading && projetos.some(p => p.alertas?.length > 0) && (
            <>
              <div style={{ borderTop:`1px solid ${C.border}`, marginTop:16, paddingTop:16 }}>
                <span style={{ fontSize:FONT.sm, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'.07em' }}>
                  Alertas por Projeto Local
                </span>
              </div>
              {projetos.filter(p => p.alertas?.length > 0).map(p => (
                <div key={p.nome} style={{ marginTop:10 }}>
                  <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text, marginBottom:SPACE.sm, display:'flex', alignItems:'center', gap:SPACE.sm }}>
                    {p.saude?.emoji} {p.nome}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm, paddingLeft:16 }}>
                    {p.alertas.map((a, i) => <AlertaCard key={i} alerta={a} />)}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ABA: PROJETOS
      ══════════════════════════════════════════════════════════ */}
      {abaAtiva === 'projetos' && (
        <div className="ai-grid-2">
          {/* Projetos locais */}
          <div className="ai-card">
            <SectionHead
              icon={<AdminIcon name="layers" size={14} />}
              title={`Projetos Locais (${projetos.length})`}
            />
            {loading && <div style={{ display:'flex', gap:SPACE.md, color:C.muted }}><Spin /> Carregando…</div>}
            {!loading && projetos.length === 0 && (
              <div style={{ textAlign:'center', padding:'20px 0', color:C.muted, fontSize:FONT.base }}>
                Nenhum projeto local encontrado
              </div>
            )}
            {!loading && projetos.map(p => <ProjetoRow key={p.nome} projeto={p} />)}
          </div>

          {/* Repos GitHub */}
          <div className="ai-card">
            <SectionHead
              icon={<AdminIcon name="git" size={14} />}
              title={`Repositórios GitHub (${repos.length})`}
            />
            {loading && <div style={{ display:'flex', gap:SPACE.md, color:C.muted }}><Spin /> Carregando…</div>}
            {!loading && !data?.github?.disponivel && (
              <div style={{ textAlign:'center', padding:'20px 0', color:C.muted, fontSize:FONT.base }}>
                <div style={{ fontSize:24, marginBottom:SPACE.md }}>🔑</div>
                {data?.github?.erro || 'GITHUB_TOKEN não configurado'}
              </div>
            )}
            {!loading && data?.github?.disponivel && repos.map(r => (
              <div key={r.nome} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 0', borderBottom:`1px solid ${C.border}`,
              }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{r.saude?.emoji || '⚪'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>{r.nome}</div>
                  <div style={{ fontSize:FONT.xs, color:C.muted, display:'flex', gap:SPACE.sm, marginTop:2 }}>
                    {r.linguagem && <span>{r.linguagem}</span>}
                    {r.diasInatividade != null && <span>· {r.diasInatividade}d sem commit</span>}
                    {r.stars > 0 && <span>· ★ {r.stars}</span>}
                  </div>
                </div>
                {r.arquivado && (
                  <span style={{ fontSize:FONT.xs, color:C.muted, background:`${C.muted}15`, borderRadius:RADIUS.xs, padding:'2px 6px', fontWeight:600 }}>
                    ARQUIVADO
                  </span>
                )}
                {r.totalAlertas > 0 && (
                  <span style={{
                    fontSize:FONT.xs, fontWeight:800, color:C.amber,
                    background:'#f59e0b18', borderRadius:RADIUS.lg, padding:'2px 7px',
                  }}>
                    {r.totalAlertas}⚠
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ABA: IA CHAT
      ══════════════════════════════════════════════════════════ */}
      {abaAtiva === 'chat' && (
        <div className="ai-card" style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 280px)', minHeight:400 }}>
          <SectionHead
            icon={<AdminIcon name="ia" size={14} />}
            title="IA Assistant — Chat"
            action={
              mensagens.length > 0 && (
                <button
                  onClick={limpar}
                  style={{ background:'none', border:'none', color:C.muted, fontSize:FONT.sm, cursor:'pointer', fontWeight:600 }}
                >
                  Limpar conversa
                </button>
              )
            }
          />

          {/* Aviso de segurança */}
          <div style={{
            background:'#3b82f618', border:'1px solid #3b82f630', borderRadius:RADIUS.md,
            padding:'8px 12px', marginBottom:SPACE.lg, fontSize:FONT.sm, color:C.blue,
          }}>
            🔒 A IA apenas analisa e sugere. Nenhuma ação é executada automaticamente.
            Todas as consultas são registradas no AuditLog.
          </div>

          {/* Histórico */}
          <div style={{ flex:1, overflowY:'auto', marginBottom:SPACE.lg }}>
            {mensagens.length === 0 && !chatLoading && (
              <div>
                <div style={{ textAlign:'center', padding:'20px 0', color:C.muted, fontSize:FONT.base, marginBottom:SPACE.xl }}>
                  <div style={{ fontSize:32, marginBottom:SPACE.md }}>🧠</div>
                  <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:4 }}>Olá! Sou o IA Assistant</div>
                  Pergunta sobre seus projetos locais e repositórios GitHub.
                </div>
                {/* Sugestões */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:SPACE.sm }}>
                  {PERGUNTAS_SUGERIDAS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setPergunta(q)}
                      style={{
                        padding:'6px 12px', borderRadius:RADIUS.md,
                        border:`1px solid ${C.border}`, background:C.surf2,
                        color:C.text, fontSize:FONT.sm, cursor:'pointer',
                        transition:'all .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor=C.accent}
                      onMouseLeave={e => e.currentTarget.style.borderColor=C.border}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensagens.map((m, i) => <ChatMessage key={i} msg={m} />)}

            {chatLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:SPACE.md, color:C.muted, fontSize:FONT.base, padding:'8px 0' }}>
                <Spin /> IA analisando…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            display:'flex', gap:SPACE.md, alignItems:'flex-end',
            background:C.surf2, border:`1px solid ${C.border}`, borderRadius:RADIUS.lg, padding:'10px 14px',
          }}>
            <textarea
              className="ai-chat-input"
              rows={2}
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
              placeholder="Pergunte sobre seus projetos…"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }
              }}
            />
            <button
              onClick={handleEnviar}
              disabled={!pergunta.trim() || chatLoading}
              className="ai-send-btn"
              style={{ background:C.accent }}
            >
              {chatLoading ? <Spin /> : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          ABA: SYNC LOCAL ↔ GITHUB
      ══════════════════════════════════════════════════════════ */}
      {abaAtiva === 'sync' && (
        <div className="ai-card">
          <SectionHead
            icon={<AdminIcon name="git" size={14} />}
            title="Sincronização Local ↔ GitHub"
          />

          <div style={{ fontSize:FONT.base, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
            Compare um projeto local com seu repositório GitHub correspondente.
            Detecta diferenças de atividade, commits pendentes e divergências estruturais.
          </div>

          {/* Input de nome do projeto */}
          <div style={{ display:'flex', gap:SPACE.md, marginBottom:SPACE.xl }}>
            <div style={{ flex:1 }}>
              <input
                value={syncNome}
                onChange={e => setSyncNome(e.target.value)}
                placeholder="Nome do projeto local (ex: meu-projeto)"
                onKeyDown={e => e.key === 'Enter' && handleSync()}
                list="projetos-list"
                style={{
                  width:'100%', padding:'9px 14px', borderRadius:RADIUS.md,
                  border:`1px solid ${C.border}`, background:C.surf2,
                  color:C.text, fontSize:FONT.md, outline:'none', boxSizing:'border-box',
                }}
              />
              <datalist id="projetos-list">
                {projetos.map(p => <option key={p.nome} value={p.nome} />)}
              </datalist>
            </div>
            <button
              onClick={handleSync}
              disabled={!syncNome.trim() || syncLoading}
              style={{
                padding:'9px 18px', borderRadius:RADIUS.md, border:'none',
                background:C.accent, color:'#fff', fontSize:FONT.md, fontWeight:700,
                cursor:'pointer', display:'flex', alignItems:'center', gap:SPACE.sm, flexShrink:0,
                opacity: (!syncNome.trim() || syncLoading) ? .5 : 1,
              }}
            >
              {syncLoading ? <Spin /> : <AdminIcon name="git" size={13} />}
              {syncLoading ? 'Analisando…' : 'Analisar'}
            </button>
          </div>

          {/* Atalhos: projetos locais disponíveis */}
          {projetos.length > 0 && !syncData && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:SPACE.sm, marginBottom:SPACE.xl }}>
              {projetos.slice(0, 8).map(p => (
                <button
                  key={p.nome}
                  onClick={() => setSyncNome(p.nome)}
                  style={{
                    padding:'4px 10px', borderRadius:RADIUS.sm, border:`1px solid ${C.border}`,
                    background:C.surf2, color:C.muted, fontSize:FONT.sm, cursor:'pointer',
                  }}
                >
                  {p.saude?.emoji} {p.nome}
                </button>
              ))}
            </div>
          )}

          {syncErro && (
            <div style={{
              background:'#ef444412', border:'1px solid #ef444430', borderRadius:RADIUS.md,
              padding:'10px 14px', fontSize:FONT.base, color:C.red, marginBottom:SPACE.xl,
            }}>
              ⚠️ {syncErro}
            </div>
          )}

          {/* Resultado da sync */}
          {syncData && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Status geral */}
              <div style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'14px 16px', borderRadius:RADIUS.lg, background:C.surf2, border:`1px solid ${C.border}`,
              }}>
                <SyncStatus status={syncData.statusSync} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>
                    {syncData.resumo?.local?.nome || syncNome}
                  </div>
                  <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:2 }}>
                    Local: {syncData.diasLocal != null ? `${syncData.diasLocal}d sem alteração` : '?'}
                    {syncData.github?.disponivel !== false && syncData.diasGitHub != null &&
                      ` · GitHub: ${syncData.diasGitHub}d sem commit`
                    }
                  </div>
                </div>
                {syncData.repo && (
                  <a
                    href={syncData.repo.url}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize:FONT.sm, color:C.blue, textDecoration:'none', fontWeight:600 }}
                  >
                    Ver no GitHub →
                  </a>
                )}
              </div>

              {/* Info dos lados */}
              <div className="ai-grid-2">
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:RADIUS.lg, padding:'12px 14px' }}>
                  <div style={{ fontSize:FONT.xs, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:SPACE.md }}>📁 Local</div>
                  {syncData.resumo?.local && (
                    <>
                      <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>{syncData.resumo.local.nome}</div>
                      <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:4 }}>
                        Stack: {(syncData.resumo.local.stack || []).join(', ') || '—'}
                      </div>
                      <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:2 }}>
                        Última alteração: {syncData.resumo.local.ultimaAlteracao ? relTime(syncData.resumo.local.ultimaAlteracao) : '—'}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:RADIUS.lg, padding:'12px 14px' }}>
                  <div style={{ fontSize:FONT.xs, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:SPACE.md }}>🐙 GitHub</div>
                  {syncData.repo ? (
                    <>
                      <div style={{ fontSize:FONT.base, fontWeight:700, color:C.text }}>{syncData.repo.nome}</div>
                      <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:4 }}>
                        Linguagem: {syncData.repo.linguagem || '—'}
                      </div>
                      <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:2 }}>
                        Último commit: {syncData.repo.ultimaAtualizacao ? relTime(syncData.repo.ultimaAtualizacao) : '—'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize:FONT.base, color:C.muted, fontStyle:'italic' }}>
                      {syncData.github?.erro || 'Repositório não encontrado'}
                    </div>
                  )}
                </div>
              </div>

              {/* Divergências */}
              {syncData.divergencias?.length > 0 && (
                <div>
                  <div style={{ fontSize:FONT.sm, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:SPACE.md }}>
                    Divergências Detectadas
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:SPACE.md }}>
                    {syncData.divergencias.map((d, i) => <AlertaCard key={i} alerta={d} />)}
                  </div>
                </div>
              )}

              {/* Commits recentes do GitHub */}
              {syncData.commits?.length > 0 && (
                <div>
                  <div style={{ fontSize:FONT.sm, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:SPACE.md }}>
                    Commits Recentes no GitHub
                  </div>
                  {syncData.commits.slice(0,5).map((c, i) => (
                    <div key={i} style={{
                      display:'flex', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}`,
                    }}>
                      <span style={{ fontFamily:'monospace', fontSize:FONT.xs, color:C.purple, flexShrink:0, paddingTop:2 }}>{c.sha}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:FONT.base, color:C.text, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.mensagem}</div>
                        <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>{c.autor} · {relTime(c.data)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {syncData.statusSync === 'sincronizado' && syncData.divergencias?.length === 0 && (
                <div style={{ textAlign:'center', padding:'16px 0', color:C.greenSolid, fontSize:FONT.md, fontWeight:700 }}>
                  ✅ Projeto local e GitHub estão sincronizados
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
