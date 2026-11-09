/**
 * github.js — Serviço de domínio: GitHub Module (Sprint 4)
 *
 * Sprint 3 EXTENSÃO — ADIÇÃO PURA (originais preservados).
 * Sprint 4 — Secrets + Workflows + Runs + Logs + Download APK
 *
 * Todas as chamadas passam pelo proxy backend. Token NUNCA exposto no frontend.
 */
import { api, BASE_URL } from './http.js'

export const githubService = {
  /* ── Originais (preservados) ─────────────────────────── */
  status: () => api('/github/status'),
  repos: ({ page = 1, per_page = 30, sort = 'updated', type = 'all' } = {}) =>
    api(`/github/repos?page=${page}&per_page=${per_page}&sort=${sort}&type=${type}`),
  repo: (owner, repo) => api(`/github/repos/${owner}/${repo}`),

  /* ── Sprint 3 ─────────────────────────────────────────── */
  readme:    (owner, repo) => api(`/github/repos/${owner}/${repo}/readme`),
  commits:   (owner, repo, page = 1) => api(`/github/repos/${owner}/${repo}/commits?per_page=20&page=${page}`),
  releases:  (owner, repo) => api(`/github/repos/${owner}/${repo}/releases`),
  artifacts: (owner, repo) => api(`/github/repos/${owner}/${repo}/artifacts`),
  analysis:  (owner, repo) => api(`/github/repos/${owner}/${repo}/analysis`),

  criarRelease: (owner, repo, dados) =>
    api(`/github/repos/${owner}/${repo}/releases`, { method: 'POST', body: JSON.stringify(dados) }),

  excluirRepo: (owner, repo, confirmarNome) =>
    api(`/github/repos/${owner}/${repo}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmar: true, confirmarNome }),
    }),

  getMeta:    (repoId) => api(`/github/meta/${repoId}`),
  salvarMeta: (repoId, dados) =>
    api(`/github/meta/${repoId}`, { method: 'PUT', body: JSON.stringify(dados) }),

  projetosLocais: () => api('/github/projetos-locais'),

  /* ── Sprint 4: Secrets ───────────────────────────────── */
  secrets:     (owner, repo) => api(`/github/repos/${owner}/${repo}/secrets`),
  criarSecret: (owner, repo, nome, valor) =>
    api(`/github/repos/${owner}/${repo}/secrets/${nome}`, {
      method: 'PUT',
      body: JSON.stringify({ valor }),
    }),
  excluirSecret: (owner, repo, nome) =>
    api(`/github/repos/${owner}/${repo}/secrets/${nome}`, { method: 'DELETE' }),

  /* ── Sprint 4: Workflows & Runs ──────────────────────── */
  workflows: (owner, repo) => api(`/github/repos/${owner}/${repo}/workflows`),
  runs: (owner, repo, workflowId, page = 1) =>
    api(`/github/repos/${owner}/${repo}/workflows/${workflowId}/runs?per_page=15&page=${page}`),
  jobs: (runId, owner, repo) =>
    api(`/github/runs/${runId}/jobs?owner=${owner}&repo=${repo}`),

  /* ── Sprint 4: Logs inline de um job ────────────────── */
  jobLogs: async (jobId, owner, repo) => {
    const resp = await fetch(`${BASE_URL}/github/jobs/${jobId}/logs?owner=${owner}&repo=${repo}`, {
      credentials: 'include',
    })
    if (!resp.ok) throw new Error(`Erro ${resp.status}`)
    return resp.text()
  },

  /* ── Sprint 4: Download via proxy (URLs autenticadas via backend) */
  downloadLogsUrl: (runId, owner, repo) =>
    `${BASE_URL}/github/runs/${runId}/logs/download?owner=${owner}&repo=${repo}`,

  downloadArtifactUrl: (artifactId, owner, repo, nome = '') =>
    `${BASE_URL}/github/artifacts/${artifactId}/download?owner=${owner}&repo=${repo}&nome=${encodeURIComponent(nome)}`,

  /** Proxy autenticado — baixa o código-fonte do repo como ZIP */
  downloadZipUrl: (owner, repo, branch = '') => {
    const q = branch ? `?branch=${encodeURIComponent(branch)}` : ''
    return `${BASE_URL}/github/repos/${owner}/${repo}/download-zip${q}`
  },

  /** Cria um novo repositório na conta autenticada */
  criarRepo: (nome, descricao = '', privado = true, org = null) =>
    api('/github/repos/criar', {
      method: 'POST',
      body: JSON.stringify({ nome, descricao, privado, org }),
    }),

  /* ── Sprint 5: Salvar repositório na pasta Projetos ────── */
  salvarProjeto: (owner, repo, nomeProjeto, substituir = false) =>
    api(`/github/repos/${owner}/${repo}/salvar-projeto`, {
      method: 'POST',
      body: JSON.stringify({ nomeProjeto, substituir }),
    }),
}

