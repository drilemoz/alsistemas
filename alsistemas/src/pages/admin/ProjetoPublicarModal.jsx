/**
 * ProjetoPublicarModal.jsx — Sprint 12
 *
 * Modal de publicação com 3 destinos possíveis:
 *
 *   Servidor (GridFS)    — fluxo original:  ZIP → GridFS → GitHub (opcional)
 *   Cloudflare R2        — novo:            ZIP → R2 bucket (+ link público)
 *   Pasta local          — fluxo original:  ZIP → filesystem do servidor
 *
 * Passos:
 *   1 — Destino + Arquivo
 *   2 — GitHub (só para Servidor/Local) OU Resultado R2
 *   3 — Push SSE (só GitHub)
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { projetosService } from '../../services/domains/projetos.js'
import { githubService }   from '../../services/domains/github.js'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSModal, DSBtn, DSAlert }      from '../../components/admin/ui/DS'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1024)       return `${b} B`
  if (b < 1024 ** 2)  return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 ** 2).toFixed(1)} MB`
}
function nomeSemExt(nome) {
  return nome.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60)
}

// ── Step indicator ────────────────────────────────────────────
function Step({ num, label, ativo, concluido }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flex: 1 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: FONT.xs, fontWeight: 800,
        background: concluido ? `${C.greenSolid}20` : ativo ? `${C.blue}18` : C.surface2,
        border: `2px solid ${concluido ? C.greenSolid : ativo ? C.blue : C.border}`,
        color:  concluido ? C.greenSolid : ativo ? C.blue : C.muted,
        transition: 'all .25s',
      }}>
        {concluido
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
          : num}
      </div>
      <span style={{ fontSize: FONT.xs, fontWeight: ativo || concluido ? 700 : 400,
        color: ativo ? C.text : C.muted, whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

function StepBar({ passo, temGitHub }) {
  const passos = temGitHub
    ? [{ n: 1, l: 'Destino + ZIP' }, { n: 2, l: 'GitHub' }, { n: 3, l: 'Publicando' }]
    : [{ n: 1, l: 'Destino + ZIP' }, { n: 2, l: 'Concluído' }]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0,
      padding: `${SPACE.md}px ${SPACE.lg}px`, borderBottom: `1px solid ${C.border}`,
      background: C.surface2 }}>
      {passos.map(({ n, l }, i) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <Step num={n} label={l} ativo={passo === n} concluido={passo > n} />
          {i < passos.length - 1 && (
            <div style={{ flex: 1, height: 2, background: passo > n ? C.greenSolid : C.border,
              margin: `0 ${SPACE.xs}px`, transition: 'background .3s' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Campo({ label, value, onChange, placeholder, hint }) {
  return (
    <div style={{ marginBottom: SPACE.md }}>
      <label style={{ display: 'block', fontSize: FONT.xs, fontWeight: 700,
        color: C.muted, marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', padding: `${SPACE.sm}px ${SPACE.md}px`,
          borderRadius: RADIUS.md, border: `1.5px solid ${C.border}`,
          background: C.surface, color: C.text, fontSize: FONT.base, outline: 'none' }}
        onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
        onBlur={e  => { e.currentTarget.style.borderColor = C.border }}
      />
      {hint && <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: SPACE.xs }}>{hint}</div>}
    </div>
  )
}

// ── Passo 1 — Destino + arquivo ───────────────────────────────
function Passo1({ onConcluido }) {
  const inputRef              = useRef(null)
  const [destino, setDestino] = useState('gridfs')  // 'gridfs' | 'r2' | 'local'
  const [arquivo, setArquivo] = useState(null)
  const [nome,    setNome]    = useState('')
  const [subst,   setSubst]   = useState(false)
  const [enviando,setEnviando]= useState(false)
  const [progresso,setProg]   = useState(0)
  const [erro,    setErro]    = useState('')

  function onFile(file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) { setErro('Apenas .zip'); return }
    setErro(''); setArquivo(file); setNome(nomeSemExt(file.name))
  }

  async function enviar() {
    if (!arquivo || !nome.trim()) return
    setEnviando(true); setErro(''); setProg(0)

    const endpointMap = { gridfs: '/projetos/upload-gridfs', r2: '/projetos/upload-r2', local: '/projetos/upload' }
    const endpoint    = endpointMap[destino]
    const fd          = new FormData()
    fd.append('zip', arquivo)
    fd.append('nomeProjeto', nome.trim())
    fd.append('substituir', String(subst))

    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${import.meta.env.VITE_API_URL || 'https://alsistemas.onrender.com/api'}${endpoint}`)
        xhr.withCredentials = true
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) setProg(Math.round(e.loaded / e.total * 85))
        })
        xhr.onload = () => {
          setProg(100)
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 400) reject(new Error(data.erro || `Erro ${xhr.status}`))
            else resolve(data)
          } catch { reject(new Error(xhr.responseText?.slice(0, 200) || `Erro ${xhr.status}`)) }
        }
        xhr.onerror   = () => reject(new Error('Falha de conexão'))
        xhr.ontimeout = () => reject(new Error('Timeout — arquivo muito grande?'))
        xhr.timeout   = 180_000 // 3 min
        xhr.send(fd)
      })
      if (destino === 'gridfs' && result.jobId) {
        const base = import.meta.env.VITE_API_URL || 'https://alsistemas.onrender.com/api'
        const inicio = Date.now()
        let finalizado = null
        while (Date.now() - inicio < 15 * 60_000) {
          await new Promise(r => setTimeout(r, 900))
          const resp = await fetch(`${base}/projetos/upload-gridfs/status/${encodeURIComponent(result.jobId)}`, {
            credentials: 'include',
          })
          const job = await resp.json()
          if (!resp.ok) throw new Error(job.erro || `Erro ${resp.status}`)
          const pct = job.total ? Math.round((job.enviados / job.total) * 100) : 0
          setProg(Math.max(86, Math.min(99, 86 + Math.round(pct * .13))))
          if (job.status === 'done') { finalizado = job; break }
          if (job.status === 'error') throw new Error(job.msg || 'Falha ao salvar no GridFS.')
        }
        if (!finalizado) throw new Error('O processamento do GridFS excedeu 15 minutos.')
        setProg(100)
        onConcluido({
          ...result,
          arquivos: finalizado.enviados,
          total: finalizado.total,
          erros: finalizado.erros,
        }, destino)
      } else {
        onConcluido(result, destino)
      }
    } catch (e) {
      setErro(e.message); setEnviando(false); setProg(0)
    }
  }

  const DESTINOS = [
    { id: 'gridfs', icon: '🗄', label: 'GridFS (MongoDB)', sub: 'Persistente, sem limite de espaço do servidor' },
    { id: 'r2',     icon: '☁️', label: 'Cloudflare R2',   sub: 'CDN global, acesso via URL pública' },
    { id: 'local',  icon: '💾', label: 'Servidor (disco)', sub: 'Filesystem do Render — efêmero' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      {/* Seletor de destino */}
      <div>
        <div style={{ fontSize: FONT.xs, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
          letterSpacing: '.05em', marginBottom: SPACE.md }}>Destino do upload</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
          {DESTINOS.map(d => (
            <button key={d.id} onClick={() => setDestino(d.id)} style={{
              display: 'flex', alignItems: 'center', gap: SPACE.md,
              padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
              borderRadius: RADIUS.md, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${destino === d.id ? C.accent : C.border}`,
              background: destino === d.id ? `${C.accent}0e` : C.surface,
              transition: 'all .15s',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{d.icon}</span>
              <div>
                <div style={{ fontSize: FONT.base, fontWeight: destino === d.id ? 700 : 500, color: C.text }}>
                  {d.label}
                </div>
                <div style={{ fontSize: FONT.xs, color: C.muted }}>{d.sub}</div>
              </div>
              {destino === d.id && (
                <svg viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5"
                  width="14" height="14" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => !enviando && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
        style={{
          border: `2px dashed ${arquivo ? C.accent : C.border}`,
          borderRadius: RADIUS.lg, padding: `${SPACE.xl2}px ${SPACE.xl}px`,
          textAlign: 'center', cursor: enviando ? 'not-allowed' : 'pointer',
          background: arquivo ? `${C.accent}08` : C.surface2, transition: 'all .2s',
        }}>
        <input ref={inputRef} type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => onFile(e.target.files[0])} />
        {arquivo ? (
          <>
            <div style={{ fontSize: 26, marginBottom: SPACE.sm }}>📦</div>
            <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.md, marginBottom: 2 }}>{arquivo.name}</div>
            <div style={{ fontSize: FONT.sm, color: C.muted }}>{fmtBytes(arquivo.size)}</div>
            {!enviando && <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: SPACE.sm }}>Clique para trocar</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: SPACE.md }}>⬆</div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Arraste o ZIP ou clique</div>
            <div style={{ fontSize: FONT.sm, color: C.muted }}>Máximo 200 MB</div>
          </>
        )}
      </div>

      {arquivo && (
        <>
          <Campo label="Nome do projeto" value={nome}
            onChange={v => setNome(v.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60))}
            placeholder="meu-projeto"
            hint={destino === 'r2'
              ? `Prefix no R2: ${nome || 'meu-projeto'}/`
              : destino === 'gridfs'
                ? `GridFS: projetos/${nome || 'meu-projeto'}/`
                : `Pasta: projetos/${nome || 'meu-projeto'}/`} />

          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, cursor: 'pointer' }}>
            <input type="checkbox" checked={subst} onChange={e => setSubst(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: C.accent }} />
            <div>
              <div style={{ fontSize: FONT.base, fontWeight: 600, color: C.text }}>Substituir se já existir</div>
              <div style={{ fontSize: FONT.xs, color: C.muted }}>Remove a versão anterior antes de enviar</div>
            </div>
          </label>
        </>
      )}

      {/* Barra de progresso */}
      {enviando && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontSize: FONT.xs, color: C.muted, marginBottom: SPACE.xs }}>
            <span>{progresso < 85 ? `Enviando para ${DESTINOS.find(d=>d.id===destino)?.label}…` : 'Processando…'}</span>
            <span>{progresso}%</span>
          </div>
          <div style={{ height: 6, background: C.surface2, borderRadius: RADIUS.xs, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: RADIUS.xs, width: `${progresso}%`,
              background: destino === 'r2'
                ? 'linear-gradient(90deg, #f6821f, #f6821f88)'
                : `linear-gradient(90deg, ${C.blue}, ${C.accent})`,
              transition: 'width .3s ease' }} />
          </div>
        </div>
      )}

      {erro && <DSAlert variant="red">{erro}</DSAlert>}

      <DSBtn variant="primary" onClick={enviar}
        disabled={!arquivo || !nome.trim() || enviando}
        loading={enviando} style={{ alignSelf: 'flex-end' }}>
        {enviando ? 'Enviando…' : `⬆ Enviar para ${DESTINOS.find(d=>d.id===destino)?.label}`}
      </DSBtn>
    </div>
  )
}

// ── Passo 2 R2 — Resultado do upload ─────────────────────────
function Passo2R2({ resultado, onFechar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <DSAlert variant="green">
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ☁️ {resultado.arquivos} arquivos enviados ao Cloudflare R2
          </div>
          <div style={{ fontSize: FONT.sm }}>
            Bucket: <code style={{ fontFamily: 'monospace', fontSize: FONT.xs }}>{resultado.bucket}</code>
            {' '}· Projeto: <code style={{ fontFamily: 'monospace', fontSize: FONT.xs }}>{resultado.nomeProjeto}/</code>
          </div>
        </div>
      </DSAlert>

      {resultado.publicUrl && (
        <div style={{ background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: RADIUS.md, padding: SPACE.lg }}>
          <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: SPACE.sm, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.05em' }}>URL pública</div>
          <a href={resultado.publicUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: FONT.sm, color: C.blue, wordBreak: 'break-all', textDecoration: 'none' }}>
            {resultado.publicUrl}
          </a>
        </div>
      )}

      {resultado.erros?.length > 0 && (
        <DSAlert variant="amber">
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              ⚠ {resultado.erros.length} arquivo(s) falharam
            </div>
            <div style={{ fontSize: FONT.xs, fontFamily: 'monospace' }}>
              {resultado.erros.slice(0, 5).join('\n')}
            </div>
          </div>
        </DSAlert>
      )}

      <div style={{ background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: RADIUS.md, padding: SPACE.lg, fontSize: FONT.sm, color: C.muted }}>
        <strong style={{ color: C.text }}>Próximos passos R2:</strong>
        <ul style={{ margin: `${SPACE.sm}px 0 0 ${SPACE.lg}px`, lineHeight: 1.8 }}>
          <li>Configure um domínio personalizado no bucket R2</li>
          <li>Adicione <code style={{ fontFamily: 'monospace' }}>CF_R2_PUBLIC_URL</code> para mostrar a URL aqui</li>
          <li>Use Workers para servir o projeto como site estático</li>
        </ul>
      </div>

      <DSBtn variant="primary" onClick={onFechar} style={{ alignSelf: 'flex-end' }}>
        Fechar
      </DSBtn>
    </div>
  )
}

// ── Passo 2 GitHub — Vincular ─────────────────────────────────
function Passo2GitHub({ nomeProjeto, onPular, onVincularEPushar }) {
  const [modo,      setModo]      = useState('existente')
  const [owner,     setOwner]     = useState('')
  const [repo,      setRepo]      = useState('')
  const [nomeNovo,  setNomeNovo]  = useState(nomeProjeto)
  const [descricao, setDescricao] = useState('')
  const [privado,   setPrivado]   = useState(true)
  const [msgCommit, setMsgCommit] = useState('feat: initial commit')
  const [carregando,setCarregando]= useState(false)
  const [erro,      setErro]      = useState('')

  async function confirmar() {
    setCarregando(true); setErro('')
    try {
      let finalOwner, finalRepo
      if (modo === 'novo') {
        if (!nomeNovo.trim()) { setErro('Informe o nome do repositório.'); setCarregando(false); return }
        const criado = await githubService.criarRepo(nomeNovo.trim(), descricao.trim(), privado)
        finalOwner = criado.owner; finalRepo = criado.repo
        toast.success(`Repositório ${criado.nomeCompleto} criado!`)
      } else {
        if (!owner.trim() || !repo.trim()) { setErro('Preencha owner e repositório.'); setCarregando(false); return }
        finalOwner = owner.trim(); finalRepo = repo.trim()
      }
      await projetosService.vincular(nomeProjeto, finalOwner, finalRepo)
      onVincularEPushar(finalOwner, finalRepo, msgCommit.trim() || 'feat: initial commit')
    } catch (e) {
      setErro(e.message || 'Erro ao configurar GitHub')
      setCarregando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <DSAlert variant="green">
        Projeto <strong>{nomeProjeto}</strong> enviado com sucesso.
      </DSAlert>

      <div style={{ display: 'flex', gap: SPACE.sm }}>
        {[
          { id: 'existente', label: '🔗 Repositório existente' },
          { id: 'novo',      label: '✨ Criar repositório'     },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setModo(id)} style={{
            flex: 1, padding: `${SPACE.sm}px ${SPACE.md}px`,
            borderRadius: RADIUS.md, cursor: 'pointer',
            border: `1.5px solid ${modo === id ? C.accent : C.border}`,
            background: modo === id ? `${C.accent}12` : C.surface,
            color: modo === id ? C.text : C.muted,
            fontSize: FONT.sm, fontWeight: modo === id ? 700 : 400, transition: 'all .15s',
          }}>{label}</button>
        ))}
      </div>

      {modo === 'existente' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${SPACE.md}px` }}>
          <Campo label="Owner" value={owner} onChange={setOwner} placeholder="usuario" />
          <Campo label="Repositório" value={repo} onChange={setRepo} placeholder="meu-repo" />
        </div>
      )}

      {modo === 'novo' && (
        <>
          <Campo label="Nome do repositório" value={nomeNovo} onChange={setNomeNovo} placeholder={nomeProjeto} />
          <Campo label="Descrição (opcional)" value={descricao} onChange={setDescricao} placeholder="Descrição breve" />
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, cursor: 'pointer' }}>
            <input type="checkbox" checked={privado} onChange={e => setPrivado(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: C.accent }} />
            <span style={{ fontSize: FONT.base, fontWeight: 600, color: C.text }}>Privado</span>
          </label>
        </>
      )}

      <Campo label="Mensagem do primeiro commit" value={msgCommit}
        onChange={setMsgCommit} placeholder="feat: initial commit" />

      {erro && <DSAlert variant="red">{erro}</DSAlert>}

      <div style={{ display: 'flex', gap: SPACE.sm, justifyContent: 'flex-end' }}>
        <DSBtn variant="ghost" onClick={onPular} disabled={carregando}>
          Pular — sem GitHub
        </DSBtn>
        <DSBtn variant="primary" onClick={confirmar} loading={carregando}>
          Vincular e fazer push →
        </DSBtn>
      </div>
    </div>
  )
}

// ── Passo 3 — SSE push ────────────────────────────────────────
function Passo3Push({ nomeProjeto, owner, repo, msgCommit, onConcluido }) {
  const [linhas,    setLinhas]    = useState([])
  const [progresso, setProg]      = useState(0)
  const [status,    setStatus]    = useState(null)
  const [msgFinal,  setMsgFinal]  = useState('')
  const [etapa,      setEtapa]     = useState('preparando')
  const [arquivos,   setArquivos]  = useState([])
  const logRef                    = useRef(null)

  const iniciar = useCallback(() => {
    const q   = new URLSearchParams({ message: msgCommit, autor: '' })
    const base = import.meta.env.VITE_API_URL || 'https://alsistemas.onrender.com/api'
    const url  = `${base}/projetos/${encodeURIComponent(nomeProjeto)}/commit-stream?${q}`
    const es   = new EventSource(url, { withCredentials: true })

    es.onmessage = e => {
      try {
        const ev = JSON.parse(e.data)
        if (ev.type === 'narration') {
          setLinhas(prev => [...prev, { msg: ev.msg, nivel: ev.nivel, ts: ev.ts || new Date().toISOString() }].slice(-500))
          requestAnimationFrame(() => logRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' }))
        }
        if (ev.type === 'step')  { setProg(ev.progresso || 0); setEtapa(ev.etapa || 'processando') }
        if (ev.type === 'files') setArquivos(ev.arquivos || [])
        if (ev.type === 'done')  { setStatus(ev.status); setMsgFinal(ev.msg); es.close(); if (ev.status === 'success') onConcluido() }
      } catch {}
    }
    es.onerror = () => { setStatus('error'); setMsgFinal('Conexão perdida.'); es.close() }
    return () => es.close()
  }, [nomeProjeto, msgCommit, onConcluido])

  useEffect(() => iniciar(), [iniciar])

  const COR = { info: C.muted, success: C.greenSolid, sucesso: C.greenSolid, error: C.red, erro: C.red, warn: C.amber, aviso: C.amber }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:FONT.xs, color:C.muted }}>
        <span>Etapa: {etapa.replaceAll('_', ' ')}</span><b>{progresso}%</b>
      </div>
      <div style={{ height: 5, background: C.surface2, borderRadius: RADIUS.xs, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: RADIUS.xs, width: `${progresso}%`,
          background: status === 'error' ? C.red : status === 'success' ? C.greenSolid
            : `linear-gradient(90deg, ${C.blue}, ${C.accent})`,
          transition: 'width .5s ease, background .3s' }} />
      </div>

      <div ref={logRef} style={{ background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: RADIUS.md, padding: SPACE.md, maxHeight: 200, overflowY: 'auto',
        fontFamily: 'monospace', fontSize: FONT.xs, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {linhas.length === 0 && <span style={{ color: C.muted }}>Iniciando…</span>}
        {linhas.map((l, i) => (
          <span key={i} style={{ color: COR[l.nivel] || C.text, lineHeight: 1.5 }}>
            <span style={{ opacity: .55, marginRight: 6 }}>{l.ts ? new Date(l.ts).toLocaleTimeString('pt-BR') : ''}</span>{l.msg}
          </span>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:SPACE.sm}}>
        <span style={{ fontSize:FONT.xs, color:C.muted }}>{arquivos.length > 0 ? `${arquivos.length} arquivo(s) processado(s)` : `${linhas.length} evento(s) no log`}</span>
        <DSBtn variant="ghost" onClick={() => navigator.clipboard?.writeText(linhas.map(l => `[${l.ts ? new Date(l.ts).toLocaleTimeString('pt-BR') : ''}] ${l.msg}`).join('\n'))}>
          Copiar log
        </DSBtn>
      </div>

      {status === 'success' && (
        <DSAlert variant="green">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>Publicado no GitHub!</span>
            <a href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noopener noreferrer"
              style={{ color: C.blue, fontWeight: 700, textDecoration: 'none', fontSize: FONT.sm }}>
              Abrir {owner}/{repo} ↗
            </a>
          </div>
        </DSAlert>
      )}
      {status === 'error' && <DSAlert variant="red">{msgFinal || 'Falha no push.'}</DSAlert>}
    </div>
  )
}

// ── Modal principal ───────────────────────────────────────────
export default function ProjetoPublicarModal({ onClose, onConcluido }) {
  const [passo,       setPasso]       = useState(1)
  const [destino,     setDestino]     = useState(null)   // 'gridfs' | 'r2' | 'local'
  const [resultado,   setResultado]   = useState(null)
  const [nomeProjeto, setNomeProjeto] = useState('')
  const [pushInfo,    setPushInfo]    = useState(null)
  const [pushDone,    setPushDone]    = useState(false)

  function onUploadOk(data, dest) {
    setDestino(dest); setResultado(data); setNomeProjeto(data.nomeProjeto)
    toast.success(`${data.arquivos} arquivos extraídos: "${data.nomeProjeto}"`)
    if (dest === 'r2') { setPasso(2) } // pula GitHub para R2
    else               { setPasso(2) } // vai para GitHub
  }

  function onPular() { onConcluido?.(); onClose() }

  function onVincularEPushar(owner, repo, msgCommit) {
    setPushInfo({ owner, repo, msgCommit }); setPasso(3)
  }

  const ehR2        = destino === 'r2'
  const titulo      = ['', 'Publicar Projeto', ehR2 ? 'Resultado R2' : 'Vincular GitHub', 'Publicando…'][passo] || ''
  const podeFechar  = passo !== 3 || pushDone

  return (
    <DSModal
      open
      onClose={() => { if (!podeFechar) return; onClose() }}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            width="15" height="15">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
          </svg>
          {titulo}
        </span>
      }
      size="md"
      headerExtra={<StepBar passo={passo} temGitHub={!ehR2} />}
      footer={passo === 3 && pushDone ? <DSBtn variant="primary" onClick={onClose}>Fechar</DSBtn> : null}
    >
      {passo === 1 && <Passo1 onConcluido={onUploadOk} />}

      {passo === 2 && ehR2 && (
        <Passo2R2 resultado={resultado} onFechar={() => { onConcluido?.(); onClose() }} />
      )}

      {passo === 2 && !ehR2 && (
        <Passo2GitHub
          nomeProjeto={nomeProjeto}
          onPular={onPular}
          onVincularEPushar={onVincularEPushar}
        />
      )}

      {passo === 3 && pushInfo && (
        <Passo3Push
          nomeProjeto={nomeProjeto}
          owner={pushInfo.owner}
          repo={pushInfo.repo}
          msgCommit={pushInfo.msgCommit}
          onConcluido={() => { setPushDone(true); onConcluido?.() }}
        />
      )}
    </DSModal>
  )
}
