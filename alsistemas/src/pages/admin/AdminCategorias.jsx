import { useState, useEffect } from 'react'
import { categoriasService } from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import toast from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

// ─── Helpers ──────────────────────────────────────────────────
function slugify(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── SVG Icons ────────────────────────────────────────────────
const IcoEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>
  </svg>
)
const IcoTag = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
    <path d="M7 7h.01M7 3h5l7.586 7.586a2 2 0 010 2.828L14 19a2 2 0 01-2.828 0L3.586 11.414A2 2 0 013 10V5a2 2 0 012-2z"/>
  </svg>
)

// ─── Modal de Formulário ──────────────────────────────────────
function CategoriaModal({ categoria, onSalvar, onFechar, salvando }) {
  const isNovo = !categoria?.id
  const [nome,     setNome]     = useState(categoria?.nome     || '')
  const [slug,     setSlug]     = useState(categoria?.slug     || '')
  const [descricao, setDescricao] = useState(categoria?.descricao || '')
  const [autoSlug, setAutoSlug] = useState(isNovo)

  const charCount = descricao.length
  const charOk    = charCount === 0 || (charCount >= 120 && charCount <= 160)
  const charWarn  = charCount > 0 && charCount < 120
  const charOver  = charCount > 160

  function handleNome(v) {
    setNome(v)
    if (autoSlug) setSlug(slugify(v))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!nome.trim() || !slug.trim()) { toast.error('Nome e slug são obrigatórios'); return }
    onSalvar({ nome: nome.trim(), slug: slug.trim(), descricao: descricao.trim() })
  }

  return (
    <>
      <style>{`
        .cat-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          z-index: 1000; display: flex; align-items: center; justify-content: center; padding: SPACE.xlpx;
          animation: cat-fade-in .15s ease;
        }
        @keyframes cat-fade-in { from { opacity: 0 } to { opacity: 1 } }
        .cat-modal {
          background: var(--adm-surface); border: 1px solid var(--adm-border);
          border-radius: 16px; width: 100%; max-width: 480px; padding: 28px 28px 24px;
          box-shadow: 0 24px 64px rgba(0,0,0,.45);
          animation: cat-slide-up .18s ease;
        }
        @keyframes cat-slide-up { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
        @media (max-width: 600px) {
          .cat-overlay { align-items: flex-end; padding: 0; }
          .cat-modal   { border-radius: 20px 20px 0 0; max-width: 100%; padding: SPACE.xl3px 20px 32px; }
        }
      `}</style>

      <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={isNovo ? 'Nova categoria' : 'Editar categoria'}
        onMouseDown={e => { if (e.target === e.currentTarget && !salvando) onFechar() }}>
        <div className="cat-modal">

          {/* Cabeçalho */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ fontSize: FONT.lg, fontWeight: 700, color: 'var(--adm-text)' }}>
              {isNovo ? '✦ Nova categoria' : 'Editar categoria'}
            </div>
            <button onClick={() => !salvando && onFechar()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-muted)', padding: 4, borderRadius: RADIUS.sm, lineHeight: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Nome */}
            <div>
              <label className="adm-label" htmlFor="cat-nome">Nome <span style={{ color: 'var(--adm-accent)' }}>*</span></label>
              <input id="cat-nome" className="adm-input" placeholder="Ex: Política"
                value={nome} onChange={e => handleNome(e.target.value)} maxLength={100} autoFocus />
            </div>

            {/* Slug */}
            <div>
              <label className="adm-label" htmlFor="cat-slug">Slug <span style={{ color: 'var(--adm-accent)' }}>*</span></label>
              <input id="cat-slug" className="adm-input adm-input-mono" placeholder="politica"
                value={slug} onChange={e => { setAutoSlug(false); setSlug(e.target.value) }} maxLength={100} />
              <span style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', marginTop: 4, display: 'block' }}>
                Endereço: <code style={{ fontFamily: 'var(--adm-mono)' }}>/categoria/{slug || '…'}</code>
              </span>
            </div>

            {/* Descrição */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="adm-label" htmlFor="cat-desc" style={{ marginBottom: 0 }}>
                  Descrição <span style={{ fontWeight: 400, color: 'var(--adm-muted)', fontSize: FONT.sm }}>(SEO)</span>
                </label>
                {charCount > 0 && (
                  <span style={{ fontSize: FONT.sm, fontWeight: 600,
                    color: charOver ? C.red : charWarn ? C.amber : 'var(--adm-accent)' }}>
                    {charCount}/160
                  </span>
                )}
              </div>
              <textarea id="cat-desc" className="adm-input" rows={3}
                placeholder="Breve descrição da categoria — aparece em buscadores e no topo da página de listagem."
                value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={200}
                style={{ resize: 'vertical', minHeight: 72 }} />
              <span style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', marginTop: 4, display: 'block', lineHeight: 1.5 }}>
                {charOver
                  ? '⚠️ Acima de 160 caracteres — buscadores podem truncar'
                  : charWarn
                    ? '↑ Ideal: entre 120 e 160 caracteres para melhor SEO'
                    : charCount === 0
                      ? 'Usado como meta description na página da categoria'
                      : '✓ Comprimento ideal para meta description'
                }
              </span>
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => !salvando && onFechar()} className="adm-btn adm-btn-ghost">
                Cancelar
              </button>
              <button type="submit" disabled={salvando} className="adm-btn adm-btn-primary">
                {salvando ? 'Salvando…' : isNovo ? 'Criar categoria' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

// ─── Componente Principal ──────────────────────────────────────
export default function AdminCategorias() {
  const [categorias,  setCategorias]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [salvando,    setSalvando]    = useState(false)
  const [deletandoId, setDeletandoId] = useState(null)
  const [modal,       setModal]       = useState(null)   // null | { categoria: null | objeto }
  const [confirm,     setConfirm]     = useState({ aberto: false, cat: null, carregando: false })

  async function carregar() {
    try { setLoading(true); setCategorias(await categoriasService.listar()) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  async function handleSalvar(dados) {
    try {
      setSalvando(true)
      if (modal?.categoria?.id) {
        await categoriasService.editar(modal.categoria.id, dados)
        toast.success('Categoria atualizada!')
      } else {
        await categoriasService.criar(dados)
        toast.success('Categoria criada!')
      }
      setModal(null)
      carregar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarExclusao() {
    const cat = confirm.cat
    setConfirm(c => ({ ...c, carregando: true }))
    try {
      setDeletandoId(cat.id)
      await categoriasService.excluir(cat.id)
      toast.success('Categoria excluída!')
      setConfirm({ aberto: false, cat: null, carregando: false })
      carregar()
    } catch (err) {
      toast.error(err.message)
      setConfirm(c => ({ ...c, carregando: false }))
    } finally {
      setDeletandoId(null)
    }
  }

  return (
    <>
      <style>{`
        /* Botões de ação visíveis só no hover (desktop) */
        .cat-actions { display: flex; align-items: center; gap: SPACE.xspx; }
        @media (hover: hover) {
          .cat-actions { opacity: 0; transition: opacity .15s; }
          .adm-table tbody tr:hover .cat-actions { opacity: 1; }
        }
        /* Cards mobile */
        @media (max-width: 640px) {
          .cat-table-wrap { display: none !important; }
          .cat-cards      { display: flex !important; }
        }
        @media (min-width: 641px) {
          .cat-cards { display: none !important; }
        }
        .cat-cards {
          flex-direction: column; gap: 10px; padding: 14px 16px;
        }
        .cat-card {
          background: var(--adm-surface2);
          border: 1px solid var(--adm-border);
          border-radius: 10px;
          padding: 14px 16px;
        }
      `}</style>

      {/* Modal de criação/edição */}
      {modal !== null && (
        <CategoriaModal
          categoria={modal.categoria}
          onSalvar={handleSalvar}
          onFechar={() => !salvando && setModal(null)}
          salvando={salvando}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        aberto={confirm.aberto}
        titulo={`Excluir "${confirm.cat?.nome}"?`}
        mensagem="As notícias desta categoria ficarão sem categoria. Esta ação é irreversível."
        labelConfirmar="Excluir"
        carregando={confirm.carregando}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setConfirm({ aberto: false, cat: null, carregando: false })}
      />

      {/* Cabeçalho da página */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Categorias</div>
          <div className="adm-page-sub">
            {categorias.length} cadastrada{categorias.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="adm-page-actions">
          <button onClick={() => setModal({ categoria: null })} className="adm-btn adm-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Nova categoria
          </button>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-table-header">
          <div className="adm-table-title">Todas as categorias</div>
        </div>

        {/* Estado de carregamento */}
        {loading && (
          <div className="adm-empty" role="status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24"
              className="adm-spin" style={{ margin: '0 auto', opacity: .5 }}>
              <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/>
            </svg>
          </div>
        )}

        {/* Estado vazio */}
        {!loading && categorias.length === 0 && (
          <div className="adm-empty">
            <IcoTag />
            <p>Nenhuma categoria cadastrada.<br/>
              <button onClick={() => setModal({ categoria: null })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-accent)', fontWeight: 600, fontSize: FONT.md, padding: 0, marginTop: 4 }}>
                Criar primeira categoria →
              </button>
            </p>
          </div>
        )}

        {!loading && categorias.length > 0 && (
          <>
            {/* ── Desktop: tabela ── */}
            <div className="adm-table-scroll cat-table-wrap">
              <table className="adm-table" aria-label="Lista de categorias">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Slug</th>
                    <th>Descrição SEO</th>
                    <th style={{ width: 1, whiteSpace: 'nowrap' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map(cat => (
                    <tr key={cat.id}>
                      <td style={{ fontWeight: 500 }}>{cat.nome}</td>
                      <td>
                        <code style={{ fontFamily: 'var(--adm-mono)', fontSize: FONT.sm, color: 'var(--adm-muted)' }}>
                          /{cat.slug}
                        </code>
                      </td>
                      <td style={{ maxWidth: 260, color: 'var(--adm-muted)', fontSize: FONT.base }}>
                        {cat.descricao
                          ? <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.descricao}</span>
                          : <span style={{ opacity: .4, fontStyle: 'italic' }}>Sem descrição</span>
                        }
                      </td>
                      <td>
                        <div className="cat-actions">
                          <button onClick={() => setModal({ categoria: cat })}
                            aria-label={`Editar ${cat.nome}`}
                            className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">
                            <IcoEdit />
                          </button>
                          <button onClick={() => setConfirm({ aberto: true, cat, carregando: false })}
                            disabled={deletandoId === cat.id}
                            aria-label={`Excluir ${cat.nome}`}
                            className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">
                            <IcoTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: cards ── */}
            <div className="cat-cards">
              {categorias.map(cat => (
                <div key={cat.id} className="cat-card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: FONT.lg - 1, color: 'var(--adm-text)', marginBottom: 3 }}>
                        {cat.nome}
                      </div>
                      <code style={{ fontSize: FONT.sm, color: 'var(--adm-muted)', fontFamily: 'var(--adm-mono)' }}>
                        /{cat.slug}
                      </code>
                      {cat.descricao && (
                        <div style={{ fontSize: FONT.base, color: 'var(--adm-muted)', marginTop: 6, lineHeight: 1.5 }}>
                          {cat.descricao}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: SPACE.sm, flexShrink: 0, paddingTop: 2 }}>
                      <button onClick={() => setModal({ categoria: cat })}
                        aria-label={`Editar ${cat.nome}`}
                        className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm">
                        <IcoEdit />
                      </button>
                      <button onClick={() => setConfirm({ aberto: true, cat, carregando: false })}
                        disabled={deletandoId === cat.id}
                        aria-label={`Excluir ${cat.nome}`}
                        className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm">
                        <IcoTrash />
                      </button>
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

