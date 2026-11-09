/**
 * AdminNoticias.jsx — v2
 *
 * Melhorias:
 *  - Barra de abas usando adm-tabs/adm-tab-btn (idêntico ao AdminModulos)
 *  - Wrapper scrollável sem overflow lateral visível
 *  - Padding da listagem reduzido
 *  - Botão Publicar/Despublicar inline por notícia
 *  - Cabeçalho com adm-page-header/adm-page-title/adm-page-sub
 *  - Ícones individuais por aba
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { categoriasService, fontesService, noticiasService } from '../../services/api'
import { useNoticias, useCategorias } from '../../hooks/useNoticias'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { formatarData } from '../../utils/formatters'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSBadge, DSModal, DSBtn } from '../../components/admin/ui/DS'
import AdminIcon from '../../components/admin/ui/AdminIcon'

// Alias para compatibilidade com JSX já escrito abaixo
const Ico = {
  newspaper: <AdminIcon name="newspaper" size={16} />,
  tag:       <AdminIcon name="tag"       size={16} />,
  globe:     <AdminIcon name="globe"     size={16} />,
  edit:      <AdminIcon name="edit"      size={14} />,
  trash:     <AdminIcon name="trash"     size={14} />,
  plus:      <AdminIcon name="plus"      size={13} />,
  eye:       <AdminIcon name="eye"       size={14} />,
  eyeOff:    <AdminIcon name="eyeOff"    size={14} />,
  extLink:   <AdminIcon name="extLink"   size={12} />,
  close:     <AdminIcon name="close"     size={16} />,
  spin:      <AdminIcon name="spin"      size={24} />,
  spinSm:    <AdminIcon name="spinSm"    size={14} />,
  tagEmpty:  <AdminIcon name="tagEmpty"  size={32} />,
  globeEmpty:<AdminIcon name="globeEmpty" size={32} />,
}

function gid(obj) {
  if (!obj) return undefined
  return obj.id || (obj._id ? String(obj._id) : undefined)
}
function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}

// ─── StatusBadge ──────────────────────────────────────────────
const STATUS_CFG = {
  rascunho:  { label:'Rascunho',  bg:'rgba(100,116,139,.15)', color:C.subtle,  border:'rgba(100,116,139,.3)' },
  revisao:   { label:'Revisão',   bg:C.amberBg,               color:C.amber,   border:C.amberBorder },
  publicado: { label:'Publicado', bg:C.greenBg,               color:C.greenSolid, border:C.greenBorder },
  arquivado: { label:'Arquivado', bg:C.redBg,                 color:C.red,     border:C.redBorder },
}
function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.rascunho
  return (
    <DSBadge style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {s.label}
    </DSBadge>
  )
}

// ─── CategoriaBadge ───────────────────────────────────────────
const CAT_PALETTE = [
  {bg:'#6b7c4e22',color:'#4a5c34',border:'#6b7c4e55'},{bg:'#6366f122',color:'#4338ca',border:'#6366f155'},
  {bg:'#f59e0b22',color:'#92400e',border:'#f59e0b55'},{bg:'#ef444422',color:'#991b1b',border:'#ef444455'},
  {bg:'#0ea5e922',color:'#0369a1',border:'#0ea5e955'},{bg:'#ec489922',color:'#9d174d',border:'#ec489955'},
  {bg:'#14b8a622',color:'#0f766e',border:'#14b8a655'},{bg:'#8b5cf622',color:'#6d28d9',border:'#8b5cf655'},
]
function hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=(Math.imul(31,h)+s.charCodeAt(i))|0;return Math.abs(h)}
function CategoriaBadge({ nome }) {
  if (!nome) return <span style={{color:'var(--adm-muted)',fontSize:12}}>—</span>
  const p = CAT_PALETTE[hashStr(nome) % CAT_PALETTE.length]
  return (
    <span style={{display:'inline-flex',alignItems:'center',padding:'3px 9px',borderRadius:6,
      fontSize:12,fontWeight:600,whiteSpace:'nowrap',background:p.bg,color:p.color,border:`1px solid ${p.border}`}}>
      {nome}
    </span>
  )
}

// ─── Toggle config ────────────────────────────────────────────
function getToggleConfig(status) {
  if (status === 'publicado') return { label:'Despublicar', icon:Ico.eyeOff, novoStatus:'rascunho',  color:C.amber, bg:C.amberBg, border:C.amberBorder }
  if (status === 'arquivado') return { label:'Republicar',  icon:Ico.eye,    novoStatus:'publicado', color:C.blue, bg:C.blueBg, border:C.blueBorder }
  return                             { label:'Publicar',    icon:Ico.eye,    novoStatus:'publicado', color:C.greenSolid, bg:C.greenBg, border:C.greenBorder }
}

// ═══════════════════════════════════════════════════════════════
//  ABA CATEGORIAS
// ═══════════════════════════════════════════════════════════════
function CategoriaModal({ categoria, onSalvar, onFechar, salvando }) {
  const isNovo = !gid(categoria)
  const [nome,      setNome]      = useState(categoria?.nome      || '')
  const [slug,      setSlug]      = useState(categoria?.slug      || '')
  const [descricao, setDescricao] = useState(categoria?.descricao || '')
  const [autoSlug,  setAutoSlug]  = useState(isNovo)
  const cc = descricao.length
  const charOver = cc > 160, charWarn = cc > 0 && cc < 120

  function handleNome(v) { setNome(v); if (autoSlug) setSlug(slugify(v)) }
  function handleSubmit(e) {
    e.preventDefault()
    if (!nome.trim() || !slug.trim()) { toast.error('Nome e slug são obrigatórios'); return }
    onSalvar({ nome: nome.trim(), slug: slug.trim(), descricao: descricao.trim() })
  }

  return (
    <DSModal open onClose={()=>!salvando&&onFechar()} title={isNovo?'✦ Nova categoria':'Editar categoria'} size="sm"
      footer={
        <>
          <DSBtn type="submit" variant="primary" loading={salvando} onClick={handleSubmit}>
            {isNovo?'Criar categoria':'Salvar alterações'}
          </DSBtn>
          <DSBtn onClick={()=>!salvando&&onFechar()} disabled={salvando}>Cancelar</DSBtn>
        </>
      }
    >
          <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:SPACE.lg}}>
            <div>
              <label className="adm-label" htmlFor="nc-nome">Nome <span style={{color:'var(--adm-accent)'}}>*</span></label>
              <input id="nc-nome" className="adm-input" placeholder="Ex: Política" value={nome} onChange={e=>handleNome(e.target.value)} maxLength={100} autoFocus/>
            </div>
            <div>
              <label className="adm-label" htmlFor="nc-slug">Slug <span style={{color:'var(--adm-accent)'}}>*</span></label>
              <input id="nc-slug" className="adm-input adm-input-mono" placeholder="politica"
                value={slug} onChange={e=>{setAutoSlug(false);setSlug(e.target.value)}} maxLength={100}/>
              <span style={{fontSize:11,color:'var(--adm-muted)',marginTop:4,display:'block'}}>
                Endereço: <code style={{fontFamily:'var(--adm-mono)'}}>/categoria/{slug||'…'}</code>
              </span>
            </div>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <label className="adm-label" htmlFor="nc-desc" style={{marginBottom:0}}>
                  Descrição <span style={{fontWeight:400,color:'var(--adm-muted)',fontSize:11}}>(SEO)</span>
                </label>
                {cc>0&&<span style={{fontSize:11,fontWeight:600,color:charOver?C.red:charWarn?C.amber:'var(--adm-accent)'}}>{cc}/160</span>}
              </div>
              <textarea id="nc-desc" className="adm-input" rows={3}
                placeholder="Breve descrição da categoria — aparece em buscadores."
                value={descricao} onChange={e=>setDescricao(e.target.value)} maxLength={200}
                style={{resize:'vertical',minHeight:72}}/>
              <span style={{fontSize:11,color:'var(--adm-muted)',marginTop:4,display:'block',lineHeight:1.5}}>
                {charOver?'⚠️ Acima de 160 caracteres':charWarn?'↑ Ideal: 120–160 caracteres':cc===0?'Meta description da página':'✓ Comprimento ideal'}
              </span>
            </div>
          </form>
    </DSModal>
  )
}

function AbaCategorias() {
  const [categorias,  setCategorias]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [salvando,    setSalvando]    = useState(false)
  const [deletandoId, setDeletandoId] = useState(null)
  const [modal,       setModal]       = useState(null)
  const [confirm,     setConfirm]     = useState({aberto:false,cat:null,carregando:false})

  async function carregar() {
    try{setLoading(true);setCategorias(await categoriasService.listar())}
    catch(err){toast.error(err.message)}finally{setLoading(false)}
  }
  useEffect(()=>{carregar()},[])

  async function handleSalvar(dados) {
    try{
      setSalvando(true)
      if(gid(modal?.categoria)){await categoriasService.editar(gid(modal.categoria),dados);toast.success('Categoria atualizada!')}
      else{await categoriasService.criar(dados);toast.success('Categoria criada!')}
      setModal(null);carregar()
    }catch(err){toast.error(err.message)}finally{setSalvando(false)}
  }

  async function confirmarExclusao() {
    const cat=confirm.cat;setConfirm(c=>({...c,carregando:true}))
    try{
      setDeletandoId(gid(cat));await categoriasService.excluir(gid(cat))
      toast.success('Categoria excluída!');setConfirm({aberto:false,cat:null,carregando:false});carregar()
    }catch(err){toast.error(err.message);setConfirm(c=>({...c,carregando:false}))}
    finally{setDeletandoId(null)}
  }

  return (
    <>
      {modal!==null&&<CategoriaModal categoria={modal.categoria} onSalvar={handleSalvar} onFechar={()=>!salvando&&setModal(null)} salvando={salvando}/>}
      <ConfirmModal aberto={confirm.aberto} titulo={`Excluir "${confirm.cat?.nome}"?`}
        mensagem="As notícias desta categoria ficarão sem categoria. Ação irreversível."
        labelConfirmar="Excluir" carregando={confirm.carregando}
        onConfirmar={confirmarExclusao} onCancelar={()=>setConfirm({aberto:false,cat:null,carregando:false})}/>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.text}}>Categorias</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{categorias.length} cadastrada{categorias.length!==1?'s':''}</div>
        </div>
        <button onClick={()=>setModal({categoria:null})} className="adm-btn adm-btn-primary">{Ico.plus} Nova categoria</button>
      </div>

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
        {loading&&<div className="adm-empty" role="status">{Ico.spin}</div>}
        {!loading&&categorias.length===0&&(
          <div className="adm-empty">
            {Ico.tagEmpty}
            <p>Nenhuma categoria cadastrada.<br/>
              <button onClick={()=>setModal({categoria:null})}
                style={{background:'none',border:'none',cursor:'pointer',color:'var(--adm-accent)',fontWeight:600,fontSize:13,padding:0,marginTop:4}}>
                Criar primeira categoria →
              </button>
            </p>
          </div>
        )}
        {!loading&&categorias.length>0&&(
          <>
            <div className="not-table-wrap adm-table-scroll">
              <table className="adm-table" aria-label="Lista de categorias">
                <thead><tr><th>Nome</th><th>Slug</th><th>Descrição SEO</th><th style={{width:1}}></th></tr></thead>
                <tbody>
                  {categorias.map(cat=>(
                    <tr key={gid(cat)}>
                      <td style={{fontWeight:500}}>{cat.nome}</td>
                      <td><code style={{fontFamily:'var(--adm-mono)',fontSize:11,color:C.muted}}>/{cat.slug}</code></td>
                      <td style={{maxWidth:260,color:C.muted,fontSize:12}}>
                        {cat.descricao
                          ?<span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat.descricao}</span>
                          :<span style={{opacity:.4,fontStyle:'italic'}}>Sem descrição</span>}
                      </td>
                      <td>
                        <div className="adm-td-actions not-row-actions">
                          <button onClick={()=>setModal({categoria:cat})} aria-label={`Editar ${cat.nome}`}
                            className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.edit}</button>
                          <button onClick={()=>setConfirm({aberto:true,cat,carregando:false})}
                            disabled={deletandoId===gid(cat)} aria-label={`Excluir ${cat.nome}`}
                            className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">{Ico.trash}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="not-cards">
              {categorias.map(cat=>(
                <div key={gid(cat)} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:3}}>{cat.nome}</div>
                      <code style={{fontSize:11,color:C.muted,fontFamily:'var(--adm-mono)'}}>/{cat.slug}</code>
                      {cat.descricao&&<div style={{fontSize:12,color:C.muted,marginTop:6,lineHeight:1.5}}>{cat.descricao}</div>}
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0,paddingTop:2}}>
                      <button onClick={()=>setModal({categoria:cat})} aria-label={`Editar ${cat.nome}`}
                        className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.edit}</button>
                      <button onClick={()=>setConfirm({aberto:true,cat,carregando:false})} disabled={deletandoId===gid(cat)}
                        aria-label={`Excluir ${cat.nome}`}
                        className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">{Ico.trash}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ABA FONTES
// ═══════════════════════════════════════════════════════════════
function FonteFormInline({ inicial, onSalvar, onCancelar, salvando }) {
  const [nome,setNome]=useState(inicial?.nome||'')
  const [url, setUrl] =useState(inicial?.url ||'')
  function handleSubmit(e){
    e.preventDefault()
    if(!nome.trim()){toast.error('Nome é obrigatório');return}
    onSalvar({nome:nome.trim(),url:url.trim()})
  }
  return (
    <form onSubmit={handleSubmit} style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
      <div style={{flex:'1 1 140px',minWidth:0}}>
        <label className="adm-label" htmlFor="fn-nome">Nome</label>
        <input id="fn-nome" className="adm-input" placeholder="Ex: G1" value={nome} onChange={e=>setNome(e.target.value)} maxLength={100} autoFocus/>
      </div>
      <div style={{flex:'2 1 200px',minWidth:0}}>
        <label className="adm-label" htmlFor="fn-url">URL (opcional)</label>
        <input id="fn-url" className="adm-input" type="text" placeholder="https://g1.globo.com" value={url} onChange={e=>setUrl(e.target.value)}/>
      </div>
      <div style={{display:'flex',gap:8,paddingBottom:1,flexShrink:0}}>
        <button type="submit" disabled={salvando} className="adm-btn adm-btn-primary adm-btn-sm">{salvando?'Salvando…':'Salvar'}</button>
        <button type="button" onClick={onCancelar} className="adm-btn adm-btn-ghost adm-btn-sm">Cancelar</button>
      </div>
    </form>
  )
}

function AbaFontes() {
  const [fontes,      setFontes]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [adicionando, setAdicionando] = useState(false)
  const [editandoId,  setEditandoId]  = useState(null)
  const [salvando,    setSalvando]    = useState(false)
  const [deletandoId, setDeletandoId] = useState(null)
  const [confirm,     setConfirm]     = useState({aberto:false,fonte:null,carregando:false})

  async function carregar(){try{setLoading(true);setFontes(await fontesService.listar())}catch(err){toast.error(err.message)}finally{setLoading(false)}}
  useEffect(()=>{carregar()},[])

  async function handleCriar(d){try{setSalvando(true);await fontesService.criar(d);toast.success('Fonte criada!');setAdicionando(false);carregar()}catch(e){toast.error(e.message)}finally{setSalvando(false)}}
  async function handleEditar(id,d){try{setSalvando(true);await fontesService.editar(id,d);toast.success('Fonte atualizada!');setEditandoId(null);carregar()}catch(e){toast.error(e.message)}finally{setSalvando(false)}}

  async function confirmarExclusao(){
    const fonte=confirm.fonte;setConfirm(c=>({...c,carregando:true}))
    try{setDeletandoId(gid(fonte));await fontesService.excluir(gid(fonte));toast.success('Fonte excluída!');setConfirm({aberto:false,fonte:null,carregando:false});carregar()}
    catch(e){toast.error(e.message);setConfirm(c=>({...c,carregando:false}))}finally{setDeletandoId(null)}
  }

  return (
    <>
      <ConfirmModal aberto={confirm.aberto} titulo={`Excluir "${confirm.fonte?.nome}"?`}
        mensagem="Notícias desta fonte ficarão sem fonte. Ação irreversível."
        labelConfirmar="Excluir" carregando={confirm.carregando}
        onConfirmar={confirmarExclusao} onCancelar={()=>setConfirm({aberto:false,fonte:null,carregando:false})}/>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:C.text}}>Fontes</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{fontes.length} cadastrada{fontes.length!==1?'s':''}</div>
        </div>
        {!adicionando&&(
          <button onClick={()=>{setAdicionando(true);setEditandoId(null)}} className="adm-btn adm-btn-primary">{Ico.plus} Nova fonte</button>
        )}
      </div>

      {adicionando&&(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 18px',marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.subtle,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>Nova fonte</div>
          <FonteFormInline onSalvar={handleCriar} onCancelar={()=>setAdicionando(false)} salvando={salvando}/>
        </div>
      )}

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
        {loading&&<div className="adm-empty" role="status">{Ico.spin}</div>}
        {!loading&&fontes.length===0&&(
          <div className="adm-empty">
            {Ico.globeEmpty}
            <p>Nenhuma fonte cadastrada.<br/>
              <button onClick={()=>setAdicionando(true)}
                style={{background:'none',border:'none',cursor:'pointer',color:'var(--adm-accent)',fontWeight:600,fontSize:13,padding:0,marginTop:4}}>
                Adicionar primeira fonte →
              </button>
            </p>
          </div>
        )}
        {!loading&&fontes.length>0&&(
          <>
            <div className="not-table-wrap adm-table-scroll">
              <table className="adm-table" aria-label="Lista de fontes">
                <thead><tr><th>Nome</th><th>URL</th><th style={{width:1}}></th></tr></thead>
                <tbody>
                  {fontes.map(fonte=>(
                    <tr key={gid(fonte)}>
                      {editandoId===gid(fonte)?(
                        <td colSpan={3} style={{padding:'10px 14px'}}>
                          <FonteFormInline inicial={fonte} onSalvar={d=>handleEditar(gid(fonte),d)} onCancelar={()=>setEditandoId(null)} salvando={salvando}/>
                        </td>
                      ):(
                        <>
                          <td style={{fontWeight:500}}>{fonte.nome}</td>
                          <td>
                            {fonte.url
                              ?<a href={fonte.url} target="_blank" rel="noopener noreferrer"
                                  style={{color:'var(--adm-accent)',fontSize:12,display:'inline-flex',alignItems:'center',gap:4}}>
                                  {fonte.url} {Ico.extLink}
                                </a>
                              :<span style={{color:C.muted,fontSize:12}}>—</span>}
                          </td>
                          <td>
                            <div className="adm-td-actions not-row-actions">
                              <button onClick={()=>{setEditandoId(gid(fonte));setAdicionando(false)}}
                                aria-label={`Editar ${fonte.nome}`} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.edit}</button>
                              <button onClick={()=>setConfirm({aberto:true,fonte,carregando:false})} disabled={deletandoId===gid(fonte)}
                                aria-label={`Excluir ${fonte.nome}`} className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">{Ico.trash}</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="not-cards">
              {fontes.map(fonte=>(
                editandoId===gid(fonte)?(
                  <div key={gid(fonte)} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.subtle,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Editando</div>
                    <FonteFormInline inicial={fonte} onSalvar={d=>handleEditar(gid(fonte),d)} onCancelar={()=>setEditandoId(null)} salvando={salvando}/>
                  </div>
                ):(
                  <div key={gid(fonte)+'c'} style={{background:C.surf2,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:4}}>{fonte.nome}</div>
                        {fonte.url
                          ?<a href={fonte.url} target="_blank" rel="noopener noreferrer"
                              style={{color:'var(--adm-accent)',fontSize:12,display:'inline-flex',alignItems:'center',gap:4,wordBreak:'break-all'}}>
                              {fonte.url} {Ico.extLink}
                            </a>
                          :<span style={{fontSize:12,color:C.muted,fontStyle:'italic'}}>Sem URL</span>}
                      </div>
                      <div style={{display:'flex',gap:6,flexShrink:0,paddingTop:2}}>
                        <button onClick={()=>{setEditandoId(gid(fonte));setAdicionando(false)}}
                          aria-label={`Editar ${fonte.nome}`} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.edit}</button>
                        <button onClick={()=>setConfirm({aberto:true,fonte,carregando:false})} disabled={deletandoId===gid(fonte)}
                          aria-label={`Excluir ${fonte.nome}`} className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">{Ico.trash}</button>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ABA NOTÍCIAS
// ═══════════════════════════════════════════════════════════════
const FILTROS_STATUS = [
  {value:'todos',    label:'Todos'},
  {value:'publicado',label:'Publicados'},
  {value:'rascunho', label:'Rascunhos'},
  {value:'revisao',  label:'Em Revisão'},
  {value:'arquivado',label:'Arquivados'},
]

function AbaNoticia() {
  const [filtroCat,    setFiltroCat]    = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca,        setBusca]        = useState('')
  const [page,         setPage]         = useState(1)
  const [deletandoId,  setDeletandoId]  = useState(null)
  const [publicandoId, setPublicandoId] = useState(null)
  const [confirm,      setConfirm]      = useState({aberto:false,noticia:null,carregando:false})
  const [contagem,     setContagem]     = useState({rascunho:0,revisao:0,publicado:0,arquivado:0})

  const {noticias,total,paginas,loading,error,recarregar} = useNoticias({
    categoriaSlug: filtroCat||undefined,
    q:             busca.trim()||undefined,
    page, limit:   10, status: filtroStatus,
  })
  const {categorias} = useCategorias()

  useEffect(()=>{ noticiasService.contagemStatus().then(setContagem).catch(()=>{}) },[])

  function aplicarStatus(s){setFiltroStatus(s);setPage(1)}

  async function togglePublicacao(n) {
    const nid = n._id?.toString()||n.id
    const cfg = getToggleConfig(n.status||'publicado')
    try{
      setPublicandoId(nid)
      await noticiasService.atualizarStatus(nid, cfg.novoStatus)
      const msg =
        cfg.novoStatus === 'publicado' && n.status === 'arquivado' ? '✓ Republicado!' :
        cfg.novoStatus === 'publicado' ? '✓ Publicado!' :
        '✓ Despublicado'
      toast.success(msg)
      recarregar()
      noticiasService.contagemStatus().then(setContagem).catch(()=>{})
    }catch(err){toast.error(err.message)}
    finally{setPublicandoId(null)}
  }

  async function confirmarExclusao(){
    const n=confirm.noticia; const nid=n._id?.toString()||n.id
    setConfirm(c=>({...c,carregando:true}))
    try{
      setDeletandoId(nid);await noticiasService.excluir(nid)
      toast.success('Notícia excluída!');setConfirm({aberto:false,noticia:null,carregando:false})
      recarregar();noticiasService.contagemStatus().then(setContagem).catch(()=>{})
    }catch(err){toast.error(err.message);setConfirm(c=>({...c,carregando:false}))}
    finally{setDeletandoId(null)}
  }

  return (
    <>
      <ConfirmModal aberto={confirm.aberto} titulo={`Excluir "${confirm.noticia?.titulo}"?`}
        mensagem="Essa ação é permanente e não pode ser desfeita." labelConfirmar="Excluir"
        carregando={confirm.carregando} onConfirmar={confirmarExclusao}
        onCancelar={()=>setConfirm({aberto:false,noticia:null,carregando:false})}/>

      {/* Topo */}
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'var(--adm-text)'}}>Notícias</div>
            <div style={{fontSize:12,color:'var(--adm-muted)'}}>{total} encontradas</div>
          </div>
          <Link to="/admin/nova-noticia" className="adm-btn adm-btn-primary adm-btn-sm">{Ico.plus} Nova notícia</Link>
        </div>

        {/* Chips de status */}
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
          {FILTROS_STATUS.map(f=>(
            <button key={f.value} onClick={()=>aplicarStatus(f.value)}
              style={{
                padding:`${SPACE.xs}px ${SPACE.lg}px`,borderRadius:RADIUS.pill,fontSize:FONT.base,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',
                border:`1px solid ${filtroStatus===f.value?'var(--adm-accent)':'var(--adm-border)'}`,
                background:filtroStatus===f.value?'var(--adm-accent)':'transparent',
                color:filtroStatus===f.value?'#fff':'var(--adm-muted)',transition:'all .15s',
              }}>
              {f.label}
              {f.value!=='todos'&&contagem[f.value]>0&&(
                <span style={{marginLeft:5,background:'rgba(255,255,255,.22)',borderRadius:20,padding:'0 5px',fontSize:11}}>
                  {contagem[f.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Busca + categoria */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <div className="adm-search" style={{flex:1,minWidth:180}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" placeholder="Filtrar por título…" value={busca}
              onChange={e=>{setBusca(e.target.value);setPage(1)}}/>
          </div>
          {categorias.length>0&&(
            <select className="adm-filter-select" value={filtroCat} onChange={e=>{setFiltroCat(e.target.value);setPage(1)}}>
              <option value="">Todas as categorias</option>
              {categorias.map(c=><option key={c.id} value={c.slug}>{c.nome}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Estados */}
      {loading&&(
        <div className="adm-empty" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="adm-spin"
            style={{margin:'0 auto 8px',opacity:.35,width:28,height:28}}>
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
          </svg>
        </div>
      )}
      {error&&(
        <div className="adm-empty">
          <p style={{color:'var(--adm-red)'}}>{error}</p>
          <button className="adm-btn adm-btn-secondary adm-btn-sm" onClick={recarregar} style={{marginTop:12}}>Tentar novamente</button>
        </div>
      )}
      {!loading&&!error&&noticias.length===0&&(
        <div className="adm-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36,opacity:.25,margin:'0 auto 10px'}}>
            <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v10a2 2 0 01-2 2z"/>
          </svg>
          <p>{busca||filtroCat?'Nenhuma notícia encontrada.':'Nenhuma notícia ainda.'}</p>
          {!busca&&!filtroCat&&(
            <Link to="/admin/nova-noticia" className="adm-btn adm-btn-primary adm-btn-sm" style={{marginTop:12}}>Criar primeira notícia</Link>
          )}
        </div>
      )}

      {/* Tabela — desktop */}
      {!loading&&!error&&noticias.length>0&&(
        <>
          <div className="not-table-wrap adm-table-scroll">
            <table className="adm-table" aria-label="Lista de notícias">
              <thead>
                <tr>
                  <th>Notícia</th><th>Categoria</th><th>Status</th>
                  <th>Data</th><th style={{textAlign:'right'}}>Views</th><th></th>
                </tr>
              </thead>
              <tbody>
                {noticias.map(n=>{
                  const nid=n._id?.toString()||n.id
                  const st=n.status||'publicado'
                  const tcfg=getToggleConfig(st)
                  const emT=publicandoId===nid, emD=deletandoId===nid
                  return (
                    <tr key={nid}>
                      <td style={{maxWidth:240}}>
                        <div style={{fontWeight:600,fontSize:13,lineHeight:1.4,
                          display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                          {n.titulo}
                        </div>
                        {n.destaque&&<span className="adm-badge adm-badge-amber" style={{marginTop:3}}>⭐ Destaque</span>}
                      </td>
                      <td><CategoriaBadge nome={n.categoria_id?.nome??n.categoria?.nome??'—'}/></td>
                      <td><StatusBadge status={st}/></td>
                      <td style={{color:'var(--adm-muted)',fontSize:12,whiteSpace:'nowrap'}}>{formatarData(n.criado_em)}</td>
                      <td style={{color:'var(--adm-muted)',fontSize:12,textAlign:'right'}}>{(n.views||0).toLocaleString('pt-BR')}</td>
                      <td>
                        <div className="adm-td-actions not-row-actions">
                          {/* Ver publicada */}
                          {st==='publicado'&&(
                            <Link to={`/noticia/${nid}`} target="_blank" aria-label="Ver no site" title="Ver no site"
                              className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.eye}</Link>
                          )}
                          {/* ── Toggle Publicar / Despublicar ── */}
                          <button onClick={()=>!emT&&!emD&&togglePublicacao(n)}
                            disabled={emT||emD} aria-label={tcfg.label} title={tcfg.label}
                            className="adm-btn adm-btn-icon adm-btn-sm"
                            style={{background:tcfg.bg,color:tcfg.color,border:`1px solid ${tcfg.border}`}}>
                            {emT?Ico.spinSm:tcfg.icon}
                          </button>
                          {/* Editar */}
                          <Link to={`/admin/editar/${nid}`} aria-label="Editar" title="Editar"
                            className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">{Ico.edit}</Link>
                          {/* Excluir */}
                          <button onClick={()=>!emD&&!emT&&setConfirm({aberto:true,noticia:n,carregando:false})}
                            disabled={emD||emT} aria-label="Excluir" title="Excluir"
                            className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">
                            {emD?Ico.spinSm:Ico.trash}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="not-cards">
            {noticias.map(n=>{
              const nid=n._id?.toString()||n.id
              const st=n.status||'publicado'
              const tcfg=getToggleConfig(st)
              const emT=publicandoId===nid, emD=deletandoId===nid
              return (
                <div key={nid} style={{background:'var(--adm-surface2)',border:'1px solid var(--adm-border)',borderRadius:10,padding:'10px 12px'}}>
                  <div style={{fontWeight:600,fontSize:13,lineHeight:1.4,marginBottom:6}}>{n.titulo}</div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:5}}>
                    <StatusBadge status={st}/><CategoriaBadge nome={n.categoria_id?.nome??'—'}/>
                  </div>
                  <div style={{fontSize:11,color:'var(--adm-muted)',marginBottom:8}}>
                    {formatarData(n.criado_em)} · {(n.views||0).toLocaleString('pt-BR')} views
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    {/* Toggle */}
                    <button onClick={()=>!emT&&!emD&&togglePublicacao(n)} disabled={emT||emD}
                      className="adm-btn adm-btn-sm"
                      style={{flex:1,justifyContent:'center',background:tcfg.bg,color:tcfg.color,border:`1px solid ${tcfg.border}`,fontWeight:600}}>
                      {emT?Ico.spinSm:tcfg.icon}
                      <span style={{marginLeft:5}}>{emT?'…':tcfg.label}</span>
                    </button>
                    {/* Editar */}
                    <Link to={`/admin/editar/${nid}`} className="adm-btn adm-btn-secondary adm-btn-sm"
                      style={{flex:1,justifyContent:'center'}}>
                      {Ico.edit}<span style={{marginLeft:5}}>Editar</span>
                    </Link>
                    {/* Excluir */}
                    <button onClick={()=>!emD&&!emT&&setConfirm({aberto:true,noticia:n,carregando:false})}
                      disabled={emD||emT} className="adm-btn adm-btn-danger adm-btn-sm" aria-label="Excluir">
                      {emD?Ico.spinSm:Ico.trash}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paginação */}
          {paginas>1&&(
            <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,padding:'14px 0'}}>
              <button className="adm-btn adm-btn-secondary adm-btn-sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Anterior</button>
              <span style={{fontSize:12,color:'var(--adm-muted)'}}>{page} / {paginas} — {total} notícias</span>
              <button className="adm-btn adm-btn-secondary adm-btn-sm" onClick={()=>setPage(p=>Math.min(paginas,p+1))} disabled={page===paginas}>Próxima →</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  ABAS + COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
const ABAS = [
  {id:'noticias',   label:'Notícias',   icon:Ico.newspaper},
  {id:'categorias', label:'Categorias', icon:Ico.tag},
  {id:'fontes',     label:'Fontes',     icon:Ico.globe},
]

export default function AdminNoticias() {
  const [abaAtiva, setAbaAtiva] = useState('noticias')

  return (
    <>
      <style>{`
        @keyframes not-spin { to { transform: rotate(360deg) } }

        /* Tabela: desktop | Cards: mobile */
        .not-table-wrap { display: block; }
        .not-cards      { display: none; flex-direction: column; gap: 8px; padding: 10px 12px; }
        @media (max-width: 640px) {
          .not-table-wrap { display: none !important; }
          .not-cards      { display: flex !important; }
        }

        /* Ações inline: apenas visíveis ao hover no desktop */
        @media (hover: hover) {
          .not-row-actions { opacity: 0; transition: opacity .15s; }
          .adm-table tbody tr:hover .not-row-actions { opacity: 1; }
        }

        /*\n         * .adm-tabs já tem overflow-x:auto e scrollbar-width:none nativamente.\n         */
      `}</style>

      <div style={{maxWidth:960,margin:'0 auto'}}>

        {/* Cabeçalho — padrão adm-page-header */}
        <div className="adm-page-header">
          <div>
            <div className="adm-page-title" style={{display:'flex',alignItems:'center',gap:8}}>
              {Ico.newspaper} Notícias
            </div>
            <div className="adm-page-sub">Gerencie notícias, categorias e fontes do portal.</div>
          </div>
          {abaAtiva==='noticias'&&(
            <Link to="/admin/nova-noticia" className="adm-btn adm-btn-primary">
              {Ico.plus} Nova notícia
            </Link>
          )}
        </div>

        {/* Barra de abas */}
        <div className="adm-tabs">
          {ABAS.map(aba=>(
            <button key={aba.id} onClick={()=>setAbaAtiva(aba.id)}
              className={`adm-tab-btn${abaAtiva===aba.id?' active':''}`}>
              {aba.icon} {aba.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        {abaAtiva==='noticias'   && <AbaNoticia/>}
        {abaAtiva==='categorias' && <AbaCategorias/>}
        {abaAtiva==='fontes'     && <AbaFontes/>}
      </div>
    </>
  )
}
