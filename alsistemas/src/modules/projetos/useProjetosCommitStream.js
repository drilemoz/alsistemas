/**
 * useProjetosCommitStream.js — Hook: Commit & Push via SSE
 *
 * Sprint 9 — ADIÇÃO PURA.
 *
 * Consome o endpoint SSE GET /api/projetos/:nome/commit-stream
 * e mantém todo o estado do painel de narração de commit:
 *   • eventos[]    — log completo (narration | step | done)
 *   • etapaAtual   — string com a etapa corrente do pipeline
 *   • progresso    — 0–100 (para a barra de progresso)
 *   • arquivos[]   — lista de arquivos enviados ao GitHub
 *   • status       — 'idle' | 'running' | 'success' | 'error'
 *   • relatorio    — payload do evento 'done' (após conclusão)
 *
 * Uso:
 *   const { iniciarCommit, resetar, status, eventos, … } =
 *     useProjetosCommitStream(nomeProjeto)
 *
 *   iniciarCommit({ message: 'feat: ...', branch: 'main', autor: 'Nome <email>' })
 */
import { useState, useCallback, useRef } from 'react'
import { BASE_URL } from '../../services/domains/http.js'

/**
 * @param {string} nomeProjeto — Nome da pasta local do projeto
 */
export function useProjetosCommitStream(nomeProjeto) {
  /* ── Estado principal ─────────────────────────────────────── */
  const [eventos,    setEventos]    = useState([])
  const [etapaAtual, setEtapaAtual] = useState(null)
  const [progresso,  setProgresso]  = useState(0)
  const [stepData,   setStepData]   = useState(null)  // { idx, total, etapa } — counters ao vivo
  const [arquivos,   setArquivos]   = useState([])
  const [status,     setStatus]     = useState('idle')
  const [relatorio,  setRelatorio]  = useState(null)

  /* ── Referência ao EventSource ativo ─────────────────────── */
  const esRef = useRef(null)

  /* ── Adicionar evento ao log ──────────────────────────────── */
  const addEvento = useCallback((evento) => {
    setEventos(prev => [...prev, { ...evento, id: Date.now() + Math.random() }])
  }, [])

  /* ════════════════════════════════════════════════════════════
     iniciarCommit
     Fecha qualquer stream anterior, monta a URL com os
     parâmetros do commit e abre uma nova conexão SSE.
  ════════════════════════════════════════════════════════════ */
  const iniciarCommit = useCallback(({ message, branch, autor, destPath, fonte } = {}) => {
    // Fecha stream anterior se houver
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    // Reinicia estado
    setEventos([])
    setEtapaAtual(null)
    setProgresso(0)
    setStepData(null)
    setArquivos([])
    setRelatorio(null)
    setStatus('running')

    // Monta query string
    const params = new URLSearchParams()
    if (message)  params.set('message',  message)
    if (branch)   params.set('branch',   branch)
    if (autor)    params.set('autor',    autor)
    if (destPath) params.set('destPath', destPath)
    if (fonte)    params.set('fonte',    fonte)

    const url = `${BASE_URL}/projetos/${encodeURIComponent(nomeProjeto)}/commit-stream?${params.toString()}`
    const es  = new EventSource(url, { withCredentials: true })
    esRef.current = es

    /* ── Handler de mensagens SSE ───────────────────────────── */
    es.onmessage = (e) => {
      let data
      try { data = JSON.parse(e.data) } catch { return }

      switch (data.type) {
        case 'ping':
          // keep-alive — sem ação visual
          break

        case 'narration':
          addEvento({
            tipo:  'narration',
            msg:   data.msg,
            nivel: data.nivel || 'info',
            ts:    data.ts,
          })
          break

        case 'step':
          setEtapaAtual(data.etapa)
          setProgresso(data.progresso ?? 0)
          if (data.idx !== undefined) setStepData({ idx: data.idx, total: data.total, etapa: data.etapa })
          addEvento({
            tipo:      'step',
            etapa:     data.etapa,
            progresso: data.progresso,
            ts:        data.ts,
          })
          break

        case 'files':
          setArquivos(data.arquivos || [])
          break

        case 'done':
          setStatus(data.status)
          setRelatorio(data)
          addEvento({
            tipo:   'done',
            status: data.status,
            msg:    data.msg,
            ts:     data.ts,
          })
          es.close()
          esRef.current = null
          break

        default:
          break
      }
    }

    /* ── Erro de conexão ────────────────────────────────────── */
    es.onerror = () => {
      setStatus(prev => {
        if (prev === 'running') {
          addEvento({
            tipo:  'narration',
            msg:   'Conexão com o servidor foi interrompida.',
            nivel: 'error',
            ts:    new Date().toISOString(),
          })
          return 'error'
        }
        return prev
      })
      es.close()
      esRef.current = null
    }
  }, [nomeProjeto, addEvento])

  /* ── cancelar: fecha stream e marca idle ──────────────────── */
  const cancelar = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setStatus('idle')
  }, [])

  /* ── resetar: volta ao estado inicial completo ─────────────── */
  const resetar = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setEventos([])
    setEtapaAtual(null)
    setProgresso(0)
    setStepData(null)
    setArquivos([])
    setRelatorio(null)
    setStatus('idle')
  }, [])

  return {
    /* Estado */
    eventos,
    etapaAtual,
    progresso,
    stepData,
    arquivos,
    status,
    relatorio,

    /* Ações */
    iniciarCommit,
    cancelar,
    resetar,
  }
}
