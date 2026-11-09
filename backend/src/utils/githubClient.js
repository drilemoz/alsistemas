/**
 * githubClient.js — Cliente centralizado para GitHub API
 *
 * Utilitário compartilhado entre github.js e analysis.js.
 * Token lido exclusivamente do ambiente backend (GITHUB_TOKEN).
 * Frontend NUNCA recebe ou vê o token.
 *
 * Adicionado no Sprint 6-B para eliminar duplicação entre rotas.
 */

export const GITHUB_API = 'https://api.github.com'

/**
 * Faz uma requisição autenticada à GitHub API.
 *
 * @param {string} apiPath   - Caminho relativo, ex: "/repos/owner/repo"
 * @param {RequestInit} options - Opções do fetch (method, body, headers extras)
 * @returns {Promise<object|null>} JSON da resposta, ou null se status 204
 * @throws {Error} com .status = código HTTP em caso de erro da API
 */
export async function githubFetch(apiPath, options = {}) {
  const token = process.env.GITHUB_TOKEN

  if (!token) {
    const err = new Error('GITHUB_TOKEN não configurado no ambiente.')
    err.status = 503
    throw err
  }

  const res = await fetch(`${GITHUB_API}${apiPath}`, {
    ...options,
    headers: {
      'Authorization':        `Bearer ${token}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      ...options.headers,
    },
  })

  if (res.status === 204) return null

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error(data.message || `GitHub API error ${res.status}`)
    err.status = res.status
    throw err
  }

  return data
}
