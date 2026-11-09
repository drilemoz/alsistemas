/**
 * useProjetos.js — Hook: Projetos Locais
 *
 * Sprint 3 — ADIÇÃO PURA.
 * Gerencia carregamento, erro, filtro por status e dados dos projetos locais.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { projetosService } from './projetosService.js'

export function useProjetos() {
  const [projetos,   setProjetos]  = useState([])
  const [total,      setTotal]     = useState(0)
  const [diretorio,  setDiretorio] = useState('')
  const [loading,    setLoading]   = useState(true)
  const [erro,       setErro]      = useState(null)
  const [filtroStatus, setFiltroStatus] = useState('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await projetosService.listar()
      setProjetos(data.projetos || [])
      setTotal(data.total || 0)
      setDiretorio(data.diretorio || '')
    } catch (e) {
      setErro(e.message || 'Erro ao carregar projetos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Filtragem local — sem nova chamada ao backend
  const projetosFiltrados = useMemo(() => {
    if (filtroStatus === 'todos') return projetos
    return projetos.filter(p => p.status === filtroStatus)
  }, [projetos, filtroStatus])

  // Contagem por status para os chips de filtro
  const contagens = useMemo(() => {
    const map = { todos: projetos.length, ativo: 0, pausado: 0, arquivado: 0, desconhecido: 0 }
    for (const p of projetos) map[p.status] = (map[p.status] || 0) + 1
    return map
  }, [projetos])

  return {
    projetos: projetosFiltrados,
    total,
    diretorio,
    loading,
    erro,
    recarregar:      carregar,
    filtroStatus,
    setFiltroStatus,
    contagens,
  }
}
