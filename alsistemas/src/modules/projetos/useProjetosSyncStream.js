/**
 * useProjetosSyncStream.js — Hook: Narração em Tempo Real via SSE
 *
 * Sprint 8 — ADIÇÃO PURA.
 *
 * Consome o endpoint SSE GET /api/projetos/:nome/sync-stream e
 * mantém todo o estado do painel de narração:
 *   • eventos[]     — log completo da narração (narration | step | done)
 *   • etapaAtual    — string com a etapa corrente do pipeline
 *   • progresso     — 0–100 (para a barra de progresso)
 *   • arquivos[]    — lista de arquivos afetados
 *   • status        — 'idle' | 'running' | 'success' | 'error' | 'inconsistent'
 *   • relatorio     — payload do evento 'done' (disponível após conclusão)
 *
 * Uso:
 *   const { iniciarSync, resetar, status, eventos, … } = useProjetosSyncStream(nomeProjeto)
 */
import { useState, useCallback, useRef } from 'react'
import { BASE_URL } from '../../services/domains/http.js'

/**
 * @param {string} nomeProjeto — Nome da pasta local do projeto
 */
export function useProjetosSyncStream(nomeProjeto) {
  /* ── Estado principal ─────────────────────────────────────── */
  const [eventos,     setEventos]     = useState([])   // log de narração
  const [etapaAtual,  setEtapaAtual]  = useState(null)
  const [progresso,   setProgresso]   = useState(0)
  const [arquivos,    setArquivos]    = useState([])
  const [status,      setStatus]      = useState('idle')
  const [relatorio,   setRelatorio]   = useState(null)

  /* ── Referência ao EventSource ativo ─────────────────────── */
  const esRef = useRef(null)

  /* ── Adicionar evento ao log ──────────────────────────────── */
  const addEvento = useCallback((evento) => {
    setEventos(prev => [...prev, { ...evento, id: Date.now() + Math.random() }])
  }, [])

  /* ════════════════════════════════════════════════════════════
     iniciarSync
     Fecha qualquer stream anterior, limpa o estado e abre
     uma nova conexão SSE com o backend.
  ════════════════════════════════════════════════════════════ */
  const iniciarSync = useCallback(() => {
    // Fecha stream anterior se houver
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    // Reinicia estado
    setEventos([])
    setEtapaAtual(null)
    setProgresso(0)
    setArquivos([])
    setRelatorio(null)
    setStatus('running')

    const url = `${BASE_URL}/projetos/${encodeURIComponent(nomeProjeto)}/sync-stream`
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

    /* ── Erro de conexão ───────────────────────────────────── */
    es.onerror = () => {
      // Só reage se ainda estiver em andamento
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
    setArquivos([])
    setRelatorio(null)
    setStatus('idle')
  }, [])

  return {
    /* Estado */
    eventos,
    etapaAtual,
    progresso,
    arquivos,
    status,
    relatorio,

    /* Ações */
    iniciarSync,
    cancelar,
    resetar,
  }
}
