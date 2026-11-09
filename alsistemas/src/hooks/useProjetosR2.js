/**
 * useProjetosR2.js — Hook para projetos armazenados no Cloudflare R2
 *
 * Sprint 12 — ADIÇÃO PURA.
 *
 * Estados:
 *   projetos      — lista de projetos no bucket R2 (agrupados por prefix)
 *   bucket        — nome do bucket configurado no backend
 *   loading       — carregando lista
 *   erro          — mensagem de erro
 *   aviso         — aviso quando credenciais não configuradas
 *
 * Funções:
 *   carregar()    — recarrega lista
 *   total         — contagem
 */
import { useState, useEffect, useCallback } from 'react'
import { projetosService } from '../services/domains/projetos'

export function useProjetosR2() {
  const [projetos, setProjetos] = useState([])
  const [bucket,   setBucket]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [erro,     setErro]     = useState(null)
  const [aviso,    setAviso]    = useState(null)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setErro(null)
    setAviso(null)
    try {
      const dados = await projetosService.listarR2()
      setProjetos(dados.projetos || [])
      setBucket(dados.bucket   || null)
      setAviso(dados.aviso     || null)
    } catch (err) {
      setErro(err.message || 'Erro ao carregar projetos do R2')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return {
    projetos,
    total: projetos.length,
    bucket,
    loading,
    erro,
    aviso,
    carregar,
  }
}
