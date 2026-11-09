/**
 * useProjetosSync.js — Hook: GitHub Sync por Projeto
 *
 * Sprint 7 — ADIÇÃO PURA.
 *
 * Gerencia, por projeto, o ciclo completo de sincronização com GitHub:
 *   1. Carrega o status de sync (vinculado? atualizado?)
 *   2. Vincula/desvincula o projeto a um repositório GitHub
 *   3. Executa a sincronização (pull via salvar-projeto)
 *   4. Registra o timestamp de última sincronização
 *
 * A sincronização (pull) reutiliza a rota existente de Sprint 5:
 *   POST /api/github/repos/:owner/:repo/salvar-projeto
 * com substituir: true, evitando duplicação de lógica no backend.
 */
import { useState, useCallback } from 'react'
import { projetosService }       from './projetosService.js'
import { githubService }         from '../../services/domains/github.js'

/**
 * @param {string} nomeProjeto — Nome da pasta local do projeto
 */
export function useProjetosSync(nomeProjeto) {
  // ── Status de sincronização ────────────────────────────────
  const [syncStatus,   setSyncStatus]   = useState(null)   // objeto da API ou null
  const [loadingSync,  setLoadingSync]  = useState(false)
  const [erroSync,     setErroSync]     = useState(null)

  // ── Operação de vincular ───────────────────────────────────
  const [loadingLink,  setLoadingLink]  = useState(false)
  const [erroLink,     setErroLink]     = useState(null)

  // ── Operação de pull (sincronizar) ─────────────────────────
  const [loadingPull,  setLoadingPull]  = useState(false)
  const [erroPull,     setErroPull]     = useState(null)
  const [pullOk,       setPullOk]       = useState(false)

  /* ────────────────────────────────────────────────────────────
     carregarStatus
     Consulta /api/projetos/:nome/sync-status e atualiza o estado.
  ──────────────────────────────────────────────────────────── */
  const carregarStatus = useCallback(async () => {
    if (!nomeProjeto) return
    setLoadingSync(true)
    setErroSync(null)
    try {
      const data = await projetosService.syncStatus(nomeProjeto)
      setSyncStatus(data)
    } catch (e) {
      setErroSync(e.message || 'Erro ao carregar status de sync')
    } finally {
      setLoadingSync(false)
    }
  }, [nomeProjeto])

  /* ────────────────────────────────────────────────────────────
     vincular
     Salva o vínculo projeto → repositório GitHub.
     Após sucesso, recarrega o status.
  ──────────────────────────────────────────────────────────── */
  const vincular = useCallback(async (owner, repo) => {
    setLoadingLink(true)
    setErroLink(null)
    try {
      await projetosService.vincular(nomeProjeto, owner, repo)
      await carregarStatus()
      return true
    } catch (e) {
      setErroLink(e.message || 'Erro ao vincular repositório')
      return false
    } finally {
      setLoadingLink(false)
    }
  }, [nomeProjeto, carregarStatus])

  /* ────────────────────────────────────────────────────────────
     desvincular
     Remove o vínculo GitHub do projeto.
  ──────────────────────────────────────────────────────────── */
  const desvincular = useCallback(async () => {
    setLoadingLink(true)
    setErroLink(null)
    try {
      await projetosService.desvincular(nomeProjeto)
      setSyncStatus({ vinculado: false })
      return true
    } catch (e) {
      setErroLink(e.message || 'Erro ao desvincular repositório')
      return false
    } finally {
      setLoadingLink(false)
    }
  }, [nomeProjeto])

  /* ────────────────────────────────────────────────────────────
     sincronizar (pull from GitHub)
     Reutiliza a rota POST /api/github/repos/:owner/:repo/salvar-projeto
     com substituir: true para sobrescrever o projeto local.
     Após sucesso, registra o timestamp e recarrega o status.
  ──────────────────────────────────────────────────────────── */
  const sincronizar = useCallback(async () => {
    if (!syncStatus?.vinculado) return false

    const { owner, repo } = syncStatus
    setLoadingPull(true)
    setErroPull(null)
    setPullOk(false)

    try {
      // Pull: baixa o zipball do GitHub e extrai sobre a pasta existente
      await githubService.salvarProjeto(owner, repo, nomeProjeto, true)

      // Registra timestamp de sincronização no MongoDB
      await projetosService.registrarSincronizacao(nomeProjeto)

      // Atualiza status (mtime local agora é recente)
      await carregarStatus()

      setPullOk(true)
      setTimeout(() => setPullOk(false), 4000)
      return true
    } catch (e) {
      setErroPull(e.message || 'Erro ao sincronizar projeto')
      return false
    } finally {
      setLoadingPull(false)
    }
  }, [syncStatus, nomeProjeto, carregarStatus])

  return {
    // Status
    syncStatus,
    loadingSync,
    erroSync,
    carregarStatus,

    // Vincular/Desvincular
    vincular,
    desvincular,
    loadingLink,
    erroLink,

    // Sincronizar (pull)
    sincronizar,
    loadingPull,
    erroPull,
    pullOk,
  }
}
