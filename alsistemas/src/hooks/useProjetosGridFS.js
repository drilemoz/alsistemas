/**
 * useProjetosGridFS.js — Hook para projetos armazenados no GridFS
 *
 * Sprint 11 — ADIÇÃO PURA.
 *
 * Estados:
 *   projetos      — lista de projetos no GridFS
 *   loading       — carregando lista
 *   erro          — mensagem de erro
 *
 * Funções:
 *   carregar()    — recarrega lista
 *   total         — contagem
 */
import { useState, useEffect, useCallback } from 'react'
import { projetosService } from '../services/domains/projetos'

export function useProjetosGridFS() {
  const [projetos, setProjetos] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [erro,     setErro]     = useState(null)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setErro(null)
    try {
      const dados = await projetosService.listarGridFS()
      setProjetos(dados.projetos || [])
    } catch (err) {
      setErro(err.message || 'Erro ao carregar projetos do GridFS')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return {
    projetos,
    total: projetos.length,
    loading,
    erro,
    carregar,
  }
}
