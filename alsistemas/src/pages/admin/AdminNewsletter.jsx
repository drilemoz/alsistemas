import { useState, useEffect, useCallback } from 'react'
import { newsletterService } from '../../services/api'
import { formatarData } from '../../utils/formatters'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

export default function AdminNewsletter() {
  const [assinantes,   setAssinantes]   = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [filtroAtivo,  setFiltroAtivo]  = useState('todos')
  const [busca,        setBusca]        = useState('')
  const [confirm, setConfirm] = useState({ aberto:false, assinante:null, carregando:false })

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      const params = {}
      if (filtroAtivo === 'ativos')   params.ativo = true
      if (filtroAtivo === 'inativos') params.ativo = false
      const data = await newsletterService.listarAssinantes(params)
      setAssinantes(data.assinantes); setTotal(data.total)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [filtroAtivo])

  useEffect(() => { carregar() }, [carregar])

  async function confirmarRemocao() {
    const a = confirm.assinante
    setConfirm(c => ({...c, carregando:true}))
    try {
      await newsletterService.removerAssinante(a.id)
      toast.success('Removido.'); setConfirm({aberto:false,assinante:null,carregando:false}); carregar()
    } catch (e) { toast.error(e.message); setConfirm(c => ({...c,carregando:false})) }
  }

  async function toggleStatus(a) {
    try { await newsletterService.alterarStatus(a.id, !a.ativo); toast.success(a.ativo?'Desativado.':'Reativado.'); carregar() }
    catch (e) { toast.error(e.message) }
  }

  function exportarCSV() {
    const ativos = assinantes.filter(a => a.ativo)
    const linhas = ['Nome,Email,Data'].concat(ativos.map(a => `"${a.nome||''}","${a.email}","${formatarData(a.inscrito_em)}"`))
    const blob = new Blob([linhas.join('\n')], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const l = document.createElement('a'); l.href=url; l.download=`newsletter-${new Date().toISOString().slice(0,10)}.csv`; l.click()
    setTimeout(() => URL.revokeObjectURL(url), 100); toast.success(`${ativos.length} assinantes exportados.`)
  }

  const ativos   = assinantes.filter(a => a.ativo).length
  const inativos = assinantes.filter(a => !a.ativo).length
  const filtrados = busca.trim() ? assinantes.filter(a => a.email.includes(busca) || (a.nome||'').toLowerCase().includes(busca.toLowerCase())) : assinantes

  return (
    <>
      <ConfirmModal aberto={confirm.aberto} titulo={`Remover "${confirm.assinante?.email}"?`}
        mensagem="O assinante será removido permanentemente. Ação irreversível."
        labelConfirmar="Remover" carregando={confirm.carregando}
        onConfirmar={confirmarRemocao} onCancelar={() => setConfirm({aberto:false,assinante:null,carregando:false})}/>

      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Newsletter</div>
          <div className="adm-page-sub">{total} assinante{total!==1?'s':''} no total</div>
        </div>
        <div className="adm-page-actions">
          <button onClick={exportarCSV} disabled={ativos===0} className="adm-btn adm-btn-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap: SPACE.lg, marginBottom: SPACE.xl2, maxWidth: 480 }}>
        {[{label:'Total',valor:total,color:'var(--adm-text)'},{label:'Ativos',valor:ativos,color:'var(--adm-accent)'},{label:'Inativos',valor:inativos,color:'var(--adm-muted)'}].map(({label,valor,color}) => (
          <div key={label} className="adm-stat-card" style={{ textAlign:'center', padding: '14px 16px' }}>
            <div className="adm-stat-label">{label}</div>
            <div className="adm-stat-value" style={{ color, fontSize: 22 }}>{valor}</div>
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-table-header">
          <div className="adm-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" placeholder="Filtrar por email..." value={busca} onChange={e => setBusca(e.target.value)} aria-label="Filtrar"/>
          </div>
          <div style={{ display:'flex', gap: 2, background:'var(--adm-surface2)', border:'1px solid var(--adm-border)', borderRadius: RADIUS.sm, padding: 3 }}>
            {['todos','ativos','inativos'].map(v => (
              <button key={v} onClick={() => setFiltroAtivo(v)} aria-pressed={filtroAtivo===v}
                className={`adm-btn adm-btn-sm${filtroAtivo===v ? ' adm-btn-primary' : ' adm-btn-ghost'}`}
                style={{ textTransform:'capitalize' }}>{v}</button>
            ))}
          </div>
        </div>

        {loading && <div className="adm-empty" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24" className="adm-spin" style={{margin:'0 auto',opacity:.5}}><path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/></svg></div>}
        {!loading && filtrados.length === 0 && <div className="adm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><p>Nenhum assinante.</p></div>}
        {!loading && filtrados.length > 0 && (
          <table className="adm-table" aria-label="Lista de assinantes">
            <thead><tr><th>Assinante</th><th>Email</th><th>Status</th><th>Inscrito em</th><th></th></tr></thead>
            <tbody>
              {filtrados.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.nome || '—'}</td>
                  <td style={{ fontFamily:'var(--adm-mono)', fontSize: FONT.base, color:'var(--adm-muted)' }}>{a.email}</td>
                  <td><span className={`adm-badge ${a.ativo ? 'adm-badge-green' : 'adm-badge-gray'}`}>{a.ativo?'Ativo':'Inativo'}</span></td>
                  <td style={{ color:'var(--adm-muted)', fontSize: FONT.base, whiteSpace:'nowrap' }}>{formatarData(a.inscrito_em)}</td>
                  <td>
                    <div className="adm-td-actions">
                      <button onClick={() => toggleStatus(a)} aria-label={a.ativo?`Desativar ${a.email}`:`Reativar ${a.email}`}
                        className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">
                        {a.ativo
                          ? <svg viewBox="0 0 24 24" fill="none" stroke="var(--adm-accent)" strokeWidth="2" width="14" height="14"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/></svg>}
                      </button>
                      <button onClick={() => setConfirm({aberto:true,assinante:a,carregando:false})}
                        aria-label={`Remover ${a.email}`} className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
