/**
 * AbaMongoDB.jsx — Aba de exploração do banco MongoDB.
 */
import { useState, useEffect, useCallback } from 'react'
import { infraestruturaService } from '../../../services/api'
import toast from 'react-hot-toast'
import {
  C, Ico, Spin, formatBytes,
  PageCard, SectionTitle, Badge, Btn, ModalConfirm,
} from './InfraBase'
import { DSModal, DSBtn } from '../ui/DS'

export default function AbaMongoDB() {
  const [status,     setStatus]     = useState(null)
  const [colecoes,   setColecoes]   = useState([])
  const [colSel,     setColSel]     = useState(null)
  const [docs,       setDocs]       = useState(null)
  const [page,       setPage]       = useState(1)
  const [busca,      setBusca]      = useState('')
  const [carregando, setCarregando] = useState(true)
  const [loadDocs,   setLoadDocs]   = useState(false)
  const [docVis,     setDocVis]     = useState(null)
  const [delConfirm, setDelConfirm] = useState(null)
  const [deletando,  setDeletando]  = useState(false)
  const [stats,      setStats]      = useState(null)
  const [carregandoStats,   setCarregandoStats]   = useState(false)
  const [indices,    setIndices]    = useState([])
  const [carregandoIndices, setCarregandoIndices] = useState(false)
  const [novoIndice, setNovoIndice] = useState({ campo: '', valor: 1, unique: false })
  const [criandoIndice,   setCriandoIndice]   = useState(false)
  const [removendoIndice, setRemovendoIndice] = useState(null)

  useEffect(() => {
    Promise.all([infraestruturaService.mongoStatus(), infraestruturaService.mongoColecoes()])
      .then(([s, c]) => { setStatus(s); setColecoes(c.colecoes || []) })
      .catch(e => toast.error(e.message || 'Erro ao carregar MongoDB'))
      .finally(() => setCarregando(false))
  }, [])

  const carregarDocs = useCallback(async (nome, pg = 1, q = '') => {
    setLoadDocs(true)
    try { setDocs(await infraestruturaService.mongoDocumentos(nome, pg, 20, q)) }
    catch (e) { toast.error(e.message || 'Erro ao carregar documentos') }
    finally { setLoadDocs(false) }
  }, [])

  const carregarStatsEIndices = useCallback(async (nome) => {
    if (!nome) return
    setCarregandoStats(true); setCarregandoIndices(true)
    try {
      const [s, idx] = await Promise.all([
        infraestruturaService.mongoStatsColecao(nome),
        infraestruturaService.mongoIndices(nome),
      ])
      setStats(s); setIndices(idx.indices || [])
    } catch (e) { toast.error(e.message || 'Erro ao carregar metadados') }
    finally { setCarregandoStats(false); setCarregandoIndices(false) }
  }, [])

  function selecionarColecao(nome) {
    setColSel(nome); setPage(1); setBusca(''); setDocs(null); setStats(null); setIndices([])
    carregarDocs(nome, 1, ''); carregarStatsEIndices(nome)
  }

  async function handleDelete() {
    if (!delConfirm) return
    setDeletando(true)
    try {
      await infraestruturaService.mongoExcluirDoc(delConfirm.colecao, delConfirm.id)
      toast.success('Documento excluído')
      setDelConfirm(null); carregarDocs(colSel, page, busca)
    } catch (e) { toast.error(e.message || 'Erro ao excluir') }
    finally { setDeletando(false) }
  }

  async function criarIndice() {
    if (!novoIndice.campo.trim()) { toast.error('Informe o nome do campo'); return }
    setCriandoIndice(true)
    try {
      await infraestruturaService.mongoCriarIndice(colSel, { [novoIndice.campo.trim()]: parseInt(novoIndice.valor) }, novoIndice.unique)
      toast.success('Índice criado')
      setNovoIndice({ campo: '', valor: 1, unique: false }); carregarStatsEIndices(colSel)
    } catch (e) { toast.error(e.message || 'Erro ao criar índice') }
    finally { setCriandoIndice(false) }
  }

  async function removerIndice(nomeIndice) {
    setRemovendoIndice(nomeIndice)
    try {
      await infraestruturaService.mongoRemoverIndice(colSel, nomeIndice)
      toast.success(`Índice ${nomeIndice} removido`); carregarStatsEIndices(colSel)
    } catch (e) { toast.error(e.message || 'Erro ao remover índice') }
    finally { setRemovendoIndice(null) }
  }

  if (carregando) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={24} /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {delConfirm && (
        <ModalConfirm
          titulo="Excluir documento?"
          descricao={`Isso vai remover permanentemente o documento _id: ${delConfirm.id} da coleção "${delConfirm.colecao}".`}
          loading={deletando} onConfirm={handleDelete} onCancel={() => setDelConfirm(null)}
        />
      )}

      {status && (
        <PageCard>
          <SectionTitle icon={Ico.db}>Status da Conexão</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Estado',   valor: status.estado,               cor: status.conectado ? C.green : C.red },
              { label: 'Banco',    valor: status.banco },
              { label: 'Host',     valor: status.host },
              { label: 'Versão',   valor: status.versao },
              { label: 'Coleções', valor: String(status.colecoes) },
              { label: 'Objetos',  valor: String(status.objetos) },
              { label: 'Dados',    valor: status.tamanho_dados },
              { label: 'Storage',  valor: status.tamanho_armazenamento },
            ].map(({ label, valor, cor }) => (
              <div key={label} style={{ background: C.surf2, borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: cor || C.text, margin: 0, wordBreak: 'break-all' }}>{valor || '—'}</p>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, alignItems: 'start' }}>
        {/* Lista de coleções */}
        <PageCard style={{ padding: '14px 10px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 10px 6px' }}>
            Coleções ({colecoes.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {colecoes.map(col => (
              <button key={col.nome} onClick={() => selecionarColecao(col.nome)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: colSel === col.nome ? C.blue + '22' : 'transparent',
                  color: colSel === col.nome ? C.blue : C.text,
                  fontSize: 13, textAlign: 'left', transition: 'background .15s',
                }}>
                <span style={{ fontWeight: colSel === col.nome ? 700 : 400, fontSize: 12, wordBreak: 'break-all' }}>{col.nome}</span>
                <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginLeft: 4 }}>{col.contagem >= 0 ? col.contagem : '?'}</span>
              </button>
            ))}
          </div>
        </PageCard>

        {/* Painel de documentos */}
        <PageCard>
          {!colSel ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>👈</span>
              <p style={{ margin: 0, fontSize: 13 }}>Selecione uma coleção</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>{colSel}</h3>
                  {docs && <Badge color={C.blue}>{docs.total} docs</Badge>}
                </div>
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setPage(1); carregarDocs(colSel, 1, busca) } }}
                  placeholder="Buscar por _id… (Enter)"
                  style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, width: 220 }}
                />
              </div>

              {carregandoStats ? <div style={{ padding: 8, textAlign: 'center' }}><Spin size={16} /></div>
                : stats && (
                  <div style={{ marginBottom: 16, background: C.surf2, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                    <div><span style={{ color: C.muted }}>📦 Tamanho:</span> <b>{formatBytes(stats.tamanho)}</b></div>
                    <div><span style={{ color: C.muted }}>💾 Storage:</span> <b>{formatBytes(stats.armazenamento)}</b></div>
                    <div><span style={{ color: C.muted }}>📏 Obj médio:</span> <b>{formatBytes(stats.avgObjSize)}</b></div>
                    <div><span style={{ color: C.muted }}>🔍 Índices:</span> <b>{stats.indices}</b></div>
                  </div>
                )}

              {/* Gerenciar índices */}
              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.text, padding: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {Ico.index} Gerenciar índices
                </summary>
                <div style={{ marginTop: 12, background: C.surf2, borderRadius: 8, padding: '10px 12px' }}>
                  {carregandoIndices ? <Spin size={16} /> : indices.length === 0 ? (
                    <p style={{ fontSize: 12, color: C.muted }}>Nenhum índice além do _id_</p>
                  ) : (
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <th style={{ textAlign: 'left', padding: '5px 0' }}>Nome</th>
                          <th style={{ textAlign: 'left', padding: '5px 0' }}>Campos</th>
                          <th style={{ textAlign: 'center', padding: '5px 0' }}>Único</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {indices.map(idx => (
                          <tr key={idx.name} style={{ borderBottom: `1px solid ${C.border}50` }}>
                            <td style={{ padding: '6px 0', fontFamily: 'monospace', fontSize: 11 }}>{idx.name}</td>
                            <td style={{ padding: '6px 0', fontFamily: 'monospace', fontSize: 11 }}>{JSON.stringify(idx.key)}</td>
                            <td style={{ padding: '6px 0', textAlign: 'center' }}>{idx.unique ? '✅' : '❌'}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right' }}>
                              {idx.name !== '_id_' && (
                                <button onClick={() => removerIndice(idx.name)} disabled={removendoIndice === idx.name}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 11 }}>
                                  {removendoIndice === idx.name ? <Spin size={12} /> : '🗑️'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                    <p style={{ fontSize: 12, marginBottom: 6 }}>Criar novo índice</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="campo" value={novoIndice.campo}
                        onChange={e => setNovoIndice(i => ({ ...i, campo: e.target.value }))}
                        style={{ background: C.bg, border: `1px solid ${C.border}`, padding: '5px 8px', borderRadius: 6, fontSize: 12, color: C.text, width: 120 }}
                      />
                      <select value={novoIndice.valor} onChange={e => setNovoIndice(i => ({ ...i, valor: e.target.value }))}
                        style={{ background: C.bg, border: `1px solid ${C.border}`, padding: '5px 8px', borderRadius: 6, fontSize: 12, color: C.text }}>
                        <option value="1">Asc (1)</option>
                        <option value="-1">Desc (-1)</option>
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <input type="checkbox" checked={novoIndice.unique} onChange={e => setNovoIndice(i => ({ ...i, unique: e.target.checked }))} />
                        Único
                      </label>
                      <Btn onClick={criarIndice} loading={criandoIndice} small variant="primary">Criar índice</Btn>
                    </div>
                  </div>
                </div>
              </details>

              {/* Tabela de documentos */}
              {loadDocs ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spin size={20} /></div>
              ) : docs ? (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <th style={{ padding: '7px 10px', textAlign: 'left', color: C.muted, fontWeight: 600 }}>_id</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left', color: C.muted, fontWeight: 600 }}>Campos</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', color: C.muted, fontWeight: 600 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.documentos.map(doc => {
                          const id = doc._id?.toString() || '—'
                          const campos = Object.keys(doc).filter(k => k !== '_id').slice(0, 3)
                          return (
                            <tr key={id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                              <td style={{ padding: '8px 10px', color: C.subtle, fontFamily: 'monospace', fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</td>
                              <td style={{ padding: '8px 10px', color: C.muted }}>
                                {campos.map(k => {
                                  let v = doc[k]
                                  if (v && typeof v === 'object') v = '{...}'
                                  else if (typeof v === 'string' && v.length > 30) v = v.slice(0, 30) + '…'
                                  return (
                                    <span key={k} style={{ marginRight: 12 }}>
                                      <span style={{ color: C.blue }}>{k}:</span>{' '}
                                      <span style={{ color: C.text }}>{String(v)}</span>
                                    </span>
                                  )
                                })}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  <Btn small variant="ghost" onClick={() => setDocVis(doc)}>{Ico.eye}</Btn>
                                  <Btn small variant="danger" onClick={() => setDelConfirm({ id, colecao: colSel })}>{Ico.trash}</Btn>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {docs.paginas > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      <Btn small variant="ghost" disabled={page <= 1} onClick={() => { const np = page - 1; setPage(np); carregarDocs(colSel, np, busca) }}>
                        {Ico.chevL} Anterior
                      </Btn>
                      <span style={{ fontSize: 12, color: C.muted }}>{page} / {docs.paginas}</span>
                      <Btn small variant="ghost" disabled={page >= docs.paginas} onClick={() => { const np = page + 1; setPage(np); carregarDocs(colSel, np, busca) }}>
                        Próxima {Ico.chevR}
                      </Btn>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}
        </PageCard>
      </div>

      {/* ✅ DSModal substitui overlay position:fixed inline */}
      <DSModal
        open={!!docVis}
        onClose={() => setDocVis(null)}
        title={`Documento — ${colSel}`}
        size="lg"
        footer={
          <DSBtn variant="ghost" onClick={() => { navigator.clipboard.writeText(JSON.stringify(docVis, null, 2)); toast.success('JSON copiado!') }}>
            {Ico.copy} Copiar JSON
          </DSBtn>
        }
      >
        <pre style={{ overflowY: 'auto', margin: 0, padding: '12px 14px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.subtle, lineHeight: 1.6, maxHeight: '60vh' }}>
          {docVis ? JSON.stringify(docVis, null, 2) : ''}
        </pre>
      </DSModal>
    </div>
  )
}
