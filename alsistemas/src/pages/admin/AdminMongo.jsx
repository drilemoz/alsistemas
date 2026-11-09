import { lazyWithRetry } from '../../utils/lazyWithRetry'
/**
 * AdminMongo.jsx — Gerenciamento MongoDB unificado
 * Tabs: Coleções | Documentos | Aggregate | Banco & Índices
 * Botão ⚙ no header abre modal de configuração do servidor.
 *
 * DS Sprint (conformidade total):
 *   - DSModal       → substitui todos os overlays position:fixed inline
 *   - DSTabs/DSTab  → substitui tabs locais com style condicional
 *   - DSBtn         → substitui factory s.btn()
 *   - DSBadge       → substitui helper s.badge()
 *   - DSAlert       → substitui s.aviso, s.erro, s.ok hardcoded
 *   - DSPageHeader  → substitui header inline
 */
import { useState, useEffect, useCallback, Suspense } from 'react'
import { T as C, SPACE, RADIUS, FONT }  from '../../themes/tokens'
import { mongoService }                 from '../../services/domains/mongo'
import { setupService,
         infraestruturaService }        from '../../services/api'
import ConfirmModal                     from '../../components/ConfirmModal'
import { Spin, StatusDot, Btn, Ico }   from '../../components/admin/infra/InfraBase'
import {
  DSPageHeader,
  DSTabs, DSTab,
  DSBtn, DSBadge, DSAlert, DSModal,
} from '../../components/admin/ui/DS'

const AbaMongoDB = lazyWithRetry(() => import('../../components/admin/infra/AbaMongoDB'))

// ── Estilos sem equivalente no DS (layout, tabela, card clickável) ──

const s = {
  card: {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: RADIUS.lg, padding: SPACE.md,
    cursor: 'pointer', transition: 'border-color .15s',
  },
  colGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: SPACE.md },
  colNome: { fontSize: FONT.md, fontWeight: 700, color: C.text, marginBottom: SPACE.xs, wordBreak: 'break-all' },
  colMeta: { fontSize: FONT.sm, color: C.muted },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: FONT.sm },
  th: { textAlign: 'left', padding: `${SPACE.sm}px ${SPACE.md}px`, color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  td: { padding: `${SPACE.sm}px ${SPACE.md}px`, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  input: { padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontSize: FONT.base, width: '100%', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: FONT.xs, fontWeight: 700, color: C.muted, marginBottom: SPACE.xs, letterSpacing: '.04em', textTransform: 'uppercase' },
  row:   { display: 'flex', gap: SPACE.md, alignItems: 'flex-end', flexWrap: 'wrap' },

  paginacao: { display: 'flex', alignItems: 'center', gap: SPACE.md, justifyContent: 'center', marginTop: SPACE.lg },
  pagInfo:   { fontSize: FONT.sm, color: C.muted },

  campoRow: { marginBottom: SPACE.md },
  idField:  { background: C.border, color: C.muted, userSelect: 'all', borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.md}px`, fontSize: FONT.sm, fontFamily: 'monospace' },
}

// ── Helpers ────────────────────────────────────────────────────

const CAMPOS_RO = ['_id', '__v', 'criado_em', 'createdAt', 'updatedAt']

function truncar(val, max = 60) {
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')
  return str.length > max ? str.slice(0, max) + '…' : str
}
function primeirasChaves(doc, n = 4) {
  return Object.keys(doc).filter(k => k !== '_id').slice(0, n)
}

// ── Ícones inline ──────────────────────────────────────────────

function IcoDb() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ width: 22, height: 22, flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  )
}
function IcoGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

function IcoEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IcoEyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ── Sentinela ─────────────────────────────────────────────────

const SENTINEL = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
const isSentinel = (v) => v === SENTINEL

// ── Campo URI com toggle mostrar/ocultar ──────────────────────

function UriField({ label, value, onChange, placeholder }) {
  const [visivel, setVisivel] = useState(false)
  const configurado = isSentinel(value)

  if (configurado) {
    return (
      <div style={{ marginBottom: SPACE.xs }}>
        <label style={s.label}>{label}</label>
        {/* ✅ DSAlert substitui bloco verde hardcoded (#22c55e*) */}
        <DSAlert variant="green" style={{ marginBottom: SPACE.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: SPACE.sm }}>
            <span style={{ fontWeight: 600 }}>Valor já configurado</span>
            <DSBtn size="sm" variant="ghost" onClick={() => onChange('')}>Alterar</DSBtn>
          </div>
        </DSAlert>
        <p style={{ fontSize: FONT.xs, color: C.muted, marginTop: SPACE.xs }}>
          Clique em "Alterar" para definir uma nova URI. O valor atual não é exibido por segurança.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: SPACE.xs }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
        <label style={s.label}>{label}</label>
        <DSBtn size="sm" variant="ghost" onClick={() => setVisivel(v => !v)}>
          {visivel ? <><IcoEyeOff /> Ocultar</> : <><IcoEye /> Mostrar</>}
        </DSBtn>
      </div>
      <input
        type={visivel ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...s.input, fontFamily: visivel ? 'monospace' : 'inherit', fontSize: visivel ? FONT.sm : FONT.base, letterSpacing: visivel ? 'normal' : '2px' }}
        autoComplete="new-password"
        spellCheck={false}
      />
    </div>
  )
}

// ── Modal: Configurar servidor ─────────────────────────────────
// ✅ DSModal substitui overlay position:fixed inline

function ModalConfigServidor({ aoFechar }) {
  const [uri,        setUri]        = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando,   setSalvando]   = useState(false)
  const [testando,   setTestando]   = useState(false)
  const [resultado,  setResultado]  = useState(null)
  const [erro,       setErro]       = useState('')
  const [sucesso,    setSucesso]    = useState('')

  useEffect(() => {
    setupService.lerEnvConfig()
      .then(d => setUri(d.mongo_uri || ''))
      .catch(() => setErro('Não foi possível carregar a configuração atual.'))
      .finally(() => setCarregando(false))
  }, [])

  const salvar = async () => {
    setSalvando(true); setErro(''); setSucesso(''); setResultado(null)
    try {
      const atual = await setupService.lerEnvConfig()
      await setupService.salvarEnvConfig({ ...atual, mongo_uri: uri })
      setSucesso('URI salva com sucesso! A conexão será usada na próxima requisição.')
    } catch (e) { setErro(e.message || 'Erro ao salvar.') }
    finally     { setSalvando(false) }
  }

  const testar = async () => {
    setTestando(true); setErro(''); setResultado(null); setSucesso('')
    try   { setResultado(await infraestruturaService.testarConexoes()) }
    catch (e) { setErro(e.message || 'Erro ao testar conexão.') }
    finally   { setTestando(false) }
  }

  return (
    <DSModal
      open
      onClose={aoFechar}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}><IcoDb /> Configurar servidor MongoDB</span>}
      footer={
        <>
          <DSBtn variant="ghost" onClick={aoFechar}>Fechar</DSBtn>
          <Btn onClick={testar} loading={testando} variant="ghost">
            {Ico.refresh} Testar conexão
          </Btn>
          <Btn onClick={salvar} loading={salvando} variant="success">
            {Ico.save} Salvar URI
          </Btn>
        </>
      }
    >
      {carregando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2 }}>
          <Spin size={26} />
        </div>
      ) : (
        <>
          {/* ✅ DSAlert substitui bloco azul hardcoded (#3b82f6*) */}
          <DSAlert variant="blue" style={{ marginBottom: SPACE.lg }}>
            Obtenha a Connection String em{' '}
            <a href="https://cloud.mongodb.com" target="_blank" rel="noreferrer" style={{ color: C.blue }}>
              cloud.mongodb.com
            </a>{' '}
            → Database → Connect → Drivers.
          </DSAlert>

          <UriField
            label="Connection String (URI)"
            value={uri}
            onChange={setUri}
            placeholder="mongodb+srv://usuario:senha@cluster.mongodb.net/alsistemas"
          />

          {/* ✅ DSAlert substitui s.erro e s.ok hardcoded */}
          {erro    && <DSAlert variant="red"   style={{ marginTop: SPACE.md }}>{erro}</DSAlert>}
          {sucesso && <DSAlert variant="green" style={{ marginTop: SPACE.md }}>{sucesso}</DSAlert>}

          {resultado && (
            <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.md }}>
              <div style={{ fontWeight: 700, fontSize: FONT.sm, color: C.text, marginBottom: SPACE.sm }}>
                Resultado do teste
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                <StatusDot ok={resultado.mongodb?.ok} />
                <span style={{ fontSize: FONT.sm, color: C.text, fontWeight: 600 }}>MongoDB</span>
                <span style={{ fontSize: FONT.xs, color: C.muted, marginLeft: 'auto' }}>
                  {resultado.mongodb?.estado}
                  {resultado.mongodb?.db ? ` · ${resultado.mongodb.db}` : ''}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </DSModal>
  )
}

// ── Tab Coleções ───────────────────────────────────────────────

function TabColecoes({ aoSelecionarColecao }) {
  const [colecoes,   setColecoes]   = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try   { setColecoes((await mongoService.colecoes()).colecoes || []) }
    catch (e) { setErro(e.message) }
    finally   { setCarregando(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg, gap: SPACE.sm, flexWrap: 'wrap' }}>
        <span style={{ color: C.muted, fontSize: FONT.sm }}>{colecoes.length} coleção(ões)</span>
        {/* ✅ DSBtn substitui <button style={s.btn('primario')}> */}
        <DSBtn variant="primary" onClick={carregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : '↺ Atualizar'}
        </DSBtn>
      </div>

      {/* ✅ DSAlert substitui s.erro hardcoded */}
      {erro && <DSAlert variant="red" style={{ marginBottom: SPACE.md }}>{erro}</DSAlert>}

      {carregando && !colecoes.length
        ? <p style={{ color: C.muted, fontSize: FONT.sm }}>Carregando…</p>
        : (
          <div style={s.colGrid}>
            {colecoes.map(col => (
              <div key={col.nome} style={s.card}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                onClick={() => aoSelecionarColecao(col.nome)}
                title={`Abrir documentos de ${col.nome}`}
              >
                <div style={s.colNome}>{col.nome}</div>
                <div style={s.colMeta}>
                  <span style={{ color: C.blue, fontWeight: 700 }}>{col.total.toLocaleString()}</span>
                  {' '}docs
                  <span style={{ marginLeft: SPACE.sm }}>{col.tamanhoFormatado}</span>
                </div>
              </div>
            ))}
            {!carregando && !colecoes.length && (
              <p style={{ color: C.muted, fontSize: FONT.sm, gridColumn: '1/-1' }}>Nenhuma coleção encontrada.</p>
            )}
          </div>
        )
      }
    </div>
  )
}

// ── Modal Edição de Documento ──────────────────────────────────
// ✅ DSModal substitui overlay position:fixed inline

function ModalEdicao({ doc, colecao, aoSalvar, aoFechar }) {
  const [campos,   setCampos]   = useState({})
  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')

  useEffect(() => {
    if (!doc) return
    const init = {}
    for (const [k, v] of Object.entries(doc)) {
      if (CAMPOS_RO.includes(k)) continue
      init[k] = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '')
    }
    setCampos(init)
  }, [doc])

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const parsed = {}
      for (const [k, v] of Object.entries(campos)) {
        if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
          try { parsed[k] = JSON.parse(v) } catch { parsed[k] = v }
        } else if (v === 'true')  parsed[k] = true
        else if   (v === 'false') parsed[k] = false
        else if (v !== '' && !isNaN(Number(v))) parsed[k] = Number(v)
        else parsed[k] = v
      }
      await mongoService.atualizar(colecao, String(doc._id), parsed)
      aoSalvar()
    } catch (e) { setErro(e.message) }
    finally     { setSalvando(false) }
  }

  if (!doc) return null
  const editaveis = Object.keys(doc).filter(k => !CAMPOS_RO.includes(k))

  return (
    <DSModal
      open
      onClose={aoFechar}
      title={`Editar documento — ${colecao}`}
      footer={
        <>
          <DSBtn variant="ghost" onClick={aoFechar}>Cancelar</DSBtn>
          <DSBtn variant="primary" onClick={salvar} loading={salvando}>Salvar alterações</DSBtn>
        </>
      }
    >
      <div style={{ marginBottom: SPACE.lg }}>
        <div style={s.label}>_id (somente leitura)</div>
        <div style={{ ...s.input, ...s.idField }}>{String(doc._id)}</div>
      </div>

      {/* ✅ DSAlert substitui s.erro hardcoded */}
      {erro && <DSAlert variant="red" style={{ marginBottom: SPACE.md }}>{erro}</DSAlert>}

      {editaveis.map(k => {
        const isLong = typeof campos[k] === 'string' && (campos[k].startsWith('{') || campos[k].startsWith('['))
        return (
          <div key={k} style={s.campoRow}>
            <label style={s.label}>{k}</label>
            {isLong
              ? <textarea value={campos[k] || ''} onChange={e => setCampos(p => ({ ...p, [k]: e.target.value }))} rows={4}
                  style={{ ...s.input, resize: 'vertical', fontFamily: 'monospace', fontSize: FONT.xs }} />
              : <input value={campos[k] || ''} onChange={e => setCampos(p => ({ ...p, [k]: e.target.value }))}
                  style={s.input} />
            }
          </div>
        )
      })}

      {!editaveis.length && <p style={{ color: C.muted, fontSize: FONT.base }}>Nenhum campo editável.</p>}
    </DSModal>
  )
}

// ── Tab Documentos ─────────────────────────────────────────────

function TabDocumentos({ colecaoInicial }) {
  const [colecoes,   setColecoes]   = useState([])
  const [colecao,    setColecao]    = useState(colecaoInicial || '')
  const [filtroJson, setFiltroJson] = useState('')
  const [docs,       setDocs]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [pages,      setPages]      = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState('')
  const [docEditar,  setDocEditar]  = useState(null)
  const [docExcluir, setDocExcluir] = useState(null)
  const [mensagem,   setMensagem]   = useState('')

  useEffect(() => {
    mongoService.colecoes().then(d => setColecoes(d.colecoes || [])).catch(() => {})
  }, [])

  const buscar = useCallback(async (pg = 1) => {
    if (!colecao) return
    setCarregando(true); setErro(''); setMensagem('')
    try {
      if (filtroJson.trim()) {
        try { JSON.parse(filtroJson) }
        catch { setErro('Filtro JSON inválido.'); setCarregando(false); return }
      }
      const params = { page: pg, limit: 20 }
      if (filtroJson.trim()) params.filtro = filtroJson.trim()
      const data = await mongoService.documentos(colecao, params)
      setDocs(data.docs || []); setTotal(data.total || 0)
      setPage(data.page || 1);  setPages(data.pages || 1)
    } catch (e) { setErro(e.message) }
    finally     { setCarregando(false) }
  }, [colecao, filtroJson])

  useEffect(() => { if (colecaoInicial) setColecao(colecaoInicial) }, [colecaoInicial])
  // eslint-disable-next-line
  useEffect(() => { if (colecao) buscar(1) }, [colecao])

  const excluir = async () => {
    if (!docExcluir) return
    try {
      await mongoService.deletar(colecao, String(docExcluir._id))
      setMensagem('Documento excluído.'); setDocExcluir(null); buscar(page)
    } catch (e) { setErro(e.message); setDocExcluir(null) }
  }

  const colunas = docs.length > 0 ? ['_id', ...primeirasChaves(docs[0])] : ['_id']

  return (
    <div>
      <div style={{ ...s.row, marginBottom: SPACE.lg }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={s.label}>Coleção</label>
          <select value={colecao} onChange={e => { setColecao(e.target.value); setPage(1) }}
            style={{ ...s.input, cursor: 'pointer' }}>
            <option value="">— Selecione —</option>
            {colecoes.map(c => <option key={c.nome} value={c.nome}>{c.nome} ({c.total})</option>)}
          </select>
        </div>
        <div style={{ flex: 2, minWidth: '220px' }}>
          <label style={s.label}>Filtro JSON (opcional)</label>
          <input value={filtroJson} onChange={e => setFiltroJson(e.target.value)}
            placeholder='{ "ativo": true }' style={s.input} />
        </div>
        <div>
          <label style={s.label}>&nbsp;</label>
          {/* ✅ DSBtn substitui <button style={s.btn('primario')}> */}
          <DSBtn variant="primary" onClick={() => buscar(1)} disabled={!colecao || carregando}>
            {carregando ? 'Buscando…' : 'Buscar'}
          </DSBtn>
        </div>
      </div>

      {/* ✅ DSAlert substitui s.erro e s.ok hardcoded */}
      {erro     && <DSAlert variant="red"   style={{ marginBottom: SPACE.md }}>{erro}</DSAlert>}
      {mensagem && <DSAlert variant="green" style={{ marginBottom: SPACE.md }}>{mensagem}</DSAlert>}

      {!colecao && <p style={{ color: C.muted, fontSize: FONT.sm }}>Selecione uma coleção para ver os documentos.</p>}
      {colecao && !carregando && !docs.length && <p style={{ color: C.muted, fontSize: FONT.sm }}>Nenhum documento encontrado.</p>}

      {docs.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {colunas.map(c => <th key={c} style={s.th}>{c}</th>)}
                  <th style={s.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <tr key={String(doc._id)}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {colunas.map(c => (
                      <td key={c} style={s.td}
                        title={typeof doc[c] === 'object' ? JSON.stringify(doc[c]) : String(doc[c] ?? '')}>
                        {truncar(doc[c])}
                      </td>
                    ))}
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      {/* ✅ DSBtn substitui <button style={s.btn(...)}> */}
                      <DSBtn variant="primary" size="sm" style={{ marginRight: SPACE.xs }}
                        onClick={() => setDocEditar(doc)}>Editar</DSBtn>
                      <DSBtn variant="danger" size="sm"
                        onClick={() => setDocExcluir(doc)}>Excluir</DSBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={s.paginacao}>
            <DSBtn variant="ghost" onClick={() => buscar(page - 1)} disabled={page <= 1}>← Anterior</DSBtn>
            <span style={s.pagInfo}>Página {page} de {pages} · {total} docs</span>
            <DSBtn variant="ghost" onClick={() => buscar(page + 1)} disabled={page >= pages}>Próxima →</DSBtn>
          </div>
        </>
      )}

      {docEditar  && (
        <ModalEdicao doc={docEditar} colecao={colecao}
          aoSalvar={() => { setDocEditar(null); setMensagem('Documento atualizado.'); buscar(page) }}
          aoFechar={() => setDocEditar(null)} />
      )}
      {docExcluir && (
        <ConfirmModal
          aberto={!!docExcluir}
          titulo="Excluir documento?"
          mensagem={`Documento ${docExcluir ? String(docExcluir._id) : ''} de "${colecao}" será removido permanentemente.`}
          labelConfirmar="Excluir"
          onConfirmar={excluir}
          onCancelar={() => setDocExcluir(null)} />
      )}
    </div>
  )
}

// ── Tab Aggregate ──────────────────────────────────────────────

function TabAggregate() {
  const [colecoes,   setColecoes]   = useState([])
  const [colecao,    setColecao]    = useState('')
  const [pipeline,   setPipeline]   = useState('')
  const [resultado,  setResultado]  = useState(null)
  const [executando, setExecutando] = useState(false)
  const [erro,       setErro]       = useState('')

  useEffect(() => {
    mongoService.colecoes().then(d => setColecoes(d.colecoes || [])).catch(() => {})
  }, [])

  const executar = async () => {
    if (!colecao || !pipeline.trim()) return
    setExecutando(true); setErro(''); setResultado(null)
    let parsed
    try   { parsed = JSON.parse(pipeline) }
    catch { setErro('Pipeline JSON inválido.'); setExecutando(false); return }
    try   { setResultado(await mongoService.aggregate(colecao, parsed)) }
    catch (e) { setErro(e.message) }
    finally   { setExecutando(false) }
  }

  return (
    <div>
      {/* ✅ DSAlert substitui s.aviso hardcoded (#f59e0b*) */}
      <DSAlert variant="amber" style={{ marginBottom: SPACE.lg }}>
        ⚠️ <strong>$out</strong> e <strong>$merge</strong> não são permitidos · máx. 5 estágios · timeout 5 s
      </DSAlert>

      <div style={{ ...s.row, marginBottom: SPACE.lg }}>
        <div style={{ minWidth: '200px' }}>
          <label style={s.label}>Coleção</label>
          <select value={colecao} onChange={e => setColecao(e.target.value)}
            style={{ ...s.input, cursor: 'pointer' }}>
            <option value="">— Selecione —</option>
            {colecoes.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: SPACE.lg }}>
        <label style={s.label}>Pipeline (array JSON)</label>
        <textarea value={pipeline} onChange={e => setPipeline(e.target.value)} rows={8}
          placeholder={"[\n  { \"$match\": { \"ativo\": true } },\n  { \"$group\": { \"_id\": \"$status\", \"total\": { \"$sum\": 1 } } }\n]"}
          style={{ ...s.input, fontFamily: 'monospace', fontSize: FONT.sm, resize: 'vertical' }} />
      </div>

      {/* ✅ DSAlert substitui s.erro hardcoded */}
      {erro && <DSAlert variant="red" style={{ marginBottom: SPACE.md }}>{erro}</DSAlert>}

      {/* ✅ DSBtn substitui <button style={s.btn('primario')}> */}
      <DSBtn variant="primary" style={{ marginBottom: SPACE.xl }}
        onClick={executar} disabled={!colecao || !pipeline.trim() || executando}>
        {executando ? 'Executando…' : '▶ Executar Aggregate'}
      </DSBtn>

      {resultado && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: FONT.base }}>Resultado</span>
            {/* ✅ DSBadge substitui s.badge(C.greenSolid) */}
            <DSBadge variant="green">{resultado.total} item(s)</DSBadge>
          </div>
          <pre style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: SPACE.lg, fontSize: FONT.xs, color: C.text, overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
            {JSON.stringify(resultado.resultado, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Página Principal ───────────────────────────────────────────

const TABS = [
  { id: 'colecoes',   label: 'Coleções'        },
  { id: 'documentos', label: 'Documentos'      },
  { id: 'aggregate',  label: 'Aggregate'       },
  { id: 'banco',      label: 'Banco & Índices' },
]

export default function AdminMongo() {
  const [tabAtiva,           setTabAtiva]           = useState('colecoes')
  const [colecaoSelecionada, setColecaoSelecionada] = useState('')
  const [modalConfig,        setModalConfig]        = useState(false)

  const aoSelecionarColecao = (nome) => {
    setColecaoSelecionada(nome)
    setTabAtiva('documentos')
  }

  return (
    <div className="adm-page">
      {/* ✅ DSPageHeader substitui header inline com s.titulo / s.btn('cfg') */}
      <DSPageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}><IcoDb /> MongoDB</span>}
        sub="Coleções, documentos, aggregate e índices"
        actions={
          <DSBtn variant="secondary" onClick={() => setModalConfig(true)} title="Configurar URI de conexão">
            <IcoGear /> Configurar servidor
          </DSBtn>
        }
      />

      {/* ✅ DSTabs/DSTab substitui tabs locais com style condicional */}
      <DSTabs style={{ marginBottom: SPACE.xl }}>
        {TABS.map(t => (
          <DSTab key={t.id} id={t.id} ativo={tabAtiva} onClick={setTabAtiva}>
            {t.label}
          </DSTab>
        ))}
      </DSTabs>

      {tabAtiva === 'colecoes'   && <TabColecoes   aoSelecionarColecao={aoSelecionarColecao} />}
      {tabAtiva === 'documentos' && <TabDocumentos colecaoInicial={colecaoSelecionada} />}
      {tabAtiva === 'aggregate'  && <TabAggregate />}
      {tabAtiva === 'banco'      && (
        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2 }}>
            <Spin size={28} />
          </div>
        }>
          <AbaMongoDB />
        </Suspense>
      )}

      {modalConfig && <ModalConfigServidor aoFechar={() => setModalConfig(false)} />}
    </div>
  )
}
