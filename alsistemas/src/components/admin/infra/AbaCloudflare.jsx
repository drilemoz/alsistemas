/**
 * AbaCloudflare.jsx — Gerenciamento completo da conta Cloudflare.
 *
 * Abas internas:
 *   Visão Geral  — status do token, info da conta
 *   Zonas        — lista de domínios com status/plano
 *   DNS          — registros DNS com CRUD (por zona)
 *   Analytics    — tráfego: requisições, banda, ameaças (gráfico sparkline)
 *   Workers      — scripts da conta
 *
 * Padrões: InfraBase (PageCard, SectionTitle, Btn, C, Ico, Spin)
 *          Tokens do DS (SPACE, RADIUS, FONT)
 */
import { useState, useEffect, useCallback } from 'react'
import React from 'react'
import toast from 'react-hot-toast'
import { cloudflareService } from '../../../services/domains/cloudflare'
import { C, Ico, Spin, PageCard, SectionTitle, Btn } from './InfraBase'
import { SPACE, RADIUS, FONT } from '../../../themes/tokens'

// ─── Paleta Cloudflare ─────────────────────────────────────────
const CF = {
  orange:  '#f6821f',
  orangeL: '#f6821f22',
  active:  '#00b06b',
  activeL: '#00b06b22',
  warn:    '#f59e0b',
  warnL:   '#f59e0b22',
  err:     '#ef4444',
  errL:    '#ef444422',
}

// ─── Micro utilitários ─────────────────────────────────────────

function Badge({ color, bg, children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 20, background: bg || color + '22', color: color || '#fff',
      display: 'inline-block',
    }}>
      {children}
    </span>
  )
}

function Row({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: `${SPACE.xs}px 0`, borderBottom: `1px solid ${C.border}`, gap: 8 }}>
      <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: C.text, fontFamily: mono ? 'monospace' : undefined,
        textAlign: 'right', wordBreak: 'break-all' }}>{value ?? '—'}</span>
    </div>
  )
}

// Sparkline SVG puro
function Sparkline({ data = [], color = CF.orange, height = 36, width = 160 }) {
  if (data.length < 2) return <span style={{ color: C.muted, fontSize: 11 }}>sem dados</span>
  const max   = Math.max(...data, 1)
  const min   = Math.min(...data, 0)
  const range = max - min || 1
  const pts   = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last  = data[data.length - 1]
  const lastX = width
  const lastY = height - ((last - min) / range) * (height - 4) - 2
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  )
}

function numK(n) {
  if (n == null) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n)
}

function bytes(n) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${u[i]}`
}

// ─── ABA: Visão Geral ──────────────────────────────────────────
function AbaGeral({ status, carregando, recarregar }) {
  if (carregando) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size={24} /></div>

  if (!status?.ok) return (
    <PageCard>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>☁️</div>
        <p style={{ color: CF.err, fontWeight: 600, marginBottom: 8 }}>Token não configurado</p>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>{status?.erro}</p>
        <p style={{ color: C.muted, fontSize: 12 }}>
          Adicione <code style={{ background: C.border, padding: '1px 6px', borderRadius: 4 }}>CF_API_TOKEN</code> e{' '}
          <code style={{ background: C.border, padding: '1px 6px', borderRadius: 4 }}>CF_ACCOUNT_ID</code>{' '}
          nas variáveis de ambiente do backend.
        </p>
      </div>
    </PageCard>
  )

  const { token, conta } = status
  const statusCor = token?.status === 'active' ? CF.active : CF.warn

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Token info */}
      <PageCard>
        <SectionTitle icon={<span style={{ fontSize: 16 }}>🔑</span>}>
          Token de API
        </SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: statusCor, flexShrink: 0,
            boxShadow: `0 0 6px ${statusCor}`,
          }} />
          <span style={{ color: statusCor, fontWeight: 700, fontSize: 13 }}>
            {token?.status === 'active' ? 'Ativo e válido' : token?.status ?? 'Desconhecido'}
          </span>
        </div>
        <Row label="Nome"         value={token?.name} />
        <Row label="Account ID"   value={status.account_id} mono />
        <Row label="Expiração"    value={token?.not_before ? new Date(token.not_before).toLocaleString('pt-BR') : 'Sem expiração'} />
        <Row label="Criado em"    value={token?.issued_on  ? new Date(token.issued_on).toLocaleString('pt-BR') : '—'} />
        <Row label="Última mod."  value={token?.modified_on ? new Date(token.modified_on).toLocaleString('pt-BR') : '—'} />
      </PageCard>

      {/* Account info */}
      {conta && (
        <PageCard>
          <SectionTitle icon={<span style={{ fontSize: 16 }}>🏢</span>}>
            Conta Cloudflare
          </SectionTitle>
          <Row label="Nome"    value={conta.name} />
          <Row label="ID"      value={conta.id}   mono />
          <Row label="Tipo"    value={conta.type} />
          <Row label="2FA"     value={conta.settings?.enforce_twofactor ? '✅ Obrigatório' : '⚠ Não obrigatório'} />
        </PageCard>
      )}

      {/* S3 Credentials */}
      <PageCard>
        <SectionTitle icon={<span style={{ fontSize: 16 }}>🗝</span>}>
          Credenciais R2 (S3)
        </SectionTitle>
        {status?.s3Credentials ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: status.s3Credentials.configurado ? CF.active : CF.err,
                boxShadow: `0 0 6px ${status.s3Credentials.configurado ? CF.active : CF.err}`,
              }} />
              <span style={{ color: status.s3Credentials.configurado ? CF.active : CF.err, fontWeight: 700, fontSize: 13 }}>
                {status.s3Credentials.configurado ? 'Configuradas' : 'Não configuradas'}
              </span>
            </div>
            <Row label="Bucket"           value={status.s3Credentials.bucket || '—'} mono />
            <Row label="CF_R2_ACCESS_KEY_ID"     value={status.s3Credentials.configurado ? '••••••••' : '⚠ ausente'} mono />
            <Row label="CF_R2_SECRET_ACCESS_KEY" value={status.s3Credentials.configurado ? '••••••••' : '⚠ ausente'} mono />
            {!status.s3Credentials.configurado && (
              <p style={{ fontSize: 12, color: CF.err, marginTop: 10 }}>
                Sem as credenciais S3, uploads para R2 não funcionarão. Adicione{' '}
                <code style={{ background: C.border, padding: '1px 6px', borderRadius: 4 }}>CF_R2_ACCESS_KEY_ID</code> e{' '}
                <code style={{ background: C.border, padding: '1px 6px', borderRadius: 4 }}>CF_R2_SECRET_ACCESS_KEY</code> no backend.
              </p>
            )}
          </>
        ) : (
          <p style={{ color: C.muted, fontSize: 13 }}>Carregando informações S3…</p>
        )}
      </PageCard>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={recarregar} variant="secondary" style={{ width: 'auto', padding: '6px 16px', fontSize: 12 }}>
          {Ico.refresh} Verificar novamente
        </Btn>
      </div>
    </div>
  )
}

// ─── ABA: Zonas ────────────────────────────────────────────────
function AbaZonas({ onSelecionarZona, zonaSelecionada }) {
  const [zonas,     setZonas]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [pagina,    setPagina]    = useState(1)
  const [busca,     setBusca]     = useState('')
  const [loading,   setLoading]   = useState(true)

  const carregar = useCallback(async (pg = 1, q = '') => {
    setLoading(true)
    try {
      const d = await cloudflareService.listarZonas(pg, 20, q)
      setZonas(d.zonas || [])
      setTotal(d.total || 0)
      setPagina(pg)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const PLAN_COR = {
    free:       C.muted,
    pro:        '#3b82f6',
    business:   CF.orange,
    enterprise: '#a855f7',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de busca */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && carregar(1, busca)}
          placeholder="Buscar domínio..."
          style={{
            flex: 1, padding: '7px 12px', borderRadius: RADIUS.md,
            border: `1px solid ${C.border}`, background: C.surface2,
            color: C.text, fontSize: 13,
          }}
        />
        <Btn onClick={() => carregar(1, busca)} variant="secondary"
          style={{ width: 'auto', padding: '7px 16px', fontSize: 12 }}>
          Buscar
        </Btn>
        <Btn onClick={() => { setBusca(''); carregar(1, '') }} variant="secondary"
          style={{ width: 'auto', padding: '7px 12px', fontSize: 12 }}>
          {Ico.clear}
        </Btn>
      </div>

      <PageCard style={{ padding: 0 }}>
        <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.md}px` }}>
          <SectionTitle icon={<span style={{ fontSize: 16 }}>🌐</span>}>
            Zonas ({total})
          </SectionTitle>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : zonas.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>Nenhuma zona encontrada.</p>
        ) : (
          <div>
            {zonas.map(z => {
              const sel = zonaSelecionada?.id === z.id
              return (
                <div
                  key={z.id}
                  onClick={() => onSelecionarZona(z)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACE.md}px ${SPACE.lg}px`,
                    borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer',
                    background: sel ? CF.orangeL : 'transparent',
                    borderLeft: sel ? `3px solid ${CF.orange}` : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: z.status === 'active' ? CF.active : CF.warn,
                    }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{z.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
                        {z.id}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Badge color={PLAN_COR[z.plan?.legacy_id] || C.muted}>
                      {z.plan?.name || 'Free'}
                    </Badge>
                    <Badge color={z.status === 'active' ? CF.active : CF.warn}>
                      {z.status}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Paginação */}
        {total > 20 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: SPACE.md }}>
            <Btn onClick={() => carregar(pagina - 1, busca)} variant="secondary"
              style={{ width: 'auto', padding: '4px 14px', fontSize: 12 }}
              disabled={pagina <= 1}>
              ← Anterior
            </Btn>
            <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>
              Pág. {pagina}
            </span>
            <Btn onClick={() => carregar(pagina + 1, busca)} variant="secondary"
              style={{ width: 'auto', padding: '4px 14px', fontSize: 12 }}
              disabled={zonas.length < 20}>
              Próxima →
            </Btn>
          </div>
        )}
      </PageCard>
    </div>
  )
}

// ─── ABA: DNS ──────────────────────────────────────────────────
const TIPOS_DNS = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR']

function AbaDns({ zona }) {
  const [registros, setRegistros] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [filTipo,   setFilTipo]   = useState('')
  const [busca,     setBusca]     = useState('')
  const [pagina,    setPagina]    = useState(1)
  const [modal,     setModal]     = useState(null) // null | 'criar' | registro
  const [form,      setForm]      = useState({ type: 'A', name: '', content: '', ttl: 1, proxied: false, priority: '' })
  const [salvando,  setSalvando]  = useState(false)
  const [excluindo, setExcluindo] = useState(null)

  const [purgando,  setPurgando]  = useState(false)

  async function purgeCache() {
    if (!confirm(`Purgar TODO o cache de "${zona.name}"? Isso pode aumentar o tráfego temporariamente.`)) return
    setPurgando(true)
    try {
      await cloudflareService.purgeCache(zona.id, { tudo: true })
      toast.success(`Cache de "${zona.name}" purgado com sucesso!`)
    } catch (err) { toast.error(err.message) }
    finally { setPurgando(false) }
  }

  const carregar = useCallback(async (pg = 1) => {
    if (!zona) return
    setLoading(true)
    try {
      const d = await cloudflareService.listarDns(zona.id, { page: pg, tipo: filTipo, q: busca })
      setRegistros(d.registros || [])
      setTotal(d.total || 0)
      setPagina(pg)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [zona, filTipo, busca])

  useEffect(() => { carregar(1) }, [carregar])

  async function salvar() {
    setSalvando(true)
    try {
      const payload = { ...form, ttl: Number(form.ttl) || 1 }
      if (modal === 'criar') {
        await cloudflareService.criarDns(zona.id, payload)
        toast.success('Registro DNS criado!')
      } else {
        await cloudflareService.atualizarDns(zona.id, modal.id, payload)
        toast.success('Registro DNS atualizado!')
      }
      setModal(null)
      carregar(pagina)
    } catch (err) { toast.error(err.message) }
    finally { setSalvando(false) }
  }

  async function excluir(rec) {
    setExcluindo(rec.id)
    try {
      await cloudflareService.removerDns(zona.id, rec.id)
      toast.success(`DNS ${rec.name} removido.`)
      carregar(pagina)
    } catch (err) { toast.error(err.message) }
    finally { setExcluindo(null) }
  }

  function abrirEditar(rec) {
    setForm({
      type:     rec.type,
      name:     rec.name,
      content:  rec.content,
      ttl:      rec.ttl,
      proxied:  rec.proxied ?? false,
      priority: rec.priority ?? '',
    })
    setModal(rec)
  }

  function abrirCriar() {
    setForm({ type: 'A', name: '', content: '', ttl: 1, proxied: false, priority: '' })
    setModal('criar')
  }

  if (!zona) return (
    <PageCard>
      <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
        Selecione uma zona na aba <strong>Zonas</strong> para gerenciar os DNS.
      </p>
    </PageCard>
  )

  const COR_TIPO = {
    A: '#3b82f6', AAAA: '#8b5cf6', CNAME: '#06b6d4', MX: CF.orange,
    TXT: '#10b981', NS: '#f59e0b', SRV: '#ec4899', CAA: '#14b8a6', PTR: C.muted,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Modal criar/editar */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{
            background: C.surface, borderRadius: RADIUS.lg, padding: SPACE.xl2,
            width: '100%', maxWidth: 460, boxShadow: '0 20px 60px #0005',
            border: `1px solid ${C.border}`,
          }}>
            <h3 style={{ margin: '0 0 16px', color: C.text, fontSize: FONT.lg }}>
              {modal === 'criar' ? '➕ Novo Registro DNS' : `✏️ Editar: ${modal.name}`}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Tipo */}
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Tipo *</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md,
                    border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 13 }}>
                  {TIPOS_DNS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Nome */}
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Nome *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={`ex: @ ou subdominio`}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md, boxSizing: 'border-box',
                    border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 13 }} />
              </div>

              {/* Conteúdo */}
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Conteúdo *</label>
                <input value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder={form.type === 'A' ? 'ex: 192.168.1.1' : form.type === 'CNAME' ? 'ex: target.example.com' : ''}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md, boxSizing: 'border-box',
                    border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 13 }} />
              </div>

              {/* TTL + Proxied */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>TTL</label>
                  <select value={form.ttl} onChange={e => setForm(f => ({ ...f, ttl: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md,
                      border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 13 }}>
                    <option value={1}>Auto</option>
                    <option value={60}>1 min</option>
                    <option value={300}>5 min</option>
                    <option value={1800}>30 min</option>
                    <option value={3600}>1 hora</option>
                    <option value={86400}>1 dia</option>
                  </select>
                </div>
                {['A', 'AAAA', 'CNAME'].includes(form.type) && (
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Proxy CF</label>
                    <button onClick={() => setForm(f => ({ ...f, proxied: !f.proxied }))}
                      style={{
                        width: '100%', padding: '7px 10px', borderRadius: RADIUS.md,
                        border: `1px solid ${form.proxied ? CF.orange : C.border}`,
                        background: form.proxied ? CF.orangeL : C.surface2,
                        color: form.proxied ? CF.orange : C.muted,
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      }}>
                      {form.proxied ? '🟠 Ativo' : '⚪ Desligado'}
                    </button>
                  </div>
                )}
              </div>

              {/* Priority (MX, SRV) */}
              {['MX', 'SRV', 'URI'].includes(form.type) && (
                <div>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Prioridade</label>
                  <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    placeholder="10"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: RADIUS.md, boxSizing: 'border-box',
                      border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 13 }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <Btn onClick={() => setModal(null)} variant="secondary"
                style={{ width: 'auto', padding: '7px 18px', fontSize: 13 }}>
                Cancelar
              </Btn>
              <Btn onClick={salvar} disabled={salvando}
                style={{ width: 'auto', padding: '7px 18px', fontSize: 13,
                  background: CF.orange, borderColor: CF.orange }}>
                {salvando ? <Spin size={14} /> : (modal === 'criar' ? '✓ Criar' : '✓ Salvar')}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          🌐 {zona.name}
        </span>
        <div style={{ flex: 1, display: 'flex', gap: 6 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && carregar(1)}
            placeholder="Filtrar por nome..."
            style={{ flex: 1, padding: '6px 10px', borderRadius: RADIUS.md,
              border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 12 }} />
          <select value={filTipo} onChange={e => { setFilTipo(e.target.value); carregar(1) }}
            style={{ padding: '6px 10px', borderRadius: RADIUS.md,
              border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: 12 }}>
            <option value="">Todos os tipos</option>
            {TIPOS_DNS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Btn onClick={abrirCriar}
          style={{ width: 'auto', padding: '6px 14px', fontSize: 12,
            background: CF.orange, borderColor: CF.orange }}>
          ＋ Novo registro
        </Btn>
        <Btn onClick={purgeCache} disabled={purgando} variant="secondary"
          style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
          title="Purgar cache da zona">
          {purgando ? <Spin size={12} /> : '🧹 Purge'}
        </Btn>
      </div>

      <PageCard style={{ padding: 0 }}>
        <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px` }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : registros.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>Nenhum registro encontrado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {['Tipo', 'Nome', 'Conteúdo', 'TTL', 'Proxy', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left',
                      color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge color={COR_TIPO[r.type] || C.muted}>{r.type}</Badge>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: C.text, maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: C.muted, maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.content}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', color: C.muted }}>
                      {r.ttl === 1 ? 'Auto' : `${r.ttl}s`}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.proxied
                        ? <span style={{ color: CF.orange, fontWeight: 700 }}>🟠</span>
                        : <span style={{ color: C.muted }}>⚪</span>
                      }
                    </td>
                    <td style={{ padding: '8px 12px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => abrirEditar(r)} title="Editar"
                        style={{ cursor: 'pointer', background: 'none', border: 'none',
                          color: C.muted, padding: '2px 4px', borderRadius: RADIUS.sm }}>
                        {Ico.save}
                      </button>
                      <button onClick={() => excluir(r)} title="Excluir"
                        disabled={excluindo === r.id}
                        style={{ cursor: 'pointer', background: 'none', border: 'none',
                          color: excluindo === r.id ? C.muted : CF.err,
                          padding: '2px 4px', borderRadius: RADIUS.sm }}>
                        {excluindo === r.id ? <Spin size={12} /> : Ico.trash}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 50 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: SPACE.md }}>
            <Btn onClick={() => carregar(pagina - 1)} variant="secondary"
              style={{ width: 'auto', padding: '4px 14px', fontSize: 12 }}
              disabled={pagina <= 1}>← Anterior</Btn>
            <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>Pág. {pagina}</span>
            <Btn onClick={() => carregar(pagina + 1)} variant="secondary"
              style={{ width: 'auto', padding: '4px 14px', fontSize: 12 }}
              disabled={registros.length < 50}>Próxima →</Btn>
          </div>
        )}
      </PageCard>
    </div>
  )
}

// ─── ABA: Analytics ────────────────────────────────────────────
function AbaAnalytics({ zona }) {
  const [dados,   setDados]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [horas,   setHoras]   = useState(24)

  const carregar = useCallback(async () => {
    if (!zona) return
    setLoading(true)
    try {
      const d = await cloudflareService.analytics(zona.id, horas)
      setDados(d.analytics)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [zona, horas])

  useEffect(() => { carregar() }, [carregar])

  if (!zona) return (
    <PageCard>
      <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
        Selecione uma zona na aba <strong>Zonas</strong>.
      </p>
    </PageCard>
  )

  const tot = dados?.totals
  const series = dados?.timeseries || []

  const req    = series.map(t => t?.requests?.all   || 0)
  const banda  = series.map(t => t?.bandwidth?.all  || 0)
  const ameaças = series.map(t => t?.threats?.all   || 0)
  const cache  = series.map(t => t?.requests?.cached || 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>🌐 {zona.name} — Período:</span>
        {[6, 12, 24, 48, 168].map(h => (
          <button key={h} onClick={() => setHoras(h)} style={{
            padding: '4px 12px', borderRadius: 20, cursor: 'pointer', border: 'none', fontSize: 11,
            background: horas === h ? CF.orange : C.border,
            color: horas === h ? '#fff' : C.text, fontWeight: horas === h ? 700 : 400,
          }}>
            {h < 24 ? `${h}h` : h === 24 ? '24h' : h === 48 ? '2d' : '7d'}
          </button>
        ))}
        <Btn onClick={carregar} variant="secondary" style={{ width: 'auto', padding: '4px 12px', fontSize: 11 }}>
          {Ico.refresh}
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size={24} /></div>
      ) : (
        <>
          {/* Cards de totais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Requisições',  val: numK(tot?.requests?.all),     spark: req,    color: '#3b82f6' },
              { label: 'Cached',       val: numK(tot?.requests?.cached),  spark: cache,  color: CF.active },
              { label: 'Banda total',  val: bytes(tot?.bandwidth?.all),   spark: banda,  color: CF.orange },
              { label: 'Ameaças',      val: numK(tot?.threats?.all),      spark: ameaças, color: CF.err  },
            ].map(({ label, val, spark, color }) => (
              <PageCard key={label} style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 8 }}>{val ?? '—'}</div>
                <Sparkline data={spark} color={color} width={140} height={32} />
              </PageCard>
            ))}
          </div>

          {/* Detalhes */}
          {tot && (
            <PageCard>
              <SectionTitle icon={<span style={{ fontSize: 16 }}>📊</span>}>Detalhes do período</SectionTitle>
              <Row label="Requisições não-cached" value={numK(tot.requests?.uncached)} />
              <Row label="Status 2xx"             value={numK(tot.requests?.http_status?.['200'])} />
              <Row label="Status 4xx"             value={numK(tot.pageviews?.all)} />
              <Row label="Page Views"             value={numK(tot.pageviews?.all)} />
              <Row label="Visitantes únicos"      value={numK(tot.uniques?.all)} />
              <Row label="Banda servida"          value={bytes(tot.bandwidth?.all)} />
              <Row label="Banda cached"           value={bytes(tot.bandwidth?.cached)} />
              <Row label="Banda não-cached"       value={bytes(tot.bandwidth?.uncached)} />
            </PageCard>
          )}
        </>
      )}
    </div>
  )
}

// ─── ABA: Workers ──────────────────────────────────────────────
function AbaWorkers() {
  const [workers, setWorkers] = useState([])
  const [aviso,   setAviso]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cloudflareService.workers()
      .then(d => { setWorkers(d.workers || []); setAviso(d.aviso || null) })
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <PageCard>
      <SectionTitle icon={<span style={{ fontSize: 16 }}>⚙️</span>}>Workers da conta</SectionTitle>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
      ) : aviso ? (
        <p style={{ color: CF.warn, fontSize: 13 }}>⚠ {aviso}</p>
      ) : workers.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Nenhum Worker encontrado nesta conta.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workers.map(w => (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${SPACE.sm}px ${SPACE.md}px`,
              borderRadius: RADIUS.md, background: C.surface2, border: `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{w.id}</div>
                {w.modified_on && (
                  <div style={{ fontSize: 11, color: C.muted }}>
                    Modificado: {new Date(w.modified_on).toLocaleString('pt-BR')}
                  </div>
                )}
              </div>
              {w.usage_model && (
                <Badge color={CF.orange}>{w.usage_model}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </PageCard>
  )
}

// ═══════════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════════

// ─── ABA: R2 Storage ──────────────────────────────────────────
function AbaR2() {
  const [view,      setView]      = useState('overview')   // 'overview' | 'browser'
  const [buckets,   setBuckets]   = useState([])
  const [usage,     setUsage]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [bucketSel, setBucketSel] = useState(null)

  // Browser
  const [objetos,   setObjetos]   = useState([])
  const [prefixos,  setPrefixos]  = useState([])
  const [prefix,    setPrefix]    = useState('')
  const [cursor,    setCursor]    = useState('')
  const [truncated, setTruncated] = useState(false)
  const [loadingObj,setLoadingObj]= useState(false)
  const [selected,  setSelected]  = useState(new Set())

  // Criar bucket
  const [showCreate, setShowCreate] = useState(false)
  const [nomeBucket, setNomeBucket] = useState('')
  const [criando,    setCriando]    = useState(false)
  const [erroCreate, setErroCreate] = useState('')

  // Delete
  const [deleting, setDeleting] = useState(false)

  // Upload
  const [uploading, setUploading] = useState(false)
  const fileInputRef = React.useRef(null)

  async function uploadArquivo(e) {
    const file = e.target.files?.[0]
    if (!file || !bucketSel) return
    setUploading(true)
    try {
      await cloudflareService.uploadObjeto(bucketSel.nome, prefix, file)
      toast.success(`"${file.name}" enviado para R2!`)
      carregarObjetos(bucketSel, prefix, '')
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  // ── Carrega buckets + usage ─────────────────────────────────
  const carregarOverview = useCallback(async () => {
    setLoading(true)
    try {
      const [b, u] = await Promise.all([
        cloudflareService.listarBuckets(),
        cloudflareService.usageR2().catch(() => null),
      ])
      setBuckets(b.buckets || [])
      setUsage(u)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregarOverview() }, [carregarOverview])

  // ── Carrega objetos do bucket ───────────────────────────────
  const carregarObjetos = useCallback(async (b, pref = '', cur = '') => {
    if (!b) return
    setLoadingObj(true)
    try {
      const d = await cloudflareService.listarObjetos(b.nome, {
        prefix: pref, cursor: cur, limit: 250, delim: '/',
      })
      setObjetos(d.objetos  || [])
      setPrefixos(d.prefixos || [])
      setTruncated(d.truncated || false)
      setCursor(d.cursor || '')
      setSelected(new Set())
    } catch (err) { toast.error(err.message) }
    finally { setLoadingObj(false) }
  }, [])

  function abrirBucket(b) {
    setBucketSel(b); setPrefix(''); setCursor('')
    setView('browser'); carregarObjetos(b, '', '')
  }

  function navPrefix(p) {
    setPrefix(p); carregarObjetos(bucketSel, p, '')
  }

  // ── Criar bucket ────────────────────────────────────────────
  async function criarBucket() {
    if (!nomeBucket.trim()) return
    setCriando(true); setErroCreate('')
    try {
      await cloudflareService.criarBucket(nomeBucket.trim())
      toast.success(`Bucket "${nomeBucket}" criado!`)
      setShowCreate(false); setNomeBucket(''); carregarOverview()
    } catch (err) { setErroCreate(err.message) }
    finally { setCriando(false) }
  }

  // ── Deletar objetos selecionados ────────────────────────────
  async function deletarSelecionados() {
    if (!selected.size || !bucketSel) return
    setDeleting(true)
    try {
      const keys = [...selected]
      await cloudflareService.deletarObjetos(bucketSel.nome, keys)
      toast.success(`${keys.length} objeto(s) removido(s)`)
      carregarObjetos(bucketSel, prefix, '')
    } catch (err) { toast.error(err.message) }
    finally { setDeleting(false) }
  }

  // ── Deletar um objeto ───────────────────────────────────────
  async function deletarUm(key) {
    try {
      await cloudflareService.deletarObjeto(bucketSel.nome, key)
      toast.success('Objeto removido')
      carregarObjetos(bucketSel, prefix, '')
    } catch (err) { toast.error(err.message) }
  }

  function toggleSelect(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === objetos.length) setSelected(new Set())
    else setSelected(new Set(objetos.map(o => o.key)))
  }

  function bytes(n) {
    if (!n) return '0 B'
    const u = ['B','KB','MB','GB','TB']; let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(1)} ${u[i]}`
  }

  // ── Breadcrumb do prefix ────────────────────────────────────
  function Breadcrumb() {
    const partes = prefix.split('/').filter(Boolean)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
        <button onClick={() => navPrefix('')}
          style={{ background: 'none', border: 'none', color: CF.orange, cursor: 'pointer', fontWeight: 600 }}>
          {bucketSel?.nome}
        </button>
        {partes.map((p, i) => {
          const target = partes.slice(0, i + 1).join('/') + '/'
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: C.muted }}>/</span>
              <button onClick={() => navPrefix(target)}
                style={{ background: 'none', border: 'none',
                  color: i === partes.length - 1 ? C.text : CF.orange,
                  cursor: i === partes.length - 1 ? 'default' : 'pointer', fontWeight: 600 }}>
                {p}
              </button>
            </span>
          )
        })}
      </div>
    )
  }

  // ═══ OVERVIEW ════════════════════════════════════════════════
  if (view === 'overview') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Modal criar bucket */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: '#0008',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: RADIUS.lg, padding: SPACE.xl2, width: '100%', maxWidth: 380,
            boxShadow: '0 20px 60px #0005' }}>
            <h3 style={{ margin: `0 0 ${SPACE.lg}px`, color: C.text, fontSize: FONT.lg }}>
              🪣 Novo Bucket R2
            </h3>
            <div style={{ marginBottom: SPACE.md }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase' }}>
                Nome
              </label>
              <input value={nomeBucket}
                onChange={e => setNomeBucket(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="meu-bucket"
                onKeyDown={e => e.key === 'Enter' && criarBucket()}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                  borderRadius: RADIUS.md, border: `1px solid ${C.border}`,
                  background: C.surface2, color: C.text, fontSize: 13 }} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Apenas letras minúsculas, números e hífens
              </div>
            </div>
            {erroCreate && (
              <div style={{ fontSize: 12, color: CF.err, marginBottom: SPACE.md }}>{erroCreate}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowCreate(false)} variant="secondary"
                style={{ width: 'auto', padding: '6px 16px', fontSize: 12 }}>
                Cancelar
              </Btn>
              <Btn onClick={criarBucket} disabled={!nomeBucket.trim() || criando}
                style={{ width: 'auto', padding: '6px 16px', fontSize: 12,
                  background: CF.orange, borderColor: CF.orange }}>
                {criando ? <Spin size={12} /> : '✓ Criar'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Cards de uso total */}
      {usage && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10 }}>
          {[
            { l: 'Armazenamento', v: bytes(usage.totalBytes),   c: CF.orange },
            { l: 'Objetos',       v: (usage.totalObjetos||0).toLocaleString('pt-BR'), c: C.blue },
            { l: 'Buckets',       v: String(buckets.length),   c: C.purple },
          ].map(({ l, v, c }) => (
            <PageCard key={l} style={{ padding: '12px 14px', background: C.surface }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
            </PageCard>
          ))}
        </div>
      )}

      {/* Header + botão criar */}
      <PageCard style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.md}px` }}>
          <SectionTitle icon={<span style={{ fontSize: 15 }}>🪣</span>}>
            Buckets ({buckets.length})
          </SectionTitle>
          <Btn onClick={() => setShowCreate(true)}
            style={{ width: 'auto', padding: '5px 14px', fontSize: 12,
              background: CF.orange, borderColor: CF.orange }}>
            + Novo bucket
          </Btn>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : buckets.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
            Nenhum bucket encontrado. Crie o primeiro!
          </p>
        ) : (
          <div>
            {buckets.map(b => {
              const u = usage?.buckets?.find(x => x.nome === b.nome) || b
              return (
                <div key={b.nome || b.name}
                  onClick={() => abrirBucket({ nome: b.nome || b.name, criado: b.criado || b.creation_date })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${SPACE.md}px ${SPACE.lg}px`,
                    borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                    transition: 'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = CF.orangeL}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🪣</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {b.nome || b.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {b.criado || b.creation_date
                          ? new Date(b.criado || b.creation_date).toLocaleDateString('pt-BR')
                          : '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {u.bytes != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{bytes(u.bytes)}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{(u.objetos||0).toLocaleString('pt-BR')} obj</div>
                      </div>
                    )}
                    <span style={{ color: CF.orange, fontSize: 14 }}>→</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, borderTop: `1px solid ${C.border}` }}>
          <Btn onClick={carregarOverview} variant="secondary"
            style={{ width: 'auto', padding: '5px 14px', fontSize: 11 }}>
            {Ico.refresh} Atualizar
          </Btn>
        </div>
      </PageCard>
    </div>
  )

  // ═══ BROWSER ═════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={() => { setView('overview'); setBucketSel(null) }} variant="secondary"
          style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}>
          ← Buckets
        </Btn>
        <Breadcrumb />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {selected.size > 0 && (
            <Btn onClick={deletarSelecionados} disabled={deleting}
              style={{ width: 'auto', padding: '5px 12px', fontSize: 12,
                background: CF.err, borderColor: CF.err }}>
              {deleting ? <Spin size={12} /> : `🗑 Deletar ${selected.size}`}
            </Btn>
          )}
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={uploadArquivo} />
          <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading} variant="secondary"
            style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}>
            {uploading ? <Spin size={12} /> : '⬆ Upload'}
          </Btn>
          <Btn onClick={() => carregarObjetos(bucketSel, prefix, '')} variant="secondary"
            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}>
            {Ico.refresh}
          </Btn>
        </div>
      </div>

      <PageCard style={{ padding: 0 }}>
        {/* Sub-header do bucket */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${SPACE.md}px ${SPACE.lg}px`, borderBottom: `1px solid ${C.border}`,
          background: C.surface2 }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            {loadingObj ? 'Carregando…'
              : `${prefixos.length} pasta(s) · ${objetos.length} objeto(s)`
                + (truncated ? ' (há mais)' : '')}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: C.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.size === objetos.length && objetos.length > 0}
              onChange={toggleAll}
              style={{ width: 13, height: 13, accentColor: CF.orange }} />
            Selecionar todos
          </label>
        </div>

        {loadingObj ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : (prefixos.length === 0 && objetos.length === 0) ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
            Pasta vazia.
          </p>
        ) : (
          <div>
            {/* Pastas (prefixos) */}
            {prefixos.map(p => (
              <div key={p} onClick={() => navPrefix(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
                  borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = CF.orangeL}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 16 }}>📁</span>
                <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
                  {p.replace(prefix, '').replace(/\/$/, '')}
                </span>
                <span style={{ fontSize: 11, color: CF.orange }}>→</span>
              </div>
            ))}

            {/* Objetos */}
            {objetos.map(o => {
              const nome = (o.key || '').replace(prefix, '')
              const ext  = nome.split('.').pop() || ''
              const ICON = { jpg:'🖼',jpeg:'🖼',png:'🖼',gif:'🖼',webp:'🖼',svg:'🖼',
                pdf:'📄', zip:'📦', gz:'📦', md:'📝', json:'🗒', js:'📜', ts:'📜',
                html:'🌐', css:'🎨', mp4:'🎬', mp3:'🎵' }
              const icon = ICON[ext.toLowerCase()] || '📄'
              const isSel = selected.has(o.key)

              return (
                <div key={o.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                    padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
                    borderBottom: `1px solid ${C.border}`,
                    background: isSel ? CF.orangeL : 'transparent',
                    transition: 'background .1s' }}>
                  <input type="checkbox" checked={isSel}
                    onChange={() => toggleSelect(o.key)}
                    style={{ width: 13, height: 13, accentColor: CF.orange, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nome}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, display: 'flex', gap: 8 }}>
                      {o.size != null && <span>{bytes(o.size)}</span>}
                      {o.uploaded && <span>{new Date(o.uploaded).toLocaleString('pt-BR')}</span>}
                    </div>
                  </div>
                  <button onClick={() => deletarUm(o.key)} title="Deletar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: CF.err, padding: '2px 4px', borderRadius: RADIUS.sm,
                      flexShrink: 0 }}>
                    {Ico.trash}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Paginação cursor */}
        {truncated && cursor && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.md }}>
            <Btn onClick={() => carregarObjetos(bucketSel, prefix, cursor)} variant="secondary"
              style={{ width: 'auto', padding: '5px 16px', fontSize: 12 }}>
              Carregar mais →
            </Btn>
          </div>
        )}
      </PageCard>
    </div>
  )
}

// ─── ABA: SSL ─────────────────────────────────────────────────
function AbaSsl({ zona }) {
  const [dados,   setDados]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!zona) return
    setLoading(true)
    cloudflareService.ssl(zona.id)
      .then(d => setDados(d))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [zona])

  if (!zona) return (
    <PageCard>
      <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
        Selecione uma zona na aba <strong>Zonas</strong>.
      </p>
    </PageCard>
  )

  const SSL_MODOS = {
    off:       { cor: CF.err,    label: 'Desligado',    desc: 'Sem criptografia' },
    flexible:  { cor: CF.warn,   label: 'Flexível',     desc: 'CF↔visitante cifrado, CF↔servidor não' },
    full:      { cor: '#3b82f6', label: 'Full',         desc: 'CF↔visitante e CF↔servidor cifrados (sem verificar cert)' },
    strict:    { cor: CF.active, label: 'Full (Strict)', desc: 'Cadeia completa com certificado válido' },
  }
  const modo = SSL_MODOS[dados?.modo?.value] || { cor: C.muted, label: dados?.modo?.value || '—', desc: '' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageCard>
        <SectionTitle icon={<span style={{ fontSize: 16 }}>🔒</span>}>
          Modo SSL/TLS — <span style={{ fontSize: 13, fontWeight: 600, color: modo.cor }}>{zona.name}</span>
        </SectionTitle>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0 10px' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: modo.cor,
                boxShadow: `0 0 6px ${modo.cor}`, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: modo.cor }}>{modo.label}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{modo.desc}</span>
            </div>
            <Row label="Valor interno" value={dados?.modo?.value} mono />
            <Row label="Editável"      value={dados?.modo?.editable ? 'Sim' : 'Não'} />
          </>
        )}
      </PageCard>

      {dados?.certs?.length > 0 && (
        <PageCard>
          <SectionTitle icon={<span style={{ fontSize: 16 }}>📜</span>}>
            Certificados ({dados.certs.length})
          </SectionTitle>
          {dados.certs.map(cert => {
            const exp = cert.certificates?.[0]?.expires_on
            const sts = cert.status
            const cor = sts === 'active' ? CF.active : sts === 'pending_validation' ? CF.warn : CF.err
            return (
              <div key={cert.id} style={{ padding: `${SPACE.sm}px 0`,
                borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{cert.type}</span>
                  <Badge color={cor}>{sts}</Badge>
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
                  {cert.hosts?.join(', ')}
                </div>
                {exp && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    Expira: {new Date(exp).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            )
          })}
        </PageCard>
      )}
    </div>
  )
}

// ─── ABA: Firewall / Segurança ─────────────────────────────────
function AbaFirewall({ zona }) {
  const [eventos, setEventos] = useState([])
  const [aviso,   setAviso]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [limit,   setLimit]   = useState(50)

  const carregar = useCallback(async (lim = limit) => {
    if (!zona) return
    setLoading(true)
    try {
      const d = await cloudflareService.firewall(zona.id, lim)
      setEventos(d.eventos || [])
      setAviso(d.aviso    || null)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [zona, limit])

  useEffect(() => { carregar() }, [carregar])

  if (!zona) return (
    <PageCard>
      <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
        Selecione uma zona na aba <strong>Zonas</strong>.
      </p>
    </PageCard>
  )

  const ACAO_COR = {
    block: CF.err, challenge: CF.warn, jschallenge: CF.warn,
    managedChallenge: CF.warn, allow: CF.active, log: '#3b82f6',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>🌐 {zona.name} — últimos:</span>
        {[25, 50, 100].map(n => (
          <button key={n} onClick={() => { setLimit(n); carregar(n) }}
            style={{ padding: '4px 12px', borderRadius: 20, cursor: 'pointer', border: 'none',
              fontSize: 11, background: limit === n ? CF.orange : C.border,
              color: limit === n ? '#fff' : C.text, fontWeight: limit === n ? 700 : 400 }}>
            {n}
          </button>
        ))}
        <Btn onClick={() => carregar()} variant="secondary"
          style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}>{Ico.refresh}</Btn>
      </div>

      <PageCard style={{ padding: 0 }}>
        {aviso && (
          <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, background: CF.warnL,
            borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: CF.warn }}>⚠ {aviso}</span>
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
        ) : eventos.length === 0 ? (
          <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
            {aviso ? 'Requer plano Pro ou superior.' : 'Nenhum evento de segurança encontrado.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {['Data/Hora', 'Ação', 'IP', 'País', 'Host', 'URI', 'Regra'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left',
                      color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventos.map((e, i) => {
                  const acao = e.action || e.type || '—'
                  const cor  = ACAO_COR[acao] || C.muted
                  return (
                    <tr key={e.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 10px', color: C.muted, whiteSpace: 'nowrap' }}>
                        {e.occurred_at ? new Date(e.occurred_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <Badge color={cor}>{acao}</Badge>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: C.text }}>
                        {e.client_ip || e.clientIP || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: C.muted }}>
                        {e.country || e.clientCountryName || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: C.muted, maxWidth: 140, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.host || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: C.muted,
                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.uri || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: C.muted, fontSize: 10 }}>
                        {e.rule_id || e.ruleId || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  )
}

// ─── ABA: Page Rules ───────────────────────────────────────────
function AbaPageRules({ zona }) {
  const [regras,  setRegras]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!zona) return
    setLoading(true)
    cloudflareService.pagerules(zona.id)
      .then(d => setRegras(d.pagerules || []))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [zona])

  if (!zona) return (
    <PageCard>
      <p style={{ color: C.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>
        Selecione uma zona na aba <strong>Zonas</strong>.
      </p>
    </PageCard>
  )

  function formatarAcao(action) {
    const label = action.id?.replace(/_/g, ' ') || action.id || '—'
    const valor = typeof action.value === 'object'
      ? JSON.stringify(action.value)
      : String(action.value ?? '')
    return { label, valor }
  }

  return (
    <PageCard>
      <SectionTitle icon={<span style={{ fontSize: 16 }}>📐</span>}>
        Page Rules de {zona.name} ({regras.length})
      </SectionTitle>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={20} /></div>
      ) : regras.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13, padding: '20px 0' }}>
          Nenhuma page rule ativa. Gerencie em{' '}
          <a href="https://dash.cloudflare.com" target="_blank" rel="noopener"
            style={{ color: CF.orange }}>dash.cloudflare.com</a>.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: SPACE.md }}>
          {regras.map((r, i) => (
            <div key={r.id || i} style={{
              borderRadius: RADIUS.md, border: `1px solid ${C.border}`,
              background: C.surface2, overflow: 'hidden',
            }}>
              {/* Target URL */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', borderBottom: `1px solid ${C.border}`,
                background: r.status === 'active' ? CF.orangeL : C.border + '44' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.text, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.targets?.[0]?.constraint?.value || '—'}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 10 }}>
                  <Badge color={r.status === 'active' ? CF.active : CF.warn}>{r.status}</Badge>
                  <span style={{ fontSize: 11, color: C.muted }}>#{r.priority}</span>
                </div>
              </div>
              {/* Ações */}
              <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(r.actions || []).map((a, j) => {
                  const { label, valor } = formatarAcao(a)
                  return (
                    <span key={j} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: C.border, color: C.text,
                    }}>
                      <strong style={{ color: CF.orange }}>{label}</strong>
                      {valor && <span style={{ color: C.muted }}> → {valor.slice(0, 40)}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageCard>
  )
}

export default function AbaCloudflare() {
  const [abaAtiva,      setAbaAtiva]      = useState('geral')
  const [statusCF,      setStatusCF]      = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [zonaSelecionada, setZonaSelecionada] = useState(null)

  const carregarStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const d = await cloudflareService.status()
      setStatusCF(d)
    } catch (err) {
      setStatusCF({ ok: false, erro: err.message })
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => { carregarStatus() }, [carregarStatus])

  const tokenAtivo = statusCF?.ok && statusCF?.token?.status === 'active'

  const ABAS = [
    { id: 'geral',      label: '🔑 Visão Geral' },
    { id: 'zonas',      label: '🌐 Zonas',        req: tokenAtivo },
    { id: 'dns',        label: '📋 DNS',          req: tokenAtivo, sub: zonaSelecionada?.name },
    { id: 'ssl',        label: '🔒 SSL',          req: tokenAtivo, sub: zonaSelecionada?.name },
    { id: 'firewall',   label: '🛡 Firewall',      req: tokenAtivo, sub: zonaSelecionada?.name },
    { id: 'pagerules',  label: '📐 Page Rules',   req: tokenAtivo, sub: zonaSelecionada?.name },
    { id: 'analytics',  label: '📊 Analytics',    req: tokenAtivo, sub: zonaSelecionada?.name },
    { id: 'workers',    label: '⚙️ Workers',      req: tokenAtivo },
    { id: 'r2',         label: '🪣 R2 Storage',   req: tokenAtivo },
  ]

  function selecionarZona(z) {
    setZonaSelecionada(z)
    setAbaAtiva('dns')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header com logo Cloudflare */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 18px', borderRadius: RADIUS.lg,
        background: C.surface, border: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: RADIUS.md,
          background: CF.orangeL, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22, flexShrink: 0,
        }}>
          ☁️
        </div>
        <div>
          <div style={{ fontSize: FONT.lg, fontWeight: 800, color: CF.orange }}>Cloudflare</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {loadingStatus
              ? 'Verificando...'
              : tokenAtivo
                ? `✅ Conectado — ${statusCF?.conta?.name || 'Conta ativa'}`
                : '⚠ Token não configurado ou inválido'}
          </div>
        </div>
        {!loadingStatus && (
          <div style={{ marginLeft: 'auto' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: tokenAtivo ? CF.active : CF.err,
              boxShadow: `0 0 6px ${tokenAtivo ? CF.active : CF.err}`,
            }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        padding: '6px 8px', background: C.surface2,
        borderRadius: RADIUS.md, border: `1px solid ${C.border}`,
      }}>
        {ABAS.filter(a => a.req !== false).map(a => (
          <button
            key={a.id}
            onClick={() => setAbaAtiva(a.id)}
            disabled={a.req === false}
            style={{
              padding: '5px 14px', borderRadius: RADIUS.sm, cursor: 'pointer',
              border: 'none', fontSize: 12, fontWeight: abaAtiva === a.id ? 700 : 400,
              background: abaAtiva === a.id ? CF.orange : 'transparent',
              color: abaAtiva === a.id ? '#fff' : a.req === false ? C.muted : C.text,
              transition: 'all 0.15s',
            }}
          >
            {a.label}
            {a.sub && <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 4 }}>({a.sub})</span>}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {abaAtiva === 'geral'      && <AbaGeral     status={statusCF} carregando={loadingStatus} recarregar={carregarStatus} />}
      {abaAtiva === 'zonas'      && <AbaZonas     onSelecionarZona={selecionarZona} zonaSelecionada={zonaSelecionada} />}
      {abaAtiva === 'dns'        && <AbaDns       zona={zonaSelecionada} />}
      {abaAtiva === 'ssl'        && <AbaSsl       zona={zonaSelecionada} />}
      {abaAtiva === 'firewall'   && <AbaFirewall  zona={zonaSelecionada} />}
      {abaAtiva === 'pagerules'  && <AbaPageRules zona={zonaSelecionada} />}
      {abaAtiva === 'analytics'  && <AbaAnalytics zona={zonaSelecionada} />}
      {abaAtiva === 'workers'    && <AbaWorkers />}
      {abaAtiva === 'r2'         && <AbaR2 />}
    </div>
  )
}
