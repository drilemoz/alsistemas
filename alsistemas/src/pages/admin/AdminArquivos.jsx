/**
 * AdminArquivos.jsx — Editor de arquivos de configuração + leitor de docs .md
 *
 * Layout:
 *   Desktop: sidebar esquerda (lista) + painel direito (editor/viewer)
 *   Mobile:  tela de lista → tela de editor (navegação por estado)
 *
 * DS Sprint (conformidade total):
 *   - Tokens: SPACE, RADIUS, FONT, C.* em todos os estilos
 *   - DSPageHeader: cabeçalho da sidebar usa padrão DS
 *   - FONT.sm.5 / FONT.base.5 → FONT.sm / FONT.base (corrigidos)
 *   - Viewer MD: usa markdownParaHtml com CSS próprio do DS via prose-admin
 *   - MarkdownViewer: TOC lateral, índice de seções, sem dependências extras
 *   - Lista .md: automática via backend (sem links hardcoded)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { arquivosService }   from '../../services/domains/arquivos.js'
import { markdownParaHtml }  from '../../utils/markdown.js'
import toast                 from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

// ── Metadados visuais por linguagem ──────────────────────────

const LANG_META = {
  dotenv:     { label: '.env',  cor: C.amber,       bg: `${C.amber}1e`      },
  typescript: { label: 'TS',   cor: C.blue,         bg: `${C.blue}1e`       },
  yaml:       { label: 'YAML', cor: C.purple,       bg: `${C.purple}1e`     },
  markdown:   { label: 'MD',   cor: C.greenSolid,   bg: `${C.greenSolid}1e` },
}

// ── Sub-componentes ───────────────────────────────────────────

function LangBadge({ linguagem }) {
  const meta = LANG_META[linguagem] || { label: linguagem, cor: C.subtle, bg: `${C.subtle}22` }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: RADIUS.xs,
      fontSize: FONT.xs, fontWeight: 800, letterSpacing: .4,
      color: meta.cor, background: meta.bg, flexShrink: 0,
    }}>
      {meta.label}
    </span>
  )
}

function ExisteIndicador({ existe }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
      background: existe ? C.greenSolid : C.subtle,
      boxShadow: existe ? `0 0 5px ${C.greenSolid}66` : 'none',
    }} title={existe ? 'Arquivo encontrado no disco' : 'Arquivo não encontrado (será criado ao salvar)'} />
  )
}

function AvisoBanner({ texto }) {
  if (!texto) return null
  return (
    <div style={{
      display: 'flex', gap: SPACE.sm, alignItems: 'flex-start',
      background: `${C.amber}14`, border: `1px solid ${C.amber}40`,
      borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.md}px`, marginBottom: SPACE.md,
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
        width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span style={{ fontSize: FONT.base, color: C.amber, lineHeight: 1.55 }}>{texto}</span>
    </div>
  )
}

function ItemLista({ arq, ativo, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      width: '100%', padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.md, marginBottom: 2,
      background: ativo ? C.surface2 : 'transparent',
      border: 'none', borderLeft: `2px solid ${ativo ? C.accent : 'transparent'}`,
      cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
    }}>
      <ExisteIndicador existe={arq.existe} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: FONT.base, fontWeight: 600,
          color: ativo ? C.text : C.muted,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {arq.label}
        </div>
        {arq.descricao && (
          <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 1, lineHeight: 1.3 }}>
            {arq.descricao}
          </div>
        )}
      </div>
      <LangBadge linguagem={arq.linguagem} />
    </button>
  )
}

function GrupoLista({ grupo, arquivos, ativoKey, onSelect }) {
  return (
    <div style={{ marginBottom: SPACE.xl }}>
      <div style={{
        fontSize: FONT.xs, fontWeight: 800, letterSpacing: .8,
        textTransform: 'uppercase', color: C.muted,
        padding: `0 ${SPACE.md}px ${SPACE.xs}px`,
      }}>
        {grupo}
      </div>
      {arquivos.map(arq => (
        <ItemLista key={arq.key} arq={arq} ativo={ativoKey === arq.key} onClick={() => onSelect(arq.key)} />
      ))}
    </div>
  )
}

// ── Viewer de Markdown com TOC ────────────────────────────────

function extrairToc(html) {
  const re = /<h([1-3])[^>]*id="([^"]*)"[^>]*>([^<]*(?:<(?!\/h[1-3])[^>]*>[^<]*)*)<\/h[1-3]>/g
  const itens = []
  let m
  while ((m = re.exec(html)) !== null) {
    itens.push({
      nivel: Number(m[1]),
      id:    m[2],
      label: m[3].replace(/<[^>]+>/g, ''),
    })
  }
  return itens
}

function MarkdownViewer({ conteudo }) {
  const html = markdownParaHtml(conteudo)
  const toc  = extrairToc(html)
  const [secaoAtiva, setSecaoAtiva] = useState('')
  const contentRef = useRef(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el || !toc.length) return
    const observer = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting)
        if (vis.length) setSecaoAtiva(vis[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    toc.forEach(({ id }) => {
      const node = el.querySelector(`#${CSS.escape(id)}`)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [html])

  return (
    <div style={{ display: 'flex', gap: SPACE.xl, flex: 1, overflow: 'hidden', minHeight: 0 }}>

      {/* ── Conteúdo ──────────────────────────────────────── */}
      <div
        ref={contentRef}
        className="md-viewer"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          flex: 1, overflowY: 'auto',
          padding: `${SPACE.xl}px ${SPACE.xl2}px`,
          minHeight: 0,
        }}
      />

      {/* ── TOC lateral (só desktop, só se tiver seções) ──── */}
      {toc.length > 1 && (
        <div style={{
          width: 180, flexShrink: 0, overflowY: 'auto',
          padding: `${SPACE.xl}px 0`,
          display: 'none',
        }} className="md-toc">
          <div style={{
            fontSize: FONT.xs, fontWeight: 800, letterSpacing: .8,
            textTransform: 'uppercase', color: C.muted,
            marginBottom: SPACE.md,
          }}>
            Nesta página
          </div>
          {toc.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={e => {
                e.preventDefault()
                contentRef.current?.querySelector(`#${CSS.escape(item.id)}`)
                  ?.scrollIntoView({ behavior: 'smooth' })
              }}
              style={{
                display: 'block', textDecoration: 'none',
                padding: `3px 0 3px ${(item.nivel - 1) * 10}px`,
                fontSize: FONT.xs, lineHeight: 1.4,
                color: secaoAtiva === item.id ? C.blue : C.muted,
                fontWeight: secaoAtiva === item.id ? 700 : 400,
                borderLeft: `2px solid ${secaoAtiva === item.id ? C.blue : 'transparent'}`,
                paddingLeft: (item.nivel - 1) * 10 + 8,
                transition: 'all .15s',
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ícones ────────────────────────────────────────────────────

function IcoArquivos({ grande }) {
  const sz = grande ? 40 : 16
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      width={sz} height={sz} style={{ opacity: grande ? .3 : 1, flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  )
}
function IcoSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  )
}
function IcoCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  )
}
function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={C.greenSolid} strokeWidth="2.5" width="13" height="13">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IcoUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
      <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
    </svg>
  )
}
function IcoSpin({ small }) {
  const sz = small ? 12 : 20
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      width={sz} height={sz} className="adm-spin">
      <path d="M21 12a9 9 0 11-18 0"/>
    </svg>
  )
}
function IcoChevBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
      <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
  )
}

// ── Componente principal ──────────────────────────────────────

export default function AdminArquivos() {
  const [lista,            setLista]            = useState([])
  const [carregandoLista,  setCarregandoLista]  = useState(true)
  const [ativoKey,         setAtivoKey]         = useState(null)
  const [arquivo,          setArquivo]          = useState(null)
  const [conteudo,         setConteudo]         = useState('')
  const [original,         setOriginal]         = useState('')
  const [carregando,       setCarregando]       = useState(false)
  const [salvando,         setSalvando]         = useState(false)
  const [mobileView,       setMobileView]       = useState('lista')
  const [copiado,          setCopiado]          = useState(false)
  const textareaRef = useRef(null)

  const modificado = conteudo !== original

  // Carrega lista (config + .md auto-descobertos)
  useEffect(() => {
    setCarregandoLista(true)
    arquivosService.listar()
      .then(setLista)
      .catch(() => toast.error('Erro ao carregar lista de arquivos'))
      .finally(() => setCarregandoLista(false))
  }, [])

  // Abre arquivo
  const abrirArquivo = useCallback(async (key) => {
    if (ativoKey === key) return
    setAtivoKey(key)
    setArquivo(null)
    setConteudo('')
    setOriginal('')
    setCarregando(true)
    setMobileView('editor')
    try {
      const dados = await arquivosService.ler(key)
      setArquivo(dados)
      setConteudo(dados.conteudo)
      setOriginal(dados.conteudo)
    } catch {
      toast.error('Erro ao ler o arquivo')
      setAtivoKey(null)
      setMobileView('lista')
    } finally {
      setCarregando(false)
    }
  }, [ativoKey])

  async function handleSalvar() {
    if (!ativoKey || salvando) return
    setSalvando(true)
    try {
      await arquivosService.salvar(ativoKey, conteudo)
      setOriginal(conteudo)
      setLista(prev => prev.map(a => a.key === ativoKey ? { ...a, existe: true } : a))
      toast.success('Arquivo salvo com sucesso!')
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(conteudo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const s = ta.selectionStart, en = ta.selectionEnd
      const novo = conteudo.slice(0, s) + '  ' + conteudo.slice(en)
      setConteudo(novo)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSalvar()
    }
  }

  function fmtBytes(b) {
    if (!b) return '0 B'
    if (b < 1024) return `${b} B`
    return `${(b / 1024).toFixed(1)} KB`
  }
  function fmtLinhas(t) { return `${t.split('\n').length} linhas` }

  const grupos = [...new Set(lista.map(a => a.grupo))]
  const ehMd   = arquivo?.linguagem === 'markdown'

  // ── Sidebar ───────────────────────────────────────────────

  const sidebar = (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: C.surface, borderRight: `1px solid ${C.border}`,
    }}>
      <div style={{
        padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.sm}px`,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: 3 }}>
          <IcoArquivos />
          <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>
            Arquivos do projeto
          </span>
        </div>
        <div style={{ fontSize: FONT.sm, color: C.muted }}>
          {lista.filter(a => a.existe).length}/{lista.length} arquivos no disco
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: `${SPACE.sm}px ${SPACE.xs}px` }}>
        {carregandoLista ? (
          <div style={{ padding: SPACE.xl2, textAlign: 'center' }}>
            <IcoSpin />
            <div style={{ fontSize: FONT.base, color: C.muted, marginTop: SPACE.sm }}>
              Carregando...
            </div>
          </div>
        ) : (
          grupos.map(grupo => (
            <GrupoLista
              key={grupo}
              grupo={grupo}
              arquivos={lista.filter(a => a.grupo === grupo)}
              ativoKey={ativoKey}
              onSelect={abrirArquivo}
            />
          ))
        )}
      </div>
    </div>
  )

  // ── Painel editor/viewer ──────────────────────────────────

  const painel = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE.md,
        padding: `${SPACE.sm}px ${SPACE.lg}px`,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0, flexWrap: 'wrap', rowGap: 6,
      }}>
        {/* Voltar (mobile) */}
        <button
          onClick={() => setMobileView('lista')}
          className="adm-btn adm-btn-ghost adm-btn-sm adm-only-mobile"
          style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}
        >
          <IcoChevBack /> Voltar
        </button>

        {arquivo && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
              <ExisteIndicador existe={arquivo.existe} />
              <span style={{
                fontSize: FONT.md, fontWeight: 600, color: C.text,
                fontFamily: 'monospace', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {arquivo.label}
              </span>
              <LangBadge linguagem={arquivo.linguagem} />
              {ehMd && (
                <span style={{
                  fontSize: FONT.xs, fontWeight: 600, color: C.muted,
                  background: C.surface2, borderRadius: RADIUS.xs,
                  padding: `2px ${SPACE.sm}px`,
                  border: `1px solid ${C.border}`,
                }}>
                  👁 somente leitura
                </span>
              )}
              {!ehMd && modificado && (
                <span style={{
                  fontSize: FONT.xs, fontWeight: 700, color: C.amber,
                  background: `${C.amber}1e`, borderRadius: RADIUS.xs,
                  padding: `2px ${SPACE.sm}px`,
                }}>
                  MODIFICADO
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: SPACE.sm, flexShrink: 0 }}>
              <button onClick={handleCopiar} className="adm-btn adm-btn-ghost adm-btn-sm"
                title="Copiar conteúdo"
                style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                {copiado
                  ? <><IcoCheck /> Copiado</>
                  : <><IcoCopy /> <span className="adm-only-desktop">Copiar</span></>
                }
              </button>

              {!ehMd && (
                <>
                  {modificado && (
                    <button onClick={() => setConteudo(original)}
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                      <IcoUndo />
                      <span className="adm-only-desktop">Descartar</span>
                    </button>
                  )}
                  <button onClick={handleSalvar} disabled={salvando || !modificado}
                    className="adm-btn adm-btn-primary adm-btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                    {salvando
                      ? <><IcoSpin small /> Salvando...</>
                      : <><IcoSave /> Salvar</>
                    }
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Corpo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Empty state */}
        {!ativoKey && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: SPACE.lg, color: C.muted, padding: SPACE.xl2,
          }}>
            <IcoArquivos grande />
            <div style={{ fontSize: FONT.lg, fontWeight: 600, color: C.text }}>
              Selecione um arquivo
            </div>
            <div style={{
              fontSize: FONT.base, textAlign: 'center',
              maxWidth: 280, lineHeight: 1.6, color: C.muted,
            }}>
              Escolha um arquivo na lista ao lado para visualizar ou editar.
            </div>
            <div style={{
              fontSize: FONT.sm, color: C.muted,
              background: C.surface2, padding: `${SPACE.xs}px ${SPACE.md}px`,
              borderRadius: RADIUS.sm,
            }}>
              Dica: <kbd style={{ fontFamily: 'monospace' }}>Ctrl+S</kbd> salva rapidamente
            </div>
          </div>
        )}

        {/* Loading */}
        {ativoKey && carregando && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', gap: SPACE.sm,
          }}>
            <IcoSpin />
            <div style={{ fontSize: FONT.base, color: C.muted }}>Carregando arquivo...</div>
          </div>
        )}

        {/* Conteúdo */}
        {arquivo && !carregando && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Avisos */}
            {(arquivo.aviso || !arquivo.existe) && (
              <div style={{ padding: `${SPACE.sm}px ${SPACE.lg}px 0`, flexShrink: 0 }}>
                {arquivo.aviso && <AvisoBanner texto={arquivo.aviso} />}
                {!arquivo.existe && (
                  <AvisoBanner texto="Este arquivo não foi encontrado no disco. Ao salvar, ele será criado automaticamente." />
                )}
              </div>
            )}

            {/* Markdown viewer */}
            {ehMd ? (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <MarkdownViewer conteudo={conteudo} />
              </div>
            ) : (
              /* Editor de texto */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.lg}px`, overflow: 'hidden' }}>
                <textarea
                  ref={textareaRef}
                  value={conteudo}
                  onChange={e => setConteudo(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  placeholder={`# Conteúdo de ${arquivo?.label ?? 'arquivo'}`}
                  style={{
                    flex: 1, width: '100%', resize: 'none',
                    fontFamily: '"Cascadia Code","Fira Code","Source Code Pro",Consolas,monospace',
                    fontSize: FONT.base, lineHeight: 1.7,
                    padding: `${SPACE.md}px ${SPACE.lg}px`,
                    borderRadius: RADIUS.md,
                    border: `1px solid ${C.border}`,
                    background: C.bg || C.surface,
                    color: C.text, outline: 'none',
                    transition: 'border-color .15s',
                    minHeight: 200,
                  }}
                  onFocus={e  => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e   => { e.currentTarget.style.borderColor = C.border }}
                />
                <div style={{
                  display: 'flex', gap: SPACE.lg, alignItems: 'center',
                  padding: `${SPACE.xs}px 2px 0`, flexWrap: 'wrap',
                }}>
                  {[
                    fmtLinhas(conteudo),
                    `${conteudo.length} caracteres`,
                    arquivo.tamanho > 0 ? fmtBytes(arquivo.tamanho) + ' no disco' : null,
                  ].filter(Boolean).map((info, i) => (
                    <span key={i} style={{ fontSize: FONT.sm, color: C.muted }}>{info}</span>
                  ))}
                  <span style={{ fontSize: FONT.sm, color: C.muted, marginLeft: 'auto' }}>
                    Tab = 2 espaços · Ctrl+S salva
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ── Estilos do Markdown viewer ────────────────────────────
  const mdCss = `
    .md-viewer {
      font-size: ${FONT.base}px;
      line-height: 1.8;
      color: ${C.text};
    }
    .md-viewer h1, .md-viewer h2, .md-viewer h3,
    .md-viewer h4, .md-viewer h5, .md-viewer h6 {
      color: ${C.text};
      font-weight: 700;
      margin: 1.6em 0 .5em;
      line-height: 1.3;
    }
    .md-viewer h1 { font-size: ${FONT.xl2}px; border-bottom: 1px solid ${C.border}; padding-bottom: .3em; }
    .md-viewer h2 { font-size: ${FONT.xl}px;  border-bottom: 1px solid ${C.border}; padding-bottom: .2em; }
    .md-viewer h3 { font-size: ${FONT.lg}px;  }
    .md-viewer h4 { font-size: ${FONT.md}px;  }
    .md-viewer p  { margin: 0 0 1em; }
    .md-viewer ul, .md-viewer ol { margin: 0 0 1em 1.4em; padding: 0; }
    .md-viewer li { margin-bottom: .3em; }
    .md-viewer code {
      font-family: "Cascadia Code","Fira Code",Consolas,monospace;
      font-size: .88em;
      background: ${C.surface2};
      border: 1px solid ${C.border};
      border-radius: ${RADIUS.xs}px;
      padding: 1px 5px;
      color: ${C.blue};
    }
    .md-viewer pre {
      background: ${C.surface2};
      border: 1px solid ${C.border};
      border-radius: ${RADIUS.md}px;
      padding: ${SPACE.lg}px;
      overflow-x: auto;
      margin: 0 0 1em;
    }
    .md-viewer pre code {
      background: none;
      border: none;
      padding: 0;
      color: ${C.text};
      font-size: ${FONT.sm}px;
      line-height: 1.65;
    }
    .md-viewer blockquote {
      border-left: 3px solid ${C.accent};
      margin: 0 0 1em;
      padding: ${SPACE.xs}px ${SPACE.lg}px;
      color: ${C.muted};
      background: ${C.surface2};
      border-radius: 0 ${RADIUS.sm}px ${RADIUS.sm}px 0;
    }
    .md-viewer hr {
      border: none;
      border-top: 1px solid ${C.border};
      margin: ${SPACE.xl}px 0;
    }
    .md-viewer table {
      width: 100%; border-collapse: collapse; margin: 0 0 1em;
      font-size: ${FONT.sm}px;
    }
    .md-viewer th {
      background: ${C.surface2};
      border: 1px solid ${C.border};
      padding: ${SPACE.xs}px ${SPACE.md}px;
      font-weight: 700; text-align: left;
    }
    .md-viewer td {
      border: 1px solid ${C.border};
      padding: ${SPACE.xs}px ${SPACE.md}px;
    }
    .md-viewer tr:nth-child(even) td { background: ${C.surface2}; }
    .md-viewer a { color: ${C.blue}; text-decoration: underline; text-underline-offset: 2px; }
    .md-viewer a:hover { opacity: .8; }
    .md-viewer strong { font-weight: 700; }
    .md-viewer em     { font-style: italic; }
    /* TOC lateral — visível apenas em desktop largo */
    @media (min-width: 900px) { .md-toc { display: block !important; } }
  `

  // ── Shell ─────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .arq-shell {
          display: flex;
          height: calc(100vh - 52px);
          overflow: hidden;
        }
        .arq-sidebar {
          width: 260px;
          flex-shrink: 0;
          height: 100%;
          overflow: hidden;
        }
        .arq-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .arq-shell   { height: calc(100dvh - 52px); }
          .arq-sidebar { width: 100%; display: ${mobileView === 'lista'   ? 'block' : 'none'}; height: 100%; }
          .arq-main    { display: ${mobileView === 'editor' ? 'flex'  : 'none'}; height: 100%; }
          .adm-only-mobile  { display: flex !important; }
          .adm-only-desktop { display: none  !important; }
        }
        @media (min-width: 641px) {
          .adm-only-mobile  { display: none  !important; }
        }
        ${mdCss}
      `}</style>

      <div className="arq-shell">
        <div className="arq-sidebar">{sidebar}</div>
        <div className="arq-main">{painel}</div>
      </div>
    </>
  )
}
