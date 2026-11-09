/**
 * AbaPlataformas.jsx — Dashboard de status Render + Vercel
 * v2 — melhorias:
 *   • PlataformaItens  : accordion unificado (antes: ServicosRender + ProjetosVercel duplicados)
 *   • DeployItem       : componente único para Render e Vercel
 *   • durStr()         : exibe duração de deploys (campo `duracao` do backend)
 *   • ComponentList    : itens não-operacionais aparecem primeiro
 *   • ManutencaoList   : nova aba "Manutenção" quando há manutenções programadas
 *   • PlatformCard     : chevron aberto/fechado nos sub-abas; aba manutencao dinâmica
 *   • Erros com retry  : botão "Tentar novamente" nas seções autenticadas
 *   • Badge local removido → usa Badge do InfraBase
 */
import { useState, useEffect, useCallback } from 'react'
import { infraestruturaService } from '../../../services/api'
import { C, Ico, Spin, PageCard, SectionTitle, Btn, Badge } from './InfraBase'

// ── Cores por status ───────────────────────────────────────────
const COR_INDICADOR = {
  operational: { bg: '#14532d', txt: '#4ade80' },
  minor:       { bg: '#713f12', txt: '#fbbf24' },
  major:       { bg: '#7f1d1d', txt: '#f87171' },
  critical:    { bg: '#450a0a', txt: '#ef4444' },
}

const COR_COMPONENTE = {
  operational:          '#22c55e',
  degraded_performance: '#f59e0b',
  partial_outage:       '#f97316',
  major_outage:         '#ef4444',
  under_maintenance:    '#60a5fa',
}

const COR_DEPLOY_RENDER = {
  live:               '#22c55e',
  build_in_progress:  '#60a5fa',
  update_in_progress: '#60a5fa',
  canceled:           '#6b7280',
  deactivated:        '#6b7280',
  error:              '#ef4444',
}

const COR_DEPLOY_VERCEL = {
  READY:    '#22c55e',
  ERROR:    '#ef4444',
  BUILDING: '#60a5fa',
  CANCELED: '#6b7280',
  QUEUED:   '#a78bfa',
}

const LABEL_COMPONENTE = {
  operational:          'Operacional',
  degraded_performance: 'Degradado',
  partial_outage:       'Interrupção parcial',
  major_outage:         'Interrupção grave',
  under_maintenance:    'Manutenção',
}

const COR_ESTADO_RENDER = {
  live:               '#22c55e',
  suspended:          '#6b7280',
  build_in_progress:  '#60a5fa',
  update_in_progress: '#60a5fa',
  error:              '#ef4444',
}

const IMPACTO_COR = {
  none:     C.green,
  minor:    '#f59e0b',
  major:    '#f97316',
  critical: '#ef4444',
}

// ── Helpers ────────────────────────────────────────────────────
function ago(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora'
  if (m < 60) return `${m} min atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

function durStr(secs) {
  if (!secs || secs <= 0) return null
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

// ── DeployItem — unificado para Render e Vercel ─────────────────
function DeployItem({ d, plataforma }) {
  const isRender = plataforma === 'render'
  const estadoKey = isRender ? d.status : d.estado
  const corMap    = isRender ? COR_DEPLOY_RENDER : COR_DEPLOY_VERCEL
  const cor       = corMap[estadoKey] || '#6b7280'
  const dur       = durStr(d.duracao)

  return (
    <div style={{
      padding: '6px 10px', borderRadius: 6, fontSize: 11,
      background: C.surface, border: `1px solid ${cor}44`,
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <span style={{ color: cor, fontWeight: 700, flexShrink: 0 }}>● {estadoKey}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {isRender && d.commit && (
          <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <code style={{ color: '#60a5fa' }}>{d.commit.hash}</code>{' '}{d.commit.mensagem}
          </div>
        )}
        {!isRender && d.commit && (
          <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.hash && <code style={{ color: '#60a5fa' }}>{d.hash} </code>}
            {d.commit}
          </div>
        )}
        <div style={{ color: C.muted, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          {!isRender && d.ambiente && <span>{d.ambiente}</span>}
          {!isRender && d.branch   && <span>← {d.branch}</span>}
          <span>{ago(d.criado)}</span>
          {dur && <span style={{ color: '#a78bfa' }}>⏱ {dur}</span>}
        </div>
      </div>
      {!isRender && d.url && (
        <a href={d.url} target="_blank" rel="noreferrer"
          style={{ color: '#60a5fa', flexShrink: 0 }}>{Ico.extLink}</a>
      )}
    </div>
  )
}

// ── ComponentList — não-operacionais primeiro ──────────────────
function ComponentList({ componentes = [] }) {
  const [expandido, setExpandido] = useState(false)
  const SHOW = 6

  if (!componentes.length)
    return <p style={{ fontSize: 12, color: C.muted }}>Nenhum componente reportado.</p>

  // Não-operacionais primeiro, depois alfabético
  const sorted = [...componentes].sort((a, b) => {
    const aOk = a.ok !== false ? 1 : 0
    const bOk = b.ok !== false ? 1 : 0
    return aOk - bOk || a.nome.localeCompare(b.nome)
  })

  const visíveis = expandido ? sorted : sorted.slice(0, SHOW)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {visíveis.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 8px', borderRadius: 6, background: C.surface,
          border: `1px solid ${c.ok === false
            ? (COR_COMPONENTE[c.status] + '55')
            : C.border}`,
          fontSize: 12,
        }}>
          <span style={{ color: C.text }}>{c.nome}</span>
          <span style={{ color: COR_COMPONENTE[c.status] || '#6b7280', fontWeight: 600, fontSize: 11 }}>
            ● {LABEL_COMPONENTE[c.status] || c.status}
          </span>
        </div>
      ))}
      {componentes.length > SHOW && (
        <button onClick={() => setExpandido(v => !v)} style={{
          fontSize: 11, color: C.muted, background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', padding: '2px 0',
        }}>
          {expandido ? '▲ Mostrar menos' : `▼ +${componentes.length - SHOW} componentes`}
        </button>
      )}
    </div>
  )
}

// ── IncidentList ───────────────────────────────────────────────
function IncidentList({ incidentes = [] }) {
  if (!incidentes.length)
    return <p style={{ fontSize: 12, color: '#22c55e' }}>✓ Nenhum incidente ativo.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {incidentes.map((inc, i) => (
        <div key={i} style={{
          padding: '8px 10px', borderRadius: 8,
          background: `${IMPACTO_COR[inc.impacto] || '#6b7280'}11`,
          border:     `1px solid ${IMPACTO_COR[inc.impacto] || '#6b7280'}44`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <b style={{ fontSize: 12, color: C.text }}>{inc.nome}</b>
            <Badge color={IMPACTO_COR[inc.impacto] || '#6b7280'}>
              {inc.impacto?.toUpperCase()}
            </Badge>
          </div>
          {inc.atualizacao && (
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{inc.atualizacao}</p>
          )}
          <p style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            {inc.status} · {ago(inc.criado)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── ManutencaoList ─────────────────────────────────────────────
function ManutencaoList({ manutencoes = [] }) {
  if (!manutencoes.length)
    return <p style={{ fontSize: 12, color: C.muted }}>Nenhuma manutenção programada.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {manutencoes.map((m, i) => (
        <div key={i} style={{
          padding: '8px 10px', borderRadius: 8,
          background: '#1e3a5f22',
          border:     '1px solid #60a5fa44',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <b style={{ fontSize: 12, color: C.text }}>{m.nome}</b>
            <Badge color="#60a5fa">{m.estado?.toUpperCase()}</Badge>
          </div>
          {m.descricao && (
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 4px' }}>{m.descricao}</p>
          )}
          {m.inicio && (
            <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>
              {new Date(m.inicio).toLocaleString('pt-BR')}
              {m.fim ? ` → ${new Date(m.fim).toLocaleString('pt-BR')}` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── PlataformaItens — accordion unificado (Render + Vercel) ────
function PlataformaItens({ items = [], tipo, onCarregarDeploys }) {
  const [selecionado, setSelecionado] = useState(null)
  const [deploys,     setDeploys]     = useState({})
  const [loadingId,   setLoadingId]   = useState(null)

  async function toggle(id) {
    if (selecionado === id) { setSelecionado(null); return }
    if (deploys[id] !== undefined) { setSelecionado(id); return }
    setLoadingId(id)
    try {
      const lista = await onCarregarDeploys(id)
      setDeploys(prev => ({ ...prev, [id]: lista }))
      setSelecionado(id)
    } catch {
      setDeploys(prev => ({ ...prev, [id]: [] }))
      setSelecionado(id)
    } finally { setLoadingId(null) }
  }

  if (!items.length)
    return <p style={{ fontSize: 13, color: C.muted }}>Nenhum item encontrado.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const id     = item.id
        const isOpen = selecionado === id
        const estadoCor = tipo === 'render'
          ? (COR_ESTADO_RENDER[item.estado] || '#6b7280')
          : C.border

        return (
          <div key={id}>
            <div
              style={{
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: C.surface,
                border: `1px solid ${tipo === 'render' ? estadoCor + '55' : C.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onClick={() => toggle(id)}
            >
              <div>
                <b style={{ fontSize: 13, color: C.text }}>{item.nome}</b>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {tipo === 'render' && (
                    <>{item.tipo}{item.regiao ? ` · ${item.regiao}` : ''}{item.branch ? ` · ${item.branch}` : ''}</>
                  )}
                  {tipo === 'vercel' && (
                    <>{item.framework}{item.git ? ` · ${item.git.tipo}: ${item.git.repositorio}` : ''}</>
                  )}
                </div>
                {(item.url || item.dominio) && (
                  <div style={{ fontSize: 11, color: '#60a5fa' }}>{item.url || item.dominio}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {tipo === 'render' && item.estado && (
                  <span style={{ color: estadoCor, fontSize: 11, fontWeight: 700 }}>
                    ● {item.estado}
                  </span>
                )}
                {loadingId === id
                  ? <Spin size={12} />
                  : <span style={{ color: C.muted, fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                }
              </div>
            </div>

            {isOpen && (
              <div style={{ padding: '8px 4px 2px' }}>
                <p style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Últimos deploys:</p>
                {(deploys[id] || []).length === 0
                  ? <p style={{ fontSize: 12, color: C.muted }}>Nenhum deploy encontrado.</p>
                  : (deploys[id] || []).map((d, i) => (
                      <div key={i} style={{ marginBottom: 5 }}>
                        <DeployItem d={d} plataforma={tipo} />
                      </div>
                    ))
                }
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── PlatformCard ───────────────────────────────────────────────
function PlatformCard({ nome, dados, cor, logoChar }) {
  const [abaLocal, setAbaLocal] = useState('status')

  if (!dados) return (
    <PageCard>
      <b style={{ fontSize: 15 }}>{logoChar} {nome}</b>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Não foi possível obter status.</p>
    </PageCard>
  )

  const ind          = COR_INDICADOR[dados.indicador] || COR_INDICADOR.minor
  const nIncidentes  = dados.incidentes?.length   || 0
  const nManutencoes = dados.manutencoes?.length  || 0

  const TABS = [
    { id: 'status',     label: 'Componentes' },
    { id: 'incidentes', label: nIncidentes ? `Incidentes (${nIncidentes})` : 'Incidentes' },
    ...(nManutencoes ? [{ id: 'manutencao', label: `Manutenção (${nManutencoes})` }] : []),
  ]

  return (
    <PageCard>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{logoChar}</span>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.text }}>{nome}</h3>
            {dados.pagina_url && (
              <a href={dados.pagina_url} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: '#60a5fa' }}>status page ↗</a>
            )}
          </div>
        </div>
        <div style={{
          padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 11,
          background: ind.bg, color: ind.txt,
        }}>
          {dados.descricao}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setAbaLocal(t.id)} style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: 'none',
            background: abaLocal === t.id ? cor : C.border,
            color:      abaLocal === t.id ? '#fff' : C.muted,
            fontWeight: abaLocal === t.id ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {abaLocal === 'status'     && <ComponentList  componentes={dados.componentes}  />}
      {abaLocal === 'incidentes' && <IncidentList   incidentes={dados.incidentes}    />}
      {abaLocal === 'manutencao' && <ManutencaoList manutencoes={dados.manutencoes}  />}

      {dados.atualizado && (
        <p style={{ fontSize: 10, color: C.muted, marginTop: 10, textAlign: 'right' }}>
          Atualizado: {new Date(dados.atualizado).toLocaleString('pt-BR')}
        </p>
      )}
    </PageCard>
  )
}

// ── Bloco de erro com retry ────────────────────────────────────
function ErroSection({ msg, onRetry }) {
  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ color: '#f87171', marginBottom: 8 }}>⚠ {msg}</p>
      {onRetry && (
        <Btn onClick={onRetry} variant="secondary" style={{ padding: '3px 12px', fontSize: 11, width: 'auto' }}>
          {Ico.refresh} Tentar novamente
        </Btn>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════

function VercelConfigCard({ configuracao, onAtualizar }) {
  const [aberto, setAberto] = useState(!configuracao?.configurado)
  const [token, setToken] = useState('')
  const [teamId, setTeamId] = useState(configuracao?.teamId || '')
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState(null)

  useEffect(() => { setTeamId(configuracao?.teamId || '') }, [configuracao?.teamId])

  async function executar(acao) {
    setOcupado(true); setMensagem(null)
    try {
      const res = acao === 'salvar'
        ? await infraestruturaService.salvarVercelConfiguracao(token, teamId)
        : await infraestruturaService.testarVercel(token, teamId)
      setMensagem({ ok: true, texto: res.mensagem || `Conexão válida: ${res.usuario}` })
      if (acao === 'salvar') { setToken(''); setAberto(false); await onAtualizar() }
    } catch (err) { setMensagem({ ok: false, texto: err.message }) }
    finally { setOcupado(false) }
  }

  async function remover() {
    setOcupado(true); setMensagem(null)
    try {
      const res = await infraestruturaService.removerVercelConfiguracao()
      setMensagem({ ok: true, texto: res.mensagem })
      setToken(''); await onAtualizar(); setAberto(true)
    } catch (err) { setMensagem({ ok: false, texto: err.message }) }
    finally { setOcupado(false) }
  }

  return (
    <PageCard>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <SectionTitle icon={Ico.gear}>Conexão da API Vercel</SectionTitle>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
            {configuracao?.configurado
              ? <>Conectada via <b style={{ color: C.text }}>{configuracao.origem === 'painel' ? 'painel' : 'variável de ambiente'}</b>{configuracao.teamId ? ` · Team ID: ${configuracao.teamId}` : ''}</>
              : 'Informe um token para carregar os projetos e deploys da sua conta.'}
          </div>
        </div>
        <Btn variant="secondary" onClick={() => setAberto(v => !v)} style={{ width: 'auto', padding: '5px 12px' }}>
          {aberto ? 'Fechar' : configuracao?.configurado ? 'Alterar conexão' : 'Configurar'}
        </Btn>
      </div>

      {aberto && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 10 }}>
          <label style={{ fontSize: 12, color: C.muted }}>
            Token da Vercel
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder={configuracao?.configurado ? 'Digite somente para substituir ou testar outro token' : 'Cole o token criado na Vercel'}
              autoComplete="new-password"
              style={{ width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text }} />
          </label>
          <label style={{ fontSize: 12, color: C.muted }}>
            Team ID <span style={{ opacity: .7 }}>(opcional, para projetos de equipe)</span>
            <input value={teamId} onChange={e => setTeamId(e.target.value)} placeholder="team_xxxxxxxxxxxx"
              style={{ width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text }} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn disabled={ocupado || !token.trim()} onClick={() => executar('salvar')} style={{ width: 'auto' }}>
              {ocupado ? 'Aguarde…' : 'Salvar e conectar'}
            </Btn>
            <Btn disabled={ocupado || (!token.trim() && !configuracao?.configurado)} variant="secondary" onClick={() => executar('testar')} style={{ width: 'auto' }}>
              Testar conexão
            </Btn>
            {configuracao?.origem === 'painel' && (
              <Btn disabled={ocupado} variant="secondary" onClick={remover} style={{ width: 'auto' }}>Remover do painel</Btn>
            )}
            <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: 12, alignSelf: 'center' }}>
              Criar token na Vercel ↗
            </a>
          </div>
          <div style={{ color: C.muted, fontSize: 11 }}>
            O token é criptografado no backend e nunca é devolvido ao navegador.
          </div>
        </div>
      )}
      {mensagem && <div style={{ marginTop: 10, fontSize: 12, color: mensagem.ok ? '#4ade80' : '#f87171' }}>{mensagem.texto}</div>}
    </PageCard>
  )
}

export default function AbaPlataformas() {
  const [status,      setStatus]      = useState(null)
  const [render,      setRender]      = useState(null)
  const [vercel,      setVercel]      = useState(null)
  const [carregando,  setCarregando]  = useState(true)
  const [erroRender,  setErroRender]  = useState(null)
  const [erroVercel,  setErroVercel]  = useState(null)
  const [intervalo,   setIntervalo]   = useState(30000)
  const [ultimoCheck, setUltimoCheck] = useState(null)
  const [vercelConfig, setVercelConfig] = useState(null)
  const [syncRenderEm, setSyncRenderEm] = useState(null)
  const [syncVercelEm, setSyncVercelEm] = useState(null)

  const INTERVALOS = [
    { label: 'Off',   ms: 0 },
    { label: '30 s',  ms: 30000 },
    { label: '1 min', ms: 60000 },
    { label: '5 min', ms: 300000 },
  ]

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const dados = await infraestruturaService.plataformasStatus()
      setStatus(dados)
      setUltimoCheck(new Date())
    } catch { /* silencioso */ }
    finally { if (!silencioso) setCarregando(false) }
  }, [])

  const carregarRender = useCallback(async () => {
    setErroRender(null)
    try {
      const dados = await infraestruturaService.renderServicos()
      setRender(dados.servicos || [])
      setSyncRenderEm(dados.sincronizadoEm || new Date().toISOString())
    } catch (err) {
      setErroRender(err.message)
    }
  }, [])

  const carregarVercelConfig = useCallback(async () => {
    try { setVercelConfig(await infraestruturaService.vercelConfiguracao()) } catch { setVercelConfig({ configurado: false }) }
  }, [])

  const carregarVercel = useCallback(async () => {
    setErroVercel(null)
    try {
      const dados = await infraestruturaService.vercelProjetos()
      setVercel(dados.projetos || [])
      setSyncVercelEm(dados.sincronizadoEm || new Date().toISOString())
    } catch (err) {
      setErroVercel(err.message)
    }
  }, [])

  useEffect(() => {
    carregar()
    carregarRender()
    carregarVercelConfig()
    carregarVercel()
  }, [carregar, carregarRender, carregarVercelConfig, carregarVercel])

  useEffect(() => {
    if (!intervalo) return
    const id = setInterval(() => carregar(true), intervalo)
    return () => clearInterval(id)
  }, [intervalo, carregar])

  if (carregando) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <Spin size={24} />
    </div>
  )

  const totalIncidentes =
    (status?.render?.incidentes?.length || 0) +
    (status?.vercel?.incidentes?.length || 0)

  const totalManutencoes =
    (status?.render?.manutencoes?.length || 0) +
    (status?.vercel?.manutencoes?.length || 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Barra de controle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderRadius: 10, flexWrap: 'wrap', gap: 10,
        background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted }}>
          {Ico.refresh}
          <span>Auto-refresh:</span>
          {INTERVALOS.map(op => (
            <button key={op.ms} onClick={() => setIntervalo(op.ms)} style={{
              padding: '2px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11, border: 'none',
              background: intervalo === op.ms ? '#3b82f6' : C.border,
              color:      intervalo === op.ms ? '#fff' : C.text,
              fontWeight: intervalo === op.ms ? 700 : 400,
            }}>{op.label}</button>
          ))}
          {totalIncidentes > 0 && (
            <span style={{
              background: '#7f1d1d', color: '#f87171',
              padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>
              ⚠ {totalIncidentes} incidente{totalIncidentes > 1 ? 's' : ''} ativo{totalIncidentes > 1 ? 's' : ''}
            </span>
          )}
          {totalManutencoes > 0 && (
            <span style={{
              background: '#1e3a5f', color: '#60a5fa',
              padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>
              🔧 {totalManutencoes} manutenção programada{totalManutencoes > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ultimoCheck && (
            <span style={{ fontSize: 11, color: C.muted }}>
              Verificado: {ultimoCheck.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <Btn
            onClick={() => { carregar(); carregarRender(); carregarVercel() }}
            variant="secondary"
            style={{ padding: '3px 12px', fontSize: 11, width: 'auto' }}
          >
            {Ico.refresh} Atualizar tudo
          </Btn>
        </div>
      </div>

      <VercelConfigCard configuracao={vercelConfig} onAtualizar={async () => { await carregarVercelConfig(); await carregarVercel() }} />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
        {[
          { label:'Serviços Render', valor:render?.length ?? '—', detalhe:syncRenderEm ? `Atualizado ${ago(syncRenderEm)}` : 'Aguardando sincronização' },
          { label:'Projetos Vercel', valor:vercel?.length ?? '—', detalhe:syncVercelEm ? `Atualizado ${ago(syncVercelEm)}` : 'Aguardando sincronização' },
          { label:'Incidentes ativos', valor:totalIncidentes, detalhe:totalIncidentes ? 'Requer atenção' : 'Tudo operacional' },
          { label:'Manutenções', valor:totalManutencoes, detalhe:totalManutencoes ? 'Programadas' : 'Nenhuma programada' },
        ].map(card => <div key={card.label} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
          <div style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:'.04em'}}>{card.label}</div>
          <div style={{fontSize:22,fontWeight:800,color:C.text,margin:'4px 0'}}>{card.valor}</div>
          <div style={{fontSize:11,color:C.muted}}>{card.detalhe}</div>
        </div>)}
      </div>

      {/* Status público — 2 colunas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        <PlatformCard nome="Render" dados={status?.render} cor="#7c3aed" logoChar="⬛" />
        <PlatformCard nome="Vercel" dados={status?.vercel} cor="#000000" logoChar="▲" />
      </div>

      {/* Render — Serviços e Deploys */}
      <PageCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><SectionTitle icon={Ico.gear}>Render — Serviços e Deploys</SectionTitle><div style={{fontSize:11,color:C.muted,marginTop:3}}>Sincronizado {ago(syncRenderEm)}{syncRenderEm ? ` · ${new Date(syncRenderEm).toLocaleString('pt-BR')}` : ''}</div></div>
          {!erroRender && render !== null && (
            <Btn onClick={carregarRender} variant="secondary" style={{ padding: '3px 12px', fontSize: 11, width: 'auto' }}>
              {Ico.refresh}
            </Btn>
          )}
        </div>

        {erroRender ? (
          <div>
            <ErroSection
              msg={erroRender}
              onRetry={erroRender.includes('RENDER_API_KEY') ? null : carregarRender}
            />
            {erroRender.includes('RENDER_API_KEY') && (
              <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                Para habilitar: adicione{' '}
                <code style={{ background: C.border, padding: '1px 5px', borderRadius: 4 }}>RENDER_API_KEY</code>{' '}
                nas variáveis de ambiente.{' '}
                <a href="https://dashboard.render.com/u/settings#api-keys"
                  target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
                  Obter chave ↗
                </a>
              </p>
            )}
          </div>
        ) : render === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <Spin size={16} />
          </div>
        ) : (
          <PlataformaItens
            items={render}
            tipo="render"
            onCarregarDeploys={async id => {
              const res = await infraestruturaService.renderDeploys(id)
              return res.deploys || []
            }}
          />
        )}
      </PageCard>

      {/* Vercel — Projetos e Deploys */}
      <PageCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div><SectionTitle icon={Ico.gear}>Vercel — Projetos e Deploys</SectionTitle><div style={{fontSize:11,color:C.muted,marginTop:3}}>Sincronizado {ago(syncVercelEm)}{syncVercelEm ? ` · ${new Date(syncVercelEm).toLocaleString('pt-BR')}` : ''}</div></div>
          {!erroVercel && vercel !== null && (
            <Btn onClick={carregarVercel} variant="secondary" style={{ padding: '3px 12px', fontSize: 11, width: 'auto' }}>
              {Ico.refresh}
            </Btn>
          )}
        </div>

        {erroVercel ? (
          <div>
            <ErroSection
              msg={erroVercel}
              onRetry={erroVercel.includes('Token da Vercel') ? null : carregarVercel}
            />
            {erroVercel.includes('Token da Vercel') && (
              <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                Configure o token no cartão <b>Conexão da API Vercel</b> acima ou use{' '}
                <code style={{ background: C.border, padding: '1px 5px', borderRadius: 4 }}>VERCEL_TOKEN</code>.{' '}
                <a href="https://vercel.com/account/tokens"
                  target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
                  Obter token ↗
                </a>
              </p>
            )}
          </div>
        ) : vercel === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <Spin size={16} />
          </div>
        ) : (
          <PlataformaItens
            items={vercel}
            tipo="vercel"
            onCarregarDeploys={async id => {
              const res = await infraestruturaService.vercelDeploys(id)
              return res.deploys || []
            }}
          />
        )}
      </PageCard>

    </div>
  )
}
