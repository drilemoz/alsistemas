/**
 * useGitHubRepos.js — Hook: GitHub Module
 *
 * Sprint 3 — ADIÇÃO PURA.
 * Gerencia estado de carregamento, erro e dados dos repositórios GitHub.
 * Carrega também o status da conta para exibir no topo do módulo.
 */
import { useState, useEffect, useCallback } from 'react'
import { githubService } from '../../services/domains/github.js'

export function useGitHubRepos({ page = 1, per_page = 30, sort = 'updated' } = {}) {
  const [repos,   setRepos]   = useState([])
  const [status,  setStatus]  = useState(null)   // info da conta GitHub
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      // Carrega status da conta e repos em paralelo
      const [statusData, reposData] = await Promise.allSettled([
        githubService.status(),
        githubService.repos({ page, per_page, sort }),
      ])

      if (statusData.status === 'fulfilled') {
        setStatus(statusData.value)
      }

      if (reposData.status === 'fulfilled') {
        setRepos(reposData.value.repos || [])
        setTotal(reposData.value.total || 0)
      } else {
        throw reposData.reason
      }
    } catch (e) {
      setErro(e.message || 'Erro ao carregar repositórios')
    } finally {
      setLoading(false)
    }
  }, [page, per_page, sort])

  useEffect(() => { carregar() }, [carregar])

  return { repos, status, total, loading, erro, recarregar: carregar }
}
