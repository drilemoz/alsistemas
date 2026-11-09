/**
 * AdminDashboard.jsx — v4 (DS-compliant)
 *
 * Correções v4:
 *   - Paleta P (hardcoded dark) → tokens T do Design System (CSS variables)
 *   - Removido override de fundo/cor que quebrava o sistema de temas
 *   - Grids responsivos: repeat(4,1fr) → repeat(auto-fill, minmax(140px,1fr))
 *   - Hero section: font clampada + layout sem overflow no mobile
 *   - Nenhum elemento estoura a tela em qualquer viewport
 */
import { useState, useEffect, useRef }   from 'react'
import { Link }                           from 'react-router-dom'
import { useSystemHealth }                from '../../hooks/useSystemHealth'
import { useSystemLogs }                  from '../../hooks/useSystemLogs'
import { useUsersStats }                  from '../../hooks/useUsersStats'
import { useGitHubRepos }                 from '../../modules/github/useGitHubRepos'
import { useProjetos }                    from '../../modules/projetos/useProjetos'
import { useAnalysisOverview }            from '../../modules/analysis/useAnalysis.js'
import { useNoticias }                    from '../../hooks/useNoticias'
import { useEventos }                     from '../../hooks/useEventos'
import { T as C, SPACE, RADIUS, FONT }   from '../../themes/tokens'

/* ─── CSS injetado (apenas animações + classes sem cor hardcoded) ─ */
const GLOBAL_CSS = `
  .db-wrap {
    position: relative;
    overflow-x: hidden;
    min-width: 0;
  }
  .db-inner {
    position: relative;
    z-index: 1;
    padding: 0 0 32px;
    max-width: 1200px;
    box-sizing: border-box;
    width: 100%;
  }

  /* Animações de entrada staggered */
  @keyframes db-in {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .db-fade { opacity: 0; animation: db-in .45s ease forwards; }
  .db-d1   { animation-delay: .04s; }
  .db-d2   { animation-delay: .10s; }
  .db-d3   { animation-delay: .16s; }
  .db-d4   { animation-delay: .22s; }
  .db-d5   { animation-delay: .28s; }
  .db-d6   { animation-delay: .34s; }
  .db-d7   { animation-delay: .40s; }
  .db-d8   { animation-delay: .46s; }

  /* Card base — cores via CSS vars do tema */
  .db-card {
    background: var(--adm-surface, #fff);
    border: 1px solid var(--adm-border, #e8e3dc);
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    transition: border-color .18s, box-shadow .18s;
    min-width: 0;
  }
  .db-card:hover {
    border-color: var(--adm-border2, #d4cec6);
    box-shadow: 0 4px 20px rgba(0,0,0,.07);
  }

  .db-command-hero {
    background:
      radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--adm-accent) 22%, transparent), transparent 34%),
      radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--adm-blue, #3b82f6) 16%, transparent), transparent 30%),
      var(--adm-surface, #fff);
    border: 1px solid color-mix(in srgb, var(--adm-accent) 28%, var(--adm-border));
    box-shadow: 0 18px 55px rgba(0,0,0,.08);
  }
  .db-command-hero::after {
    content: '';
    position: absolute;
    width: 220px; height: 220px;
    right: -90px; bottom: -140px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--adm-accent) 24%, transparent);
    pointer-events: none;
  }
  .db-kicker {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 9px; border-radius: 999px;
    background: color-mix(in srgb, var(--adm-accent) 11%, transparent);
    border: 1px solid color-mix(in srgb, var(--adm-accent) 25%, transparent);
  }

  /* Barra de acento no topo do card */
  .db-card-top::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: var(--db-accent, var(--adm-accent));
    opacity: .7;
    transition: opacity .18s;
  }
  .db-card:hover .db-card-top::before { opacity: 1; }

  /* Status dot pulsante */
  @keyframes db-pulse {
    0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
    50%       { box-shadow: 0 0 0 4px transparent; opacity: .75; }
  }
  .db-pulse { animation: db-pulse 2.4s ease infinite; }

  /* Animação de tick nos números */
  @keyframes db-tick {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .db-tick { animation: db-tick .25s ease; }

  /* Linha de tabela */
  .db-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--adm-border, #e8e3dc);
    min-width: 0;
  }
  .db-row:last-child { border-bottom: none; }

  /* Scrollbar */
  .db-scroll::-webkit-scrollbar { width: 3px; }
  .db-scroll::-webkit-scrollbar-track { background: transparent; }
  .db-scroll::-webkit-scrollbar-thumb {
    background: var(--adm-border, #e8e3dc);
    border-radius: 4px;
  }

  /* Barra de progresso */
  .db-bar-wrap {
    height: 2px;
    background: var(--adm-border, #e8e3dc);
    border-radius: 99px;
    overflow: hidden;
  }
  .db-bar-fill {
    height: 100%;
    border-radius: 99px;
    transition: width .7s cubic-bezier(.4,0,.2,1);
  }

  /* Chip / badge */
  .db-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 7px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid;
    letter-spacing: .03em;
    flex-shrink: 0;
  }

  /* Link sutil */
  .db-link {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: var(--adm-muted, #78716c);
    text-decoration: none;
    transition: color .15s;
  }
  .db-link:hover { color: var(--adm-text, #1c1c1e); }

  /* Grid de módulos */
  .db-mod-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 8px;
  }

  /* Grid de 4 stats — responsivo */
  .db-stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  /* Grid de 2 colunas — colapsa para 1 no mobile */
  .db-two-col {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }

  /* Hero — layout flex responsivo */
  .db-hero-body {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .db-hero-num {
    font-size: clamp(40px, 8vw, 76px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
    word-break: break-all;
  }
  .db-hero-stats {
    display: flex;
    flex: 1;
    gap: 20px;
    flex-wrap: wrap;
    min-width: 0;
    padding-top: 4px;
  }
  .db-hero-stat {
    min-width: 0;
    flex-shrink: 0;
  }
  .db-hero-stat-val {
    font-size: clamp(18px, 4vw, 26px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 480px) {
    .db-inner { padding: 0 0 24px; }
    .db-hero-stats { gap: 14px; }
    .db-stat-grid { grid-template-columns: repeat(2, 1fr); }
  }
`

/* ─── Helpers ──────────────────────────────────────────────────── */
function fmt(n) { return (n ?? 0).toLocaleString('pt-BR') }

function RelTime({ iso }) {
  if (!iso) return <span style={{ color: C.muted }}>—</span>
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1)  return <span style={{ color: C.greenSolid }}>agora</span>
  if (m < 60) return <span style={{ color: C.muted, fontSize: 11 }}>{m}m</span>
  if (h < 24) return <span style={{ color: C.muted, fontSize: 11 }}>{h}h</span>
  return <span style={{ color: C.muted, fontSize: 11 }}>{d}d</span>
}

function Dot({ color, pulse }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, color, flexShrink: 0,
    }} className={pulse ? 'db-pulse' : ''} />
  )
}

function AnimNum({ value, loading }) {
  const [displayed, setDisplayed] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    if (value !== prev.current) { setDisplayed(value); prev.current = value }
  }, [value])
  if (loading) return <span style={{ color: C.muted }}>···</span>
  return <span key={displayed} className="db-tick">{fmt(displayed)}</span>
}

/* ─── Card de stat ─────────────────────────────────────────────── */
function StatCard({ label, value, sub, accent = C.blue, icon, loading, delay = 'db-d3', to }) {
  const content = (
    <div className={`db-card db-card-top db-fade ${delay}`}
      style={{ '--db-accent': accent, padding: `${SPACE.xl}px`, cursor: to ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.md }}>
        <span style={{ fontSize: FONT.xs, fontWeight: 700, letterSpacing: '.07em',
          textTransform: 'uppercase', color: C.muted }}>
          {label}
        </span>
        {icon && <span style={{ color: accent, opacity: .8, fontSize: 14 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: FONT.stat, fontWeight: 800, color: C.text, lineHeight: 1, marginBottom: SPACE.xs,
        fontVariantNumeric: 'tabular-nums' }}>
        {loading ? <span style={{ color: C.muted }}>···</span> : fmt(value ?? 0)}
      </div>
      {sub && <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 2 }}>{sub}</div>}
      <div className="db-bar-wrap" style={{ marginTop: SPACE.md }}>
        <div className="db-bar-fill" style={{ width: loading ? '0%' : '100%',
          background: `linear-gradient(90deg, ${accent}60, ${accent})` }} />
      </div>
    </div>
  )
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link> : content
}

/* ─── Chip de serviço ──────────────────────────────────────────── */
function SvcChip({ label, ok, loading }) {
  const cor = loading ? C.muted : ok ? C.greenSolid : C.red
  const bg  = loading ? C.surface2 : ok ? C.greenBg : C.redBg
  return (
    <span className="db-chip" style={{ background: bg, borderColor: cor + '44', color: cor }}>
      <Dot color={cor} pulse={ok && !loading} />
      {label}
    </span>
  )
}

/* ─── Botão de módulo ──────────────────────────────────────────── */
function ModBtn({ to, label, icon, accent = C.muted, badge }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.lg,
        padding: '13px 6px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: 'pointer', position: 'relative',
        transition: 'all .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent + '70'; e.currentTarget.style.background = accent + '0d' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border;     e.currentTarget.style.background = C.surface2 }}
      >
        {badge > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            background: C.red, color: '#fff',
            fontSize: 9, fontWeight: 800, borderRadius: RADIUS.full,
            padding: '1px 5px',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
        <span style={{ color: accent, fontSize: 17 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.muted,
          textAlign: 'center', lineHeight: 1.3, letterSpacing: '.02em' }}>
          {label}
        </span>
      </div>
    </Link>
  )
}

/* ─── Label de seção ───────────────────────────────────────────── */
function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.lg }}>
      <span style={{ fontSize: FONT.xs, fontWeight: 700, letterSpacing: '.1em',
        textTransform: 'uppercase', color: C.muted }}>
        {children}
      </span>
      {action}
    </div>
  )
}

/* ─── Sparkline SVG ────────────────────────────────────────────── */
function Spark({ data = [], color, w = 56, h = 18 }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ')
  return (
    <svg width={w} height={h} style={{ opacity: .65, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const health   = useSystemHealth()
  const logs     = useSystemLogs({ limitErros: 6, limitAudit: 5 })
  const users    = useUsersStats()
  const github   = useGitHubRepos({ per_page: 5 })
  const projetos = useProjetos()
  const analysis = useAnalysisOverview()
  const noticias = useNoticias({ limit: 4, status: 'publicada', ordem: '-data_publicacao' })
  const eventos  = useEventos()

  const [agora, setAgora] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const errHist = useRef([])
  useEffect(() => {
    if (logs.contagemErros?.total != null) {
      errHist.current = [...errHist.current.slice(-19), logs.contagemErros.nao_lidos ?? 0]
    }
  }, [logs.contagemErros?.total])

  const sistemaOk = health.mongodb.ok && health.cloudinary.ok && health.api.ok
  const score     = analysis.data?.saude?.score ?? 0

  const hora    = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dataStr = agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div className="db-wrap">
        <div className="db-inner">

          {/* ════ HEADER ═══════════════════════════════════════ */}
          <div className="db-fade db-d1" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: SPACE.xl4, flexWrap: 'wrap', gap: SPACE.lg,
          }}>
            <div>
              <div className="db-kicker" style={{ fontSize: FONT.xs, color: C.accent, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 800 }}>
                <Dot color={C.accent} pulse /> Centro de comando
              </div>
              <h1 style={{ fontSize: 'clamp(22px, 4vw, 36px)', color: C.text,
                margin: 0, lineHeight: 1.15, fontWeight: 800 }}>
                Painel de Controle
              </h1>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ fontSize: 20, color: C.text, fontWeight: 300,
                letterSpacing: '.04em', fontVariantNumeric: 'tabular-nums' }}>
                {hora}
              </div>
              <div style={{ fontSize: FONT.xs, color: C.muted, letterSpacing: '.06em' }}>
                {dataStr}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Dot color={sistemaOk ? C.greenSolid : C.red} pulse={sistemaOk} />
                <span style={{ fontSize: FONT.xs, color: sistemaOk ? C.greenSolid : C.red,
                  fontWeight: 700, letterSpacing: '.07em' }}>
                  {health.loading ? 'VERIFICANDO' : sistemaOk ? 'SISTEMA OK' : 'ATENÇÃO'}
                </span>
              </div>
            </div>
          </div>

          {/* ════ HERO — usuários ══════════════════════════════ */}
          <div className="db-card db-card-top db-command-hero db-fade db-d1" style={{
            '--db-accent': C.accent,
            padding: `${SPACE.xl}px`,
            marginBottom: SPACE.md,
          }}>
            <div className="db-hero-body">
              {/* Número gigante */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: FONT.xs, fontWeight: 700, letterSpacing: '.1em',
                  textTransform: 'uppercase', color: C.muted, marginBottom: SPACE.sm }}>
                  Usuários cadastrados
                </div>
                <div className="db-hero-num" style={{ color: C.text }}>
                  {users.loading
                    ? <span style={{ color: C.muted }}>···</span>
                    : fmt(users.total)}
                </div>
              </div>

              {/* Mini-stats */}
              <div className="db-hero-stats">
                {[
                  { l: 'Ativos',  v: users.ativos,                     c: C.greenSolid },
                  { l: 'Perfis',  v: users.totalPerfis,                 c: C.blue       },
                  { l: 'Erros',   v: logs.contagemErros?.nao_lidos,     c: C.amber      },
                  { l: 'Score',   v: `${score}/100`,                    c: C.purple, raw: true },
                ].map(({ l, v, c, raw }) => (
                  <div key={l} className="db-hero-stat">
                    <div style={{ fontSize: FONT.xs, color: C.muted, letterSpacing: '.08em',
                      textTransform: 'uppercase', marginBottom: SPACE.xs }}>{l}</div>
                    <div className="db-hero-stat-val" style={{ color: c }}>
                      {raw ? v : fmt(v ?? 0)}
                    </div>
                    {l === 'Score' && (
                      <div className="db-bar-wrap" style={{ marginTop: 5, width: 56 }}>
                        <div className="db-bar-fill" style={{ width: `${score}%`, background: c }} />
                      </div>
                    )}
                    {l === 'Erros' && errHist.current.length > 1 && (
                      <div style={{ marginTop: 3 }}>
                        <Spark data={errHist.current} color={c} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ════ SERVIÇOS ══════════════════════════════════════ */}
          <div className="db-card db-fade db-d2" style={{ padding: `${SPACE.md}px ${SPACE.xl}px`, marginBottom: SPACE.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm,
              flexWrap: 'wrap', rowGap: SPACE.sm }}>
              <span style={{ fontSize: FONT.xs, color: C.muted, letterSpacing: '.1em',
                textTransform: 'uppercase', fontWeight: 600, marginRight: 2 }}>INFRA</span>
              <SvcChip label="MongoDB"    ok={health.mongodb.ok}    loading={health.loading} />
              <SvcChip label="Redis"      ok={health.redis.ok}      loading={health.loading} />
              <SvcChip label="Cloudinary" ok={health.cloudinary.ok} loading={health.loading} />
              <SvcChip label="API"        ok={health.api.ok}        loading={health.loading} />
              <SvcChip label="GitHub"     ok={health.github.ok}     loading={health.loading} />
              <SvcChip label="Groq"       ok={health.groq.ok}       loading={health.loading} />
              <SvcChip label="Cloudflare" ok={health.cloudflare.ok} loading={health.loading} />
              {!health.loading && health.api.latencia != null && (
                <span style={{ fontSize: FONT.sm, color: C.muted, marginLeft: 'auto' }}>
                  {health.api.latencia}ms · {health.uptime || '—'}
                </span>
              )}
              <Link to="/admin/infraestrutura" className="db-link" style={{ marginLeft: 6 }}>
                INFRA →
              </Link>
            </div>
          </div>

          {/* ════ GRID 4 STATS ══════════════════════════════════ */}
          <div className="db-stat-grid db-fade db-d3" style={{ marginBottom: SPACE.md }}>
            <StatCard label="Total usuários"  value={users.total}                   accent={C.blue}      loading={users.loading}    delay="db-d3" to="/admin/usuarios"  icon="👥" />
            <StatCard label="Usuários ativos" value={users.ativos}                  accent={C.greenSolid} loading={users.loading}    delay="db-d3" to="/admin/usuarios"  icon="✓" sub="logaram recentemente" />
            <StatCard label="Erros não lidos" value={logs.contagemErros?.nao_lidos} accent={C.amber}     loading={logs.loading}     delay="db-d4" to="/admin/erros"     icon="⚠" sub={`${logs.contagemErros?.total ?? 0} total`} />
            <StatCard label="Projetos locais" value={projetos.total}                accent={C.purple}    loading={projetos.loading}  delay="db-d4" to="/admin/projetos"  icon="⬡" />
          </div>

          {/* ════ LINHA: Notícias + Eventos ══════════════════════ */}
          <div className="db-two-col db-fade db-d5" style={{ marginBottom: SPACE.md }}>
            {/* Notícias */}
            <div className="db-card db-card-top" style={{ '--db-accent': C.cyan, padding: SPACE.xl }}>
              <SectionLabel action={<Link to="/admin/noticias" className="db-link">VER →</Link>}>
                Últimas Notícias
              </SectionLabel>
              {noticias.loading
                ? <span style={{ color: C.muted, fontSize: FONT.base }}>carregando…</span>
                : noticias.noticias.length === 0
                  ? <span style={{ color: C.muted, fontSize: FONT.base }}>nenhuma notícia publicada</span>
                  : noticias.noticias.map((n, i) => (
                    <div key={n._id ?? i} className="db-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FONT.base, fontWeight: 600, color: C.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.titulo}
                        </div>
                        <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 2 }}>
                          {n.categoria?.nome || '—'}
                        </div>
                      </div>
                      <RelTime iso={n.data_publicacao || n.createdAt} />
                    </div>
                  ))
              }
            </div>

            {/* Eventos */}
            <div className="db-card db-card-top" style={{ '--db-accent': C.amber, padding: SPACE.xl }}>
              <SectionLabel action={<Link to="/admin/eventos" className="db-link">VER →</Link>}>
                Próximos Eventos
              </SectionLabel>
              {eventos.loading
                ? <span style={{ color: C.muted, fontSize: FONT.base }}>carregando…</span>
                : (eventos.futuros || []).length === 0
                  ? <span style={{ color: C.muted, fontSize: FONT.base }}>nenhum evento agendado</span>
                  : (eventos.futuros || []).slice(0, 4).map((e, i) => {
                      const data = e.data ? new Date(e.data) : null
                      const diff = data ? Math.ceil((data - new Date().setHours(0,0,0,0)) / 86400000) : null
                      const cor  = diff === 0 ? C.red : diff <= 3 ? C.amber : C.greenSolid
                      return (
                        <div key={e._id ?? i} className="db-row">
                          <span className="db-chip" style={{
                            background: cor + '18', borderColor: cor + '40', color: cor, flexShrink: 0,
                          }}>
                            {diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : `+${diff}d`}
                          </span>
                          <div style={{ flex: 1, fontSize: FONT.base, fontWeight: 500, color: C.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.titulo}
                          </div>
                        </div>
                      )
                    })
              }
            </div>
          </div>

          {/* ════ LINHA: Erros + Audit ═══════════════════════════ */}
          <div className="db-two-col db-fade db-d6" style={{ marginBottom: SPACE.md }}>
            {/* Erros */}
            <div className="db-card db-card-top" style={{ '--db-accent': C.red, padding: SPACE.xl }}>
              <SectionLabel action={
                <Link to="/admin/erros" className="db-link"
                  style={{ color: logs.contagemErros?.nao_lidos > 0 ? C.red : undefined }}>
                  {logs.contagemErros?.nao_lidos > 0
                    ? `${logs.contagemErros.nao_lidos} NÃO LIDOS →`
                    : 'VER →'}
                </Link>
              }>
                Log de Erros
              </SectionLabel>
              <div className="db-scroll" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {logs.loading
                  ? <span style={{ color: C.muted, fontSize: FONT.base }}>carregando…</span>
                  : logs.erros.length === 0
                    ? <span style={{ color: C.greenSolid, fontSize: FONT.base }}>✓ nenhum erro</span>
                    : logs.erros.slice(0, 5).map((e, i) => {
                        const COR_TIPO = { render: C.red, js_error: C.amber, unhandled_rejection: C.purple, api: C.blue }
                        const cor = COR_TIPO[e.tipo] || C.muted
                        return (
                          <div key={e._id ?? i} className="db-row">
                            <span className="db-chip" style={{
                              background: cor + '18', borderColor: cor + '35', color: cor,
                            }}>
                              {(e.tipo || '?').substring(0, 10)}
                            </span>
                            <div style={{ flex: 1, fontSize: FONT.sm, color: C.text,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.mensagem || '—'}
                            </div>
                            <RelTime iso={e.criado_em} />
                          </div>
                        )
                      })
                }
              </div>
            </div>

            {/* Atividade */}
            <div className="db-card db-card-top" style={{ '--db-accent': C.blue, padding: SPACE.xl }}>
              <SectionLabel action={
                <span style={{ fontSize: FONT.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  AUDIT LOG
                </span>
              }>
                Atividade Admin
              </SectionLabel>
              <div className="db-scroll" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {logs.loading
                  ? <span style={{ color: C.muted, fontSize: FONT.base }}>carregando…</span>
                  : logs.auditLogs.length === 0
                    ? <span style={{ color: C.muted, fontSize: FONT.base }}>nenhuma atividade</span>
                    : logs.auditLogs.slice(0, 5).map((l, i) => (
                        <div key={l._id ?? i} className="db-row">
                          <span className="db-chip" style={{
                            background: C.blueBg, borderColor: C.blueBorder, color: C.blue,
                          }}>
                            {(l.acao || 'ação').substring(0, 10)}
                          </span>
                          <div style={{ flex: 1, fontSize: FONT.sm, color: C.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.recurso} {l.admin_email ? `· ${l.admin_email}` : ''}
                          </div>
                          <RelTime iso={l.criado_em} />
                        </div>
                      ))
                }
              </div>
            </div>
          </div>

          {/* ════ USUÁRIOS — últimos acessos ═════════════════════ */}
          <div className="db-card db-card-top db-fade db-d7"
            style={{ '--db-accent': C.blue, padding: SPACE.xl, marginBottom: SPACE.md }}>
            <SectionLabel action={<Link to="/admin/usuarios" className="db-link">GERENCIAR →</Link>}>
              Usuários — últimos acessos
            </SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: SPACE.sm }}>
              {users.loading
                ? <span style={{ color: C.muted, fontSize: FONT.base }}>carregando…</span>
                : [...(users.usuarios || [])]
                    .sort((a, b) => new Date(b.ultimo_login || 0) - new Date(a.ultimo_login || 0))
                    .slice(0, 6)
                    .map((u, i) => {
                      const cor  = u.perfil_id?.cor || C.blue
                      const ini  = (u.nome || u.email || '?')[0].toUpperCase()
                      const ativo = u.ativo !== false
                      return (
                        <div key={u._id ?? i} style={{
                          display: 'flex', alignItems: 'center', gap: SPACE.md,
                          padding: `${SPACE.md}px ${SPACE.lg}px`,
                          background: C.surface2, borderRadius: RADIUS.lg,
                          border: `1px solid ${C.border}`,
                          minWidth: 0,
                        }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                            background: cor + '22', border: `1px solid ${cor}55`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: FONT.md, fontWeight: 700, color: cor,
                          }}>{ini}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: FONT.base, fontWeight: 600, color: C.text,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.nome || u.email}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Dot color={ativo ? C.greenSolid : C.muted} />
                              <span style={{ fontSize: FONT.xs, color: C.muted }}>
                                {u.ultimo_login ? <RelTime iso={u.ultimo_login} /> : 'sem login'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })
              }
            </div>
          </div>

          {/* ════ MÓDULOS ══════════════════════════════════════ */}
          <div className="db-card db-fade db-d8" style={{ padding: SPACE.xl, marginBottom: SPACE.md }}>
            <SectionLabel>Módulos</SectionLabel>
            <div style={{ marginBottom: SPACE.lg }}>
              <div style={{ fontSize: FONT.xs, letterSpacing: '.08em', color: C.muted,
                textTransform: 'uppercase', marginBottom: SPACE.md, fontWeight: 600 }}>ADMIN</div>
              <div className="db-mod-grid">
                <ModBtn to="/admin/usuarios"       label="Usuários"  icon="👥" accent={C.blue} />
                <ModBtn to="/admin/erros"          label="Erros"     icon="⚠"  accent={C.red}  badge={logs.contagemErros?.nao_lidos} />
                <ModBtn to="/admin/infraestrutura" label="Infra"     icon="⚙"  accent={C.cyan} />
                <ModBtn to="/admin/monitor"        label="Monitor"   icon="📡" accent={C.greenSolid} />
                <ModBtn to="/admin/backup"         label="Backup"    icon="🗄" accent={C.amber} />
                <ModBtn to="/admin/arquivos"       label="Arquivos"  icon="📁" accent={C.blue} />
                <ModBtn to="/admin/temas"          label="Temas"     icon="🎨" accent={C.orange} />
                <ModBtn to="/admin/ai-assistant"   label="IA"        icon="🧠" accent={C.purple} />
                <ModBtn to="/admin/setup"          label="Setup"     icon="🔧" accent={C.muted} />
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: SPACE.lg, marginTop: SPACE.sm }}>
              <div style={{ fontSize: FONT.xs, letterSpacing: '.08em', color: C.muted,
                textTransform: 'uppercase', marginBottom: SPACE.md, fontWeight: 600 }}>PORTAL</div>
              <div className="db-mod-grid">
                <ModBtn to="/admin/noticias"   label="Notícias"   icon="📰" accent={C.cyan} />
                <ModBtn to="/admin/eventos"    label="Eventos"    icon="📅" accent={C.amber} />
                <ModBtn to="/admin/categorias" label="Categorias" icon="🏷" accent={C.muted} />
                <ModBtn to="/admin/rss-import" label="RSS"        icon="📡" accent={C.muted} />
                <ModBtn to="/admin/projetos"   label="Projetos"   icon="⬡"  accent={C.purple} />
                <ModBtn to="/admin/github"     label="GitHub"     icon="🐙" accent={C.text} />
              </div>
            </div>
          </div>

          {/* ════ IA / ANÁLISE ═════════════════════════════════ */}
          {(analysis.loading || analysis.data?.alertasCriticos) && (
            <div className="db-card db-card-top db-fade db-d8"
              style={{ '--db-accent': C.purple, padding: SPACE.xl, marginBottom: SPACE.md }}>
              <SectionLabel action={<Link to="/admin/ai-assistant" className="db-link">ABRIR IA →</Link>}>
                🧠 Inteligência do Sistema
              </SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: SPACE.sm, marginBottom: SPACE.lg }}>
                {[
                  { l: 'Projetos ativos',  v: analysis.data?.stats?.projetos?.ativos     ?? '—', c: C.greenSolid },
                  { l: 'Abandonados',      v: analysis.data?.stats?.projetos?.abandonados ?? '—', c: C.red       },
                  { l: 'Repos GitHub',     v: analysis.data?.stats?.repos?.abandonados    ?? '—', c: C.amber     },
                  { l: 'Alertas críticos', v: analysis.data?.alertasCriticos?.length      ?? '—', c: C.purple    },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: RADIUS.lg, padding: `${SPACE.lg}px ${SPACE.xl}px`,
                  }}>
                    <div style={{ fontSize: FONT.xs, color: C.muted, letterSpacing: '.06em',
                      textTransform: 'uppercase', marginBottom: SPACE.sm }}>{l}</div>
                    <div style={{ fontSize: 22, fontWeight: 800,
                      color: analysis.loading ? C.muted : c,
                      fontVariantNumeric: 'tabular-nums' }}>
                      {analysis.loading ? '···' : v}
                    </div>
                  </div>
                ))}
              </div>
              {!analysis.loading && analysis.data?.alertasCriticos?.slice(0, 3).map((a, i) => (
                <div key={i} className="db-row">
                  <span className="db-chip" style={{ background: C.redBg, borderColor: C.redBorder, color: C.red }}>
                    {a.severidade?.toUpperCase()}
                  </span>
                  <span style={{ flex: 1, fontSize: FONT.sm, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</span>
                  <span style={{ fontSize: FONT.xs, color: C.muted }}>{a.projeto}</span>
                </div>
              ))}
            </div>
          )}

          {/* ════ RODAPÉ ════════════════════════════════════════ */}
          <div className="db-fade db-d8" style={{
            textAlign: 'center', paddingTop: SPACE.xl3,
            borderTop: `1px solid ${C.border}`, marginTop: SPACE.xl2,
          }}>
            <span style={{ fontSize: FONT.xs, color: C.muted, letterSpacing: '.1em' }}>
              AL SISTEMAS · ADMIN v4.0 · {agora.getFullYear()}
            </span>
          </div>

        </div>
      </div>
    </>
  )
}
