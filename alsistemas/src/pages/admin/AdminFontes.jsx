import { useState, useEffect } from 'react'
import { fontesService } from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

function FormInline({ inicial, onSalvar, onCancelar, salvando }) {
  const [nome, setNome] = useState(inicial?.nome||'')
  const [url,  setUrl]  = useState(inicial?.url||'')
  function handleSubmit(e) {
    e.preventDefault()
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return }
    onSalvar({ nome: nome.trim(), url: url.trim() })
  }
  return (
    <form onSubmit={handleSubmit} style={{ display:'flex', gap: 10, flexWrap:'wrap', alignItems:'flex-end' }}
      className="adm-form-inline-row">
      <div style={{ flex:1, minWidth: 140 }}>
        <label className="adm-label" htmlFor="fonte-nome">Nome</label>
        <input id="fonte-nome" className="adm-input" placeholder="Ex: G1"
          value={nome} onChange={e => setNome(e.target.value)} maxLength={100}/>
      </div>
      <div style={{ flex:1, minWidth: 180 }}>
        <label className="adm-label" htmlFor="fonte-url">URL (opcional)</label>
        <input id="fonte-url" className="adm-input" type="text" placeholder="https://g1.globo.com"
          value={url} onChange={e => setUrl(e.target.value)}/>
      </div>
      <div style={{ display:'flex', gap: SPACE.md, paddingBottom: 1 }} className="adm-form-inline-actions">
        <button type="submit" disabled={salvando} className="adm-btn adm-btn-primary adm-btn-sm">
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancelar} className="adm-btn adm-btn-ghost adm-btn-sm">Cancelar</button>
      </div>
    </form>
  )
}

export default function AdminFontes() {
  const [fontes,      setFontes]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [adicionando, setAdicionando] = useState(false)
  const [editandoId,  setEditandoId]  = useState(null)
  const [salvando,    setSalvando]    = useState(false)
  const [deletandoId, setDeletandoId] = useState(null)
  const [confirm, setConfirm] = useState({ aberto:false, fonte:null, carregando:false })

  async function carregar() {
    try { setLoading(true); setFontes(await fontesService.listar()) }
    catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  async function handleCriar(d) {
    try { setSalvando(true); await fontesService.criar(d); toast.success('Fonte criada!'); setAdicionando(false); carregar() }
    catch (e) { toast.error(e.message) } finally { setSalvando(false) }
  }
  async function handleEditar(id, d) {
    try { setSalvando(true); await fontesService.editar(id,d); toast.success('Fonte atualizada!'); setEditandoId(null); carregar() }
    catch (e) { toast.error(e.message) } finally { setSalvando(false) }
  }
  async function confirmarExclusao() {
    const fonte = confirm.fonte
    setConfirm(c => ({...c, carregando: true}))
    try {
      setDeletandoId(fonte.id); await fontesService.excluir(fonte.id)
      toast.success('Fonte excluída!'); setConfirm({aberto:false,fonte:null,carregando:false}); carregar()
    } catch (e) { toast.error(e.message); setConfirm(c => ({...c,carregando:false})) }
    finally { setDeletandoId(null) }
  }

  return (
    <>
      <ConfirmModal aberto={confirm.aberto} titulo={`Excluir "${confirm.fonte?.nome}"?`}
        mensagem="Notícias desta fonte ficarão sem fonte. Ação irreversível."
        labelConfirmar="Excluir" carregando={confirm.carregando}
        onConfirmar={confirmarExclusao} onCancelar={() => setConfirm({aberto:false,fonte:null,carregando:false})}/>

      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Fontes</div>
          <div className="adm-page-sub">{fontes.length} fonte{fontes.length!==1?'s':''}</div>
        </div>
        <div className="adm-page-actions">
          {!adicionando && (
            <button onClick={() => { setAdicionando(true); setEditandoId(null) }} className="adm-btn adm-btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
              Nova fonte
            </button>
          )}
        </div>
      </div>

      {adicionando && (
        <div className="adm-card" style={{ marginBottom: SPACE.xl, padding: '16px 20px' }}>
          <div className="adm-section-label" style={{ marginBottom: 14 }}>Nova fonte</div>
          <FormInline onSalvar={handleCriar} onCancelar={() => setAdicionando(false)} salvando={salvando}/>
        </div>
      )}

      <div className="adm-card">
        <div className="adm-table-header">
          <div className="adm-table-title">Todas as fontes</div>
        </div>
        {loading && <div className="adm-empty" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" className="adm-spin" style={{margin:'0 auto',opacity:.5}}><path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/></svg></div>}
        {!loading && fontes.length === 0 && <div className="adm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg><p>Nenhuma fonte cadastrada.</p></div>}
        {!loading && fontes.length > 0 && (
          <div className="adm-table-scroll">
          <table className="adm-table" aria-label="Lista de fontes">
            <thead><tr><th>Nome</th><th>URL</th><th></th></tr></thead>
            <tbody>
              {fontes.map(fonte => (
                <tr key={fonte.id}>
                  <td colSpan={editandoId===fonte.id ? 3 : 1}>
                    {editandoId === fonte.id
                      ? <FormInline inicial={fonte} onSalvar={d => handleEditar(fonte.id,d)} onCancelar={() => setEditandoId(null)} salvando={salvando}/>
                      : <span style={{ fontWeight: 500 }}>{fonte.nome}</span>}
                  </td>
                  {editandoId !== fonte.id && (
                    <>
                      <td>
                        {fonte.url
                          ? <a href={fonte.url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--adm-accent)', fontSize: FONT.base }}>{fonte.url}</a>
                          : <span style={{ color:'var(--adm-muted)', fontSize: FONT.base }}>—</span>}
                      </td>
                      <td>
                        <div className="adm-td-actions">
                          <button onClick={() => { setEditandoId(fonte.id); setAdicionando(false) }}
                            aria-label={`Editar ${fonte.nome}`} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => setConfirm({aberto:true,fonte,carregando:false})}
                            disabled={deletandoId===fonte.id} aria-label={`Excluir ${fonte.nome}`}
                            className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  )
}
