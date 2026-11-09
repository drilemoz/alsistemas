/**
 * AdminRssImport.jsx — Importação de Notícias via RSS
 *
 * MIGRADO: DS Sprint
 *   - ModalFonte inline (position:fixed)  → DSModal
 *   - Banner informativo inline            → DSAlert variant="blue"
 *   - Badges PADRÃO/INATIVA/AUTO inline   → DSBadge
 *   - Confirmação excluir inline           → DSBadge + DSBtn pattern
 *   - Cores hex hardcoded                  → T.*
 *   - borderRadius arbitrários            → RADIUS.*
 *   - Espaçamentos                        → SPACE.*
 *   - Tipografia                          → FONT.*
 *
 * Funcionalidades preservadas integralmente:
 *  - Listar fontes RSS (padrão + customizadas)
 *  - Adicionar fontes padrão com um clique
 *  - Cadastrar fontes customizadas manualmente
 *  - Testar URL de feed antes de salvar
 *  - Importar individual e em massa
 *  - Configurar auto-atualização periódica
 *  - Ver histórico de última importação
 */
import { useState } from 'react'
import { rssService, categoriasService } from '../../services/api'
import toast from 'react-hot-toast'
import { useRss } from '../../hooks/useRss'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSModal, DSBtn, DSBadge, DSAlert } from '../../components/admin/ui/DS'

// ─── Helpers ──────────────────────────────────────────────────
function formatarData(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function formatarIntervalo(min) {
  if (!min) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ─── Modal de cadastro / edição ───────────────────────────────
function ModalFonte({ fonte, categorias, onSalvar, onFechar }) {
  const editando = !!fonte?.id

  const [form, setForm] = useState({
    nome:          fonte?.nome          || '',
    url:           fonte?.url           || '',
    ativa:         fonte?.ativa         ?? true,
    categoria_id:  fonte?.categoria_id?.id || fonte?.categoria_id || '',
    max_items:     fonte?.max_items     || 10,
    auto_update:   fonte?.auto_update   ?? false,
    intervalo_min: fonte?.intervalo_min || 60,
  })
  const [testando,  setTestando]  = useState(false)
  const [salvando,  setSalvando]  = useState(false)
  const [testeOk,   setTesteOk]   = useState(null)

  function set(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }))
    setTesteOk(null)
  }

  async function handleTestar() {
    if (!form.url.trim()) return toast.error('Informe a URL do feed RSS')
    setTestando(true)
    try {
      const r = await rssService.testarUrl(form.url.trim())
      setTesteOk(r)
      toast.success(`Feed válido — ${r.total_itens} item(ns) encontrado(s)`)
    } catch (err) {
      setTesteOk(null)
      toast.error(err.message || 'Feed inválido ou inacessível')
    } finally { setTestando(false) }
  }

  async function handleSalvar(e) {
    e?.preventDefault()
    if (!form.nome.trim()) return toast.error('Nome é obrigatório')
    if (!form.url.trim())  return toast.error('URL é obrigatória')
    setSalvando(true)
    try {
      await onSalvar({
        ...form,
        max_items:     Number(form.max_items),
        intervalo_min: Number(form.intervalo_min),
      })
    } finally { setSalvando(false) }
  }

  const labelSty = { fontSize: FONT.sm, fontWeight: 600, color: 'var(--adm-muted)', display: 'block', marginBottom: SPACE.xs + 1, textTransform: 'uppercase', letterSpacing: '.04em' }

  return (
    <DSModal
      open
      onClose={onFechar}
      title={editando ? 'Editar Fonte RSS' : 'Nova Fonte RSS'}
      size="md"
      footer={
        <>
          <DSBtn variant="primary" loading={salvando} onClick={handleSalvar}>
            {editando ? 'Salvar alterações' : 'Cadastrar fonte'}
          </DSBtn>
          <DSBtn onClick={onFechar} disabled={salvando}>Cancelar</DSBtn>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        {/* Nome */}
        <div>
          <label style={labelSty}>Nome da fonte *</label>
          <input className="adm-input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: CNN Brasil" required />
        </div>

        {/* URL + testar */}
        <div>
          <label style={labelSty}>URL do feed RSS *</label>
          <div style={{ display: 'flex', gap: SPACE.md }}>
            <input className="adm-input" value={form.url} onChange={e => set('url', e.target.value)}
              placeholder="https://exemplo.com/feed.xml" required style={{ flex: 1, minWidth: 0 }} />
            <DSBtn variant="secondary" size="sm" onClick={handleTestar} loading={testando} style={{ flexShrink: 0 }}>
              {testando ? 'Testando…' : 'Testar'}
            </DSBtn>
          </div>
          {testeOk && (
            <div style={{
              marginTop: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`,
              background: C.greenBg, border: `1px solid ${C.greenBorder}`,
              borderRadius: RADIUS.md, fontSize: FONT.base, color: 'var(--adm-text)',
            }}>
              <span style={{ color: C.greenSolid, fontWeight: 700 }}>✓ Feed válido</span>
              {' — '}{testeOk.total_itens} item(ns) encontrado(s)
              {testeOk.preview?.length > 0 && (
                <div style={{ marginTop: SPACE.sm, color: 'var(--adm-muted)' }}>
                  Prévia: <em>{testeOk.preview[0]?.titulo}</em>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Categoria + Máx. itens */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.lg }}>
          <div>
            <label style={labelSty}>Categoria padrão</label>
            <select className="adm-input" value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
              <option value="">— Sem categoria —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={labelSty}>Máx. itens/importação</label>
            <input className="adm-input" type="number" min={1} max={100} value={form.max_items} onChange={e => set('max_items', e.target.value)} />
          </div>
        </div>

        {/* Ativa */}
        <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.md + 2, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.ativa} onChange={e => set('ativa', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--adm-accent)', cursor: 'pointer' }} />
          <span style={{ fontSize: FONT.md, color: 'var(--adm-text)' }}>Fonte ativa</span>
        </label>

        {/* Auto-atualização */}
        <div style={{ borderTop: '1px solid var(--adm-border)', paddingTop: SPACE.lg }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.md + 2, cursor: 'pointer', marginBottom: SPACE.lg }}>
            <input type="checkbox" checked={form.auto_update} onChange={e => set('auto_update', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--adm-accent)', cursor: 'pointer' }} />
            <div>
              <div style={{ fontSize: FONT.md, fontWeight: 600, color: 'var(--adm-text)' }}>Atualização automática</div>
              <div style={{ fontSize: FONT.base, color: 'var(--adm-muted)' }}>Importa automaticamente em intervalos periódicos</div>
            </div>
          </label>
          {form.auto_update && (
            <div>
              <label style={labelSty}>Intervalo (minutos)</label>
              <select className="adm-input" value={form.intervalo_min} onChange={e => set('intervalo_min', Number(e.target.value))}>
                <option value={15}>A cada 15 minutos</option>
                <option value={30}>A cada 30 minutos</option>
                <option value={60}>A cada 1 hora</option>
                <option value={120}>A cada 2 horas</option>
                <option value={360}>A cada 6 horas</option>
                <option value={720}>A cada 12 horas</option>
                <option value={1440}>A cada 24 horas</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </DSModal>
  )
}

// ─── Card de cada fonte RSS ───────────────────────────────────
function CardFonte({ fonte, onImportar, onEditar, onExcluir, importando }) {
  const [confirmExcluir, setConfirmExcluir] = useState(false)

  return (
    <div style={{
      background: 'var(--adm-surface)',
      border: `1px solid var(--adm-border)`,
      borderRadius: RADIUS.xl,
      padding: SPACE.xl,
      display: 'flex', flexDirection: 'column', gap: SPACE.lg,
      opacity: fonte.ativa ? 1 : 0.6,
    }}>
      {/* Linha superior */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.md + 2 }}>
        <div style={{
          width: 36, height: 36, borderRadius: RADIUS.md, flexShrink: 0,
          background: 'rgba(var(--adm-accent-rgb, 99,102,241),.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--adm-accent)" strokeWidth="2" width="18" height="18">
            <path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/>
            <circle cx="5" cy="19" r="1" fill="var(--adm-accent)" stroke="none"/>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: SPACE.xs }}>
            <span style={{ fontWeight: 700, fontSize: FONT.lg - 1, color: 'var(--adm-text)', wordBreak: 'break-word' }}>
              {fonte.nome}
            </span>
            {fonte.padrao    && <DSBadge variant="blue">PADRÃO</DSBadge>}
            {!fonte.ativa    && <DSBadge variant="red">INATIVA</DSBadge>}
            {fonte.auto_update && <DSBadge variant="green">AUTO ⏱ {formatarIntervalo(fonte.intervalo_min)}</DSBadge>}
          </div>
          <a href={fonte.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', wordBreak: 'break-all', textDecoration: 'none', display: 'block' }}
            title={fonte.url}>
            {fonte.url.length > 60 ? fonte.url.slice(0, 60) + '…' : fonte.url}
          </a>
        </div>
      </div>

      {/* Estatísticas */}
      <div style={{ display: 'flex', gap: SPACE.xl, flexWrap: 'wrap' }}>
        {[
          { label: 'Última importação', value: formatarData(fonte.ultima_importacao) },
          { label: 'Total importadas',  value: fonte.total_importadas ?? 0 },
          { label: 'Máx./vez',          value: fonte.max_items ?? 10 },
          ...(fonte.categoria_id ? [{ label: 'Categoria', value: fonte.categoria_id?.nome || fonte.categoria_id }] : []),
        ].map(({ label, value }) => (
          <div key={label} style={{ fontSize: FONT.base }}>
            <span style={{ color: 'var(--adm-muted)' }}>{label}: </span>
            <span style={{ color: 'var(--adm-text)', fontWeight: 500 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Ações */}
      {confirmExcluir ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACE.md, padding: `${SPACE.md}px ${SPACE.lg}px`,
          background: C.redBg, borderRadius: RADIUS.md, border: `1px solid ${C.redBorder}`,
        }}>
          <span style={{ fontSize: FONT.base, color: 'var(--adm-text)', flex: 1 }}>Confirmar exclusão?</span>
          <DSBtn variant="ghost" size="sm" onClick={() => setConfirmExcluir(false)}>Cancelar</DSBtn>
          <DSBtn variant="danger" size="sm" onClick={() => { setConfirmExcluir(false); onExcluir(fonte) }}>Excluir</DSBtn>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap' }}>
          <DSBtn variant="primary" size="sm" loading={importando === fonte.id}
            onClick={() => onImportar(fonte)} style={{ flex: 1, minWidth: 100, justifyContent: 'center' }}>
            {importando === fonte.id ? 'Importando…' : <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Importar agora
            </>}
          </DSBtn>
          <DSBtn variant="secondary" size="sm" onClick={() => onEditar(fonte)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar
          </DSBtn>
          <DSBtn variant="ghost" size="icon" onClick={() => setConfirmExcluir(true)}
            title="Excluir fonte" style={{ color: 'var(--adm-red)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </DSBtn>
        </div>
      )}
    </div>
  )
}

// ─── Painel de fontes padrão ──────────────────────────────────
function PainelFontesPadrao({ padrao, existentes, onAdicionar, adicionando }) {
  const existentesUrls = new Set(existentes.map(f => f.url))
  const disponiveis    = padrao.filter(p => !existentesUrls.has(p.url))
  if (!disponiveis.length) return null

  return (
    <div className="adm-card" style={{ marginBottom: SPACE.xl3 }}>
      <div style={{ fontSize: FONT.md, fontWeight: 700, color: 'var(--adm-text)', marginBottom: SPACE.lg }}>
        📡 Fontes RSS sugeridas — adicione com um clique
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        {disponiveis.map(p => (
          <div key={p.url} style={{
            display: 'flex', alignItems: 'center', gap: SPACE.md + 2,
            padding: `${SPACE.md + 2}px ${SPACE.lg}px`,
            background: 'var(--adm-surface2)', borderRadius: RADIUS.md,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FONT.md, fontWeight: 600, color: 'var(--adm-text)' }}>{p.nome}</div>
              <div style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', wordBreak: 'break-all' }}>{p.url}</div>
            </div>
            <DSBtn variant="secondary" size="sm" loading={adicionando === p.url}
              onClick={() => onAdicionar(p)} style={{ flexShrink: 0 }}>
              {adicionando === p.url ? 'Adicionando…' : '+ Adicionar'}
            </DSBtn>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Painel de resultados da importação ──────────────────────
function PainelResultados({ resultados, onFechar }) {
  if (!resultados) return null
  return (
    <div className="adm-card" style={{ marginBottom: SPACE.xl3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.lg }}>
        <span style={{ fontSize: FONT.md, fontWeight: 700, color: 'var(--adm-text)' }}>Resultado da importação</span>
        <DSBtn variant="ghost" size="icon" onClick={onFechar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </DSBtn>
      </div>

      {resultados.resultados ? (
        <>
          <div style={{ display: 'flex', gap: SPACE.xl2, marginBottom: SPACE.lg }}>
            <div style={{ fontSize: FONT.base }}>
              <span style={{ color: 'var(--adm-muted)' }}>Importadas: </span>
              <span style={{ fontWeight: 700, color: C.greenSolid, fontSize: FONT.xl }}>{resultados.totalImportadas}</span>
            </div>
            <div style={{ fontSize: FONT.base }}>
              <span style={{ color: 'var(--adm-muted)' }}>Duplicadas: </span>
              <span style={{ fontWeight: 700, color: 'var(--adm-muted)', fontSize: FONT.xl }}>{resultados.totalDuplicadas}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
            {resultados.resultados.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: SPACE.md, fontSize: FONT.base,
                padding: `${SPACE.sm}px ${SPACE.md + 2}px`,
                background: 'var(--adm-surface2)', borderRadius: RADIUS.sm,
              }}>
                <span style={{ flex: 1, color: 'var(--adm-text)', fontWeight: 500 }}>{r.fonte}</span>
                {r.erro
                  ? <span style={{ color: C.red }}>❌ {r.erro}</span>
                  : <span style={{ color: C.greenSolid }}>✓ {r.importadas} novas, {r.duplicadas} dup.</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: SPACE.xl2 }}>
          {[
            { label: 'Novas',      value: resultados.importadas, cor: C.greenSolid },
            { label: 'Duplicadas', value: resultados.duplicadas, cor: 'var(--adm-muted)' },
            { label: 'Verificadas', value: resultados.total,     cor: 'var(--adm-text)' },
          ].map(({ label, value, cor }) => (
            <div key={label} style={{ fontSize: FONT.base }}>
              <span style={{ color: 'var(--adm-muted)' }}>{label}: </span>
              <span style={{ fontWeight: 700, color: cor, fontSize: FONT.xl }}>{value}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: SPACE.md + 2, fontSize: FONT.base, color: 'var(--adm-muted)' }}>
        ℹ️ Notícias importadas chegam como <strong>rascunho</strong> para revisão editorial antes de publicar.
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────
export default function AdminRssImport() {
  const {
    fontes, padrao, categorias,
    carregando, importando, importandoTodas, adicionando, resultados,
    setResultados, temFontesAtivas,
    adicionarPadrao, salvarFonte, excluirFonte, importarFonte, importarTodas,
  } = useRss()

  const [modal, setModal] = useState(null)

  async function handleSalvar(dados) {
    try {
      await salvarFonte(dados, modal?.id)
      setModal(null)
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar fonte')
      throw err
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Modal de fonte */}
      {modal !== null && (
        <ModalFonte
          fonte={modal?.id ? modal : null}
          categorias={categorias}
          onSalvar={handleSalvar}
          onFechar={() => setModal(null)}
        />
      )}

      {/* Cabeçalho */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Importar via RSS</div>
          <div className="adm-page-sub">
            Busque notícias automaticamente de feeds RSS externos e importe para o banco de dados.
          </div>
        </div>
        <div style={{ display: 'flex', gap: SPACE.md + 2 }}>
          <DSBtn variant="secondary" size="sm" loading={importandoTodas}
            disabled={importandoTodas || !temFontesAtivas || !!importando}
            onClick={importarTodas}>
            {importandoTodas ? 'Importando…' : <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              Atualizar todas
            </>}
          </DSBtn>
          <DSBtn variant="primary" size="sm" onClick={() => setModal({})}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Nova fonte
          </DSBtn>
        </div>
      </div>

      {/* Banner informativo — antes era inline rgba, agora DSAlert */}
      <DSAlert variant="blue" style={{ marginBottom: SPACE.xl2 }}>
        Notícias importadas são salvas como <strong>rascunho</strong> e incluem automaticamente a fonte.
        Revise e publique cada uma pelo menu <strong>Notícias → Todas as Notícias</strong>.
        A deduplicação por GUID evita importar a mesma notícia duas vezes, mesmo que o título mude.
      </DSAlert>

      {/* Resultados da última importação */}
      <PainelResultados resultados={resultados} onFechar={() => setResultados(null)} />

      {/* Fontes padrão disponíveis */}
      {!carregando && (
        <PainelFontesPadrao
          padrao={padrao}
          existentes={fontes}
          onAdicionar={adicionarPadrao}
          adicionando={adicionando}
        />
      )}

      {/* Lista de fontes cadastradas */}
      {carregando ? (
        <div style={{ textAlign: 'center', padding: `${SPACE.xl5}px 0`, color: 'var(--adm-muted)', fontSize: FONT.lg - 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"
            className="adm-spin" style={{ marginBottom: SPACE.lg, display: 'block', margin: `0 auto ${SPACE.lg}px` }}>
            <path d="M21 12a9 9 0 11-18 0"/>
          </svg>
          Carregando fontes RSS…
        </div>
      ) : fontes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: `${SPACE.xl5}px 0` }}>
          <div style={{ fontSize: 40, marginBottom: SPACE.lg }}>📡</div>
          <div style={{ fontSize: FONT.lg, fontWeight: 600, color: 'var(--adm-text)', marginBottom: SPACE.sm }}>
            Nenhuma fonte RSS cadastrada
          </div>
          <div style={{ fontSize: FONT.md, color: 'var(--adm-muted)', marginBottom: SPACE.xl }}>
            Adicione uma fonte sugerida acima ou cadastre manualmente.
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: FONT.base, fontWeight: 600, color: 'var(--adm-muted)', marginBottom: SPACE.lg, textTransform: 'uppercase', letterSpacing: .5 }}>
            {fontes.length} fonte(s) cadastrada(s)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: SPACE.lg }}>
            {fontes.map(fonte => (
              <CardFonte
                key={fonte.id}
                fonte={fonte}
                onImportar={importarFonte}
                onEditar={setModal}
                onExcluir={excluirFonte}
                importando={importando}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
