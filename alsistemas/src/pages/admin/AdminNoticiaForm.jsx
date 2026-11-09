import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSModal, DSBtn, DSBadge } from '../../components/admin/ui/DS'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { noticiasService, categoriasService, fontesService } from '../../services/api'
import { useNoticia } from '../../hooks/useNoticias'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import ImageUpload from '../../components/ImageUpload'
import MarkdownEditor from '../../components/MarkdownEditor'
import toast from 'react-hot-toast'

function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}

// #20 — Config visual de cada status
const STATUS_CFG = {
  rascunho:  { label: 'Rascunho',  bg: 'rgba(100,116,139,.15)', color: C.subtle, border: 'rgba(100,116,139,.3)'  },
  revisao:   { label: 'Revisão',   bg: C.amberBg, color: C.amber, border: C.amberBorder  },
  publicado: { label: 'Publicado', bg: C.greenBg, color: C.greenSolid, border: C.greenBorder   },
  arquivado: { label: 'Arquivado', bg: C.redBg, color: C.red, border: C.redBorder    },
}

// #20 — Transições possíveis a partir de cada estado
const TRANSICOES = {
  rascunho:  ['revisao', 'publicado'],
  revisao:   ['rascunho', 'publicado', 'arquivado'],
  publicado: ['arquivado', 'rascunho'],
  arquivado: ['rascunho'],
}

const LABEL_BOTAO = {
  rascunho:  'Salvar rascunho',
  revisao:   'Enviar para revisão',
  publicado: 'Publicar',
  arquivado: 'Arquivar',
}

/* ── QuickAdd ───────────────────────────────────────────────── */
function QuickAdd({ tipo, onCriado, onFechar }) {
  const [nome, setNome]   = useState('')
  const [extra, setExtra] = useState('')
  const [auto,  setAuto]  = useState(true)
  const [busy,  setBusy]  = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  function handleNome(v) { setNome(v); if (tipo==='categoria' && auto) setExtra(slugify(v)) }

  async function handleSalvar(e) {
    e.preventDefault(); e.stopPropagation()
    if (!nome.trim()) { toast.error('Nome obrigatório'); return }
    try {
      setBusy(true)
      const novo = tipo === 'categoria'
        ? await categoriasService.criar({ nome: nome.trim(), slug: extra.trim() })
        : await fontesService.criar({ nome: nome.trim(), url: extra.trim() || null })
      toast.success(`${tipo === 'categoria' ? 'Categoria' : 'Fonte'} criada!`)
      onCriado(novo)
    } catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 8, background: 'var(--adm-surface2)', border: '1px solid var(--adm-border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--adm-muted)' }}>
          {tipo === 'categoria' ? 'Nova categoria' : 'Nova fonte'}
        </span>
        <button type="button" onClick={onFechar} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" aria-label="Fechar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <input ref={ref} type="text" className="adm-input" placeholder={tipo === 'categoria' ? 'Nome da categoria' : 'Nome da fonte'}
        value={nome} onChange={e => handleNome(e.target.value)} style={{ marginBottom: 8 }}/>
      {tipo === 'categoria' && (
        <input type="text" className="adm-input adm-input-mono" placeholder="slug-da-url"
          value={extra} onChange={e => { setAuto(false); setExtra(e.target.value) }} style={{ marginBottom: 8 }}/>
      )}
      {tipo === 'fonte' && (
        <input type="url" className="adm-input" placeholder="https://... (opcional)"
          value={extra} onChange={e => setExtra(e.target.value)} style={{ marginBottom: 8 }}/>
      )}
      <div style={{ display:'flex', gap: 8 }}>
        <button type="button" onClick={handleSalvar} disabled={busy} className="adm-btn adm-btn-primary adm-btn-sm" style={{ flex: 1 }}>
          {busy ? 'Criando...' : 'Criar'}
        </button>
        <button type="button" onClick={onFechar} className="adm-btn adm-btn-ghost adm-btn-sm">Cancelar</button>
      </div>
    </div>
  )
}

/* ── SelectComAdicionar ─────────────────────────────────────── */
function SelectComAdicionar({ tipo, valor, opcoes, onChange, onNovaOpcao }) {
  const [open, setOpen] = useState(false)
  const label = tipo === 'categoria' ? 'Categoria' : 'Fonte'
  const empty = tipo === 'categoria' ? '— Sem categoria —' : '— Sem fonte —'

  return (
    <div className="adm-field">
      <label className="adm-label">{label}</label>
      <div style={{ display:'flex', gap: 8 }}>
        <select className="adm-input" style={{ flex: 1 }} value={valor} onChange={e => onChange(e.target.value)}>
          <option value="">{empty}</option>
          {opcoes.map(o => <option key={o._id||o.id} value={o._id||o.id}>{o.nome}</option>)}
        </select>
        <button type="button" onClick={() => setOpen(o => !o)}
          aria-label={`Criar nova ${label.toLowerCase()}`}
          className={`adm-btn adm-btn-sm${open ? ' adm-btn-primary' : ' adm-btn-secondary'}`}
          style={{ flexShrink: 0, padding: '0 10px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      {open && <QuickAdd tipo={tipo} onCriado={n => { onNovaOpcao(n); onChange(n._id||n.id); setOpen(false) }} onFechar={() => setOpen(false)}/>}
    </div>
  )
}

/* ── Contador de caracteres ─────────────────────────────────── */
function CharCount({ current, max, warn = 0.85 }) {
  const pct = current / max
  const color = pct >= 1 ? 'var(--adm-red)' : pct >= warn ? 'var(--adm-amber)' : 'var(--adm-muted)'
  return (
    <span style={{ fontSize: 11, color, marginTop: 4, display:'block', textAlign:'right' }}>
      {current}/{max}
    </span>
  )
}

const VAZIO = {
  titulo: '', resumo: '', conteudo: '',
  imagem_url: '', imagem_public_id: '', imagem_legenda: '',
  categoria_id: '', fonte_id: '', destaque: false,
  status: 'rascunho',  // #20 — padrão
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function AdminNoticiaForm() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const isEdicao     = !!id
  const { noticia, loading: carregando, error: erroCarregamento } = useNoticia(id)

  const [form,       setForm]       = useState(VAZIO)
  const [isDirty,    setIsDirty]    = useState(false)
  const [salvando,   setSalvando]   = useState(false)
  const [salvouOk,   setSalvouOk]   = useState(false) // controla modal de sucesso
  const [erros,      setErros]      = useState({})
  const [categorias, setCategorias] = useState([])
  const [fontes,     setFontes]     = useState([])

  const { showPrompt, confirm: confirmarSaida, cancel: cancelarSaida } = useUnsavedChanges(isDirty)

  useEffect(() => {
    categoriasService.listar().then(setCategorias).catch(() => {})
    fontesService.listar().then(setFontes).catch(() => {})
  }, [])

  useEffect(() => {
    if (noticia) {
      setForm({
        titulo:           noticia.titulo           || '',
        resumo:           noticia.resumo           || '',
        conteudo:         noticia.conteudo         || '',
        imagem_url:       noticia.imagem_url       || '',
        imagem_public_id: noticia.imagem_public_id || '',
        imagem_legenda:   noticia.imagem_legenda   || '',
        categoria_id:     noticia.categoria_id?._id?.toString() || noticia.categoria_id?.id || noticia.categoria_id || '',
        fonte_id:         noticia.fonte_id?._id?.toString()     || noticia.fonte_id?.id     || noticia.fonte_id     || '',
        destaque:         noticia.destaque         || false,
        status:           noticia.status           || 'rascunho',  // #20
      })
      setIsDirty(false)
    }
  }, [noticia])

  function set(campo, valor) {
    setForm(f => ({...f, [campo]: valor}))
    setIsDirty(true)
    if (erros[campo]) setErros(e => ({...e, [campo]: ''}))
  }

  function validar() {
    const e = {}
    if (!form.titulo.trim())   e.titulo   = 'Título é obrigatório'
    if (!form.conteudo.trim()) e.conteudo = 'Conteúdo é obrigatório'
    if (form.resumo.length > 300) e.resumo = 'Máximo de 300 caracteres'
    setErros(e); return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validar()) { toast.error('Corrija os erros antes de salvar'); return }
    try {
      setSalvando(true)
      const dados = {
        titulo:           form.titulo.trim(),
        resumo:           form.resumo.trim(),
        conteudo:         form.conteudo.trim(),
        imagem_url:       form.imagem_url       || null,
        imagem_public_id: form.imagem_public_id || null,
        imagem_legenda:   form.imagem_legenda.trim(),
        categoria_id:     form.categoria_id     || null,
        fonte_id:         form.fonte_id         || null,
        destaque:         form.destaque,
        status:           form.status,  // #20
      }
      if (isEdicao) {
        await noticiasService.editar(id, dados)
      } else {
        await noticiasService.criar(dados)
      }
      setIsDirty(false)
      setSalvouOk(true)
    } catch (err) { toast.error(err.message) }
    finally { setSalvando(false) }
  }

  /* ── Estados de carregamento / erro ── */
  if (isEdicao && carregando) {
    return (
      <div className="adm-empty" style={{ marginTop: 80 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28" className="adm-spin" style={{ margin: '0 auto' }}>
          <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
      </div>
    )
  }

  if (isEdicao && !carregando && !noticia) {
    return (
      <div className="adm-empty" style={{ marginTop: 80 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: .3 }}>
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <p style={{ marginBottom: 6, fontWeight: 600 }}>Não foi possível carregar a notícia.</p>
        {erroCarregamento && (
          <p style={{ fontSize: 12, color: 'var(--adm-red)', marginBottom: 12 }}>Erro: {erroCarregamento}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => window.location.reload()} className="adm-btn adm-btn-secondary adm-btn-sm">Tentar novamente</button>
          <Link to="/admin/noticias" className="adm-btn adm-btn-ghost adm-btn-sm">← Voltar</Link>
        </div>
      </div>
    )
  }

  /* ── Botão de salvar (label contextual ao status) ── */
  const BotaoSalvar = () => (
    <button type="submit" form="form-noticia" disabled={salvando} className="adm-btn adm-btn-primary">
      {salvando
        ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" className="adm-spin"><path d="M21 12a9 9 0 11-18 0"/></svg> Salvando...</>
        : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M5 12l5 5L20 7"/></svg> {LABEL_BOTAO[form.status] || 'Salvar'}</>
      }
    </button>
  )

  const statusAtual = STATUS_CFG[form.status] || STATUS_CFG.rascunho
  const transicoesDisponiveis = isEdicao ? (TRANSICOES[form.status] || []) : ['rascunho', 'revisao', 'publicado']

  return (
    <>
      <style>{`
        .status-selector { display:flex; flex-direction:column; gap:6px; }
        .status-option   {
          display:flex; align-items:center; gap:10px; padding:10px 12px;
          border-radius:8px; border:2px solid var(--adm-border);
          cursor:pointer; transition:all .15s; background:transparent;
          font-size:13px; font-weight:500; color:var(--adm-text); text-align:left;
        }
        .status-option:hover        { border-color:var(--adm-accent); }
        .status-option.selected     { border-color:var(--adm-accent); background:rgba(var(--adm-accent-rgb,107,124,78),.08); }
        .status-option.disabled-opt { opacity:.35; cursor:not-allowed; }
        .status-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      `}</style>

      {/* Modal: alterações não salvas */}
      {/* ── Modal: Salvo com sucesso ── */}
      {salvouOk && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}>
          <div style={{
            background:'var(--adm-surface)', border:'1px solid var(--adm-border)',
            
            boxShadow:'var(--adm-shadow-md)',
          }}>
            {/* Ícone de check */}
            <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
              <div style={{
                width:44, height:44, borderRadius:'50%',
                background:'rgba(34,197,94,.15)', display:'flex',
                alignItems:'center', justifyContent:'center',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"
                  width="22" height="22">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--adm-text)', marginBottom:6, textAlign:'center' }}>
              {form.status === 'publicado' ? 'Notícia publicada!' : 'Notícia salva!'}
            </div>
            <div style={{ fontSize:13, color:'var(--adm-muted)', marginBottom:20, lineHeight:1.5, textAlign:'center' }}>
              {form.status === 'publicado'
                ? 'A notícia está visível no portal.'
                : `Salva como "${form.status === 'revisao' ? 'Em Revisão' : 'Rascunho'}".`}
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button
                onClick={() => setSalvouOk(false)}
                className="adm-btn adm-btn-secondary">
                Continuar editando
              </button>
              <button
                onClick={() => navigate('/admin/noticias')}
                className="adm-btn adm-btn-primary">
                Ir para Notícias
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Sair sem salvar ── */}
      {showPrompt && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }}
          onClick={e => { if (e.target === e.currentTarget) cancelarSaida() }}
        >
          <div style={{
            background:'var(--adm-surface)', border:'1px solid var(--adm-border)',
            
            boxShadow:'var(--adm-shadow-md)',
          }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--adm-text)', marginBottom:8 }}>Sair sem salvar?</div>
            <div style={{ fontSize:13, color:'var(--adm-muted)', marginBottom:20, lineHeight:1.5 }}>
              As alterações feitas nesta notícia serão perdidas.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={cancelarSaida} className="adm-btn adm-btn-secondary">Continuar editando</button>
              <button onClick={confirmarSaida} className="adm-btn adm-btn-danger">Sair sem salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">{isEdicao ? 'Editar Notícia' : 'Nova Notícia'}</div>
          <div className="adm-page-sub" style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isEdicao ? 'Atualize os campos e salve' : 'Preencha e defina o status'}
            {/* #20 — Badge do status atual */}
            <span style={{
              padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
              background: statusAtual.bg, color: statusAtual.color, border:`1px solid ${statusAtual.border}`,
            }}>{statusAtual.label}</span>
          </div>
        </div>
        <div className="adm-page-actions">
          <Link to="/admin/noticias" className="adm-btn adm-btn-secondary">Cancelar</Link>
          <BotaoSalvar />
        </div>
      </div>

      <form id="form-noticia" onSubmit={handleSubmit} noValidate>
        <div className="adm-form-grid">

          {/* ══ COLUNA PRINCIPAL ══ */}
          <div className="adm-form-col">

            {/* Card: Título + Resumo */}
            <div className="adm-card">
              <div className="adm-card-section">
                <div className="adm-section-label">Identificação</div>

                <div className="adm-field">
                  <label className="adm-label" htmlFor="titulo">Título *</label>
                  <input
                    id="titulo" type="text"
                    className={`adm-input${erros.titulo ? ' adm-input-error' : ''}`}
                    placeholder="Ex: Prefeitura inaugura nova praça no centro"
                    value={form.titulo} onChange={e => set('titulo', e.target.value)}
                    maxLength={200}
                  />
                  {erros.titulo
                    ? <span style={{ fontSize:11, color:'var(--adm-red)', marginTop:4, display:'block' }}>{erros.titulo}</span>
                    : <CharCount current={form.titulo.length} max={200} />}
                </div>

                <div className="adm-field" style={{ marginBottom: 0 }}>
                  <label className="adm-label" htmlFor="resumo">
                    Resumo
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 600,
                      background: 'rgba(var(--adm-accent-rgb,107,124,78),.12)',
                      color: 'var(--adm-accent)', padding: '1px 6px', borderRadius: 4,
                    }}>LEAD</span>
                  </label>
                  <textarea
                    id="resumo"
                    className={`adm-input${erros.resumo ? ' adm-input-error' : ''}`}
                    placeholder="Escreva uma chamada de 1–2 frases que apareça abaixo do título..."
                    value={form.resumo}
                    onChange={e => set('resumo', e.target.value)}
                    rows={3}
                    maxLength={300}
                    style={{ resize: 'none' }}
                  />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginTop: 4 }}>
                    {erros.resumo
                      ? <span style={{ fontSize:11, color:'var(--adm-red)' }}>{erros.resumo}</span>
                      : <span style={{ fontSize:11, color:'var(--adm-muted)', lineHeight:1.4 }}>
                          Aparece entre o título e o corpo da notícia, em destaque.
                        </span>}
                    <CharCount current={form.resumo.length} max={300} />
                  </div>
                </div>
              </div>
            </div>

            {/* Card: Conteúdo */}
            <div className="adm-card">
              <div className="adm-card-section">
                <div className="adm-section-label">Corpo da notícia *</div>
                <MarkdownEditor value={form.conteudo} onChange={v => set('conteudo', v)} error={!!erros.conteudo}/>
                {erros.conteudo && (
                  <span style={{ fontSize:11, color:'var(--adm-red)', marginTop:4, display:'block' }}>{erros.conteudo}</span>
                )}
              </div>
            </div>

            {/* Card: Imagem de capa + legenda */}
            <div className="adm-card">
              <div className="adm-card-section">
                <div className="adm-section-label">Imagem de capa</div>
                <div style={{ fontSize:11, color:'var(--adm-muted)', marginBottom:12 }}>
                  1280×720px · JPG, PNG, WebP · máx. 5 MB
                </div>
                <ImageUpload
                  value={form.imagem_url}
                  onChange={r => {
                    if (r && typeof r === 'object') { set('imagem_url', r.url||''); set('imagem_public_id', r.public_id||'') }
                    else { set('imagem_url',''); set('imagem_public_id','') }
                  }}
                />
                {form.imagem_url && (
                  <div className="adm-field" style={{ marginTop: 14, marginBottom: 0 }}>
                    <label className="adm-label" htmlFor="imagem_legenda">
                      Legenda da foto
                      <span style={{
                        marginLeft: 6, fontSize: 10, fontWeight: 600,
                        background: 'rgba(99,102,241,.1)', color: '#6366f1',
                        padding: '1px 6px', borderRadius: 4,
                      }}>OPCIONAL</span>
                    </label>
                    <input
                      id="imagem_legenda" type="text"
                      className="adm-input"
                      placeholder="Ex: Vista aérea da nova praça — Foto: Secretaria Municipal"
                      value={form.imagem_legenda}
                      onChange={e => set('imagem_legenda', e.target.value)}
                      maxLength={200}
                    />
                    <span style={{ fontSize:11, color:'var(--adm-muted)', marginTop:4, display:'block' }}>
                      Crédito da foto ou descrição curta. Aparece logo abaixo da imagem.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ SIDEBAR ══ */}
          <div className="adm-form-col">

            {/* Card: Publicação — inclui status + destaque + cat + fonte */}
            <div className="adm-card">
              <div className="adm-card-section">
                <div className="adm-section-label">Status editorial</div>

                {/* #20 — Seletor de status */}
                <div className="status-selector">
                  {(['rascunho', 'revisao', 'publicado', 'arquivado']).map(s => {
                    const cfg       = STATUS_CFG[s]
                    const isSelected = form.status === s
                    const isAvail   = !isEdicao
                      ? ['rascunho', 'revisao', 'publicado'].includes(s)
                      : s === form.status || transicoesDisponiveis.includes(s)

                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!isAvail}
                        onClick={() => isAvail && set('status', s)}
                        className={`status-option${isSelected ? ' selected' : ''}${!isAvail ? ' disabled-opt' : ''}`}
                      >
                        <span
                          className="status-dot"
                          style={{ background: cfg.color }}
                        />
                        <span style={{ flex: 1 }}>{cfg.label}</span>
                        {isSelected && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            width="14" height="14" style={{ color: 'var(--adm-accent)', flexShrink:0 }}>
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Dica contextual por status */}
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 8,
                  background: statusAtual.bg, border: `1px solid ${statusAtual.border}`,
                  fontSize: 11, color: statusAtual.color, lineHeight: 1.5,
                }}>
                  {form.status === 'rascunho'  && 'Visível apenas para editores. Ainda não aparece no portal.'}
                  {form.status === 'revisao'   && 'Aguardando aprovação. Ainda não aparece no portal.'}
                  {form.status === 'publicado' && 'Visível para todos os leitores do portal.'}
                  {form.status === 'arquivado' && 'Removida da listagem pública. Pode ser recuperada a qualquer momento.'}
                </div>
              </div>

              <div className="adm-card-section">
                <div className="adm-section-label">Configurações</div>
                <div className="adm-toggle-row">
                  <div>
                    <div className="adm-toggle-label">Destaque</div>
                    <div className="adm-toggle-desc">Aparece na seção Destaques da home</div>
                  </div>
                  <button
                    type="button" role="switch"
                    aria-checked={form.destaque}
                    onClick={() => set('destaque', !form.destaque)}
                    className={`adm-toggle${form.destaque ? ' on' : ''}`}
                    aria-label="Marcar como destaque"
                  />
                </div>
              </div>

              <div className="adm-card-section">
                <SelectComAdicionar tipo="categoria" valor={form.categoria_id} opcoes={categorias}
                  onChange={v => set('categoria_id', v)}
                  onNovaOpcao={n => setCategorias(prev => [...prev, n].sort((a,b) => a.nome.localeCompare(b.nome)))}/>
                <SelectComAdicionar tipo="fonte" valor={form.fonte_id} opcoes={fontes}
                  onChange={v => set('fonte_id', v)}
                  onNovaOpcao={n => setFontes(prev => [...prev, n].sort((a,b) => a.nome.localeCompare(b.nome)))}/>
              </div>
            </div>

            {/* Dica de resumo */}
            <div style={{
              background: 'rgba(var(--adm-accent-rgb,107,124,78),.07)',
              border: '1px solid rgba(var(--adm-accent-rgb,107,124,78),.2)',
              borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--adm-accent)', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Dica: campo Resumo
              </div>
              <p style={{ fontSize:12, color:'var(--adm-muted)', margin:0, lineHeight:1.6 }}>
                O <b style={{color:'var(--adm-text)'}}>resumo</b> funciona como o lead jornalístico —
                responde &quot;quem, o quê, quando, onde&quot; em 1-2 frases.
                Aparece em destaque logo abaixo do título, antes do corpo, como na CNN, BBC e G1.
              </p>
            </div>

            {/* Botão salvar fixo na sidebar (mobile) */}
            <div className="adm-form-save-mobile">
              <BotaoSalvar />
            </div>
          </div>
        </div>
      </form>
    </>
  )
}
