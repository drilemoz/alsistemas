/**
 * useAnalysis.js — Hook: Análise Inteligente (Sprint 4)
 *
 * Sprint 4 — ADIÇÃO PURA.
 * Gerencia carregamento do overview de análise e do chat com IA.
 */
import { useState, useEffect, useCallback } from 'react'
import { analysisService } from '../../services/domains/analysis.js'

export function useAnalysisOverview() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await analysisService.overview()
      setData(res)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar análise')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return { data, loading, erro, recarregar: carregar }
}

export function useSync(projectName) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState(null)

  const executar = useCallback(async () => {
    if (!projectName) return
    setLoading(true)
    setErro(null)
    try {
      const res = await analysisService.sync(projectName)
      setData(res)
    } catch (e) {
      setErro(e.message || 'Erro ao sincronizar')
    } finally {
      setLoading(false)
    }
  }, [projectName])

  return { data, loading, erro, executar }
}

export function useAIChat() {
  const [mensagens, setMensagens] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState(null)

  const enviar = useCallback(async (pergunta, contexto = {}) => {
    if (!pergunta?.trim()) return

    // Adiciona mensagem do usuário imediatamente
    const novaMensagem = { role: 'user', conteudo: pergunta, timestamp: new Date().toISOString() }
    setMensagens(prev => [...prev, novaMensagem])
    setLoading(true)
    setErro(null)

    try {
      const res = await analysisService.chat(pergunta, contexto)
      const respostaIA = {
        role:      'assistant',
        conteudo:  res.resposta,
        modelo:    res.modelo,
        tokens:    res.tokens,
        aviso:     res.aviso,
        timestamp: new Date().toISOString(),
      }
      setMensagens(prev => [...prev, respostaIA])
    } catch (e) {
      setErro(e.message || 'Erro ao consultar IA')
      setMensagens(prev => [...prev, {
        role:      'error',
        conteudo:  e.message || 'Erro ao consultar IA',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }, [])

  const limpar = useCallback(() => {
    setMensagens([])
    setErro(null)
  }, [])

  return { mensagens, loading, erro, enviar, limpar }
}
