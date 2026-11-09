import { api } from './http.js'

export const noticiasService = {
  async listar({ categoria, page = 1, limit = 9, q, cursor, dataInicio, dataFim, ordem, status } = {}) {
    const p = new URLSearchParams()
    if (categoria)         p.set('categoria', categoria)
    if (cursor)            p.set('cursor', cursor)
    else if (page > 1)     p.set('page', String(page))
    if (limit !== 9)       p.set('limit', String(limit))
    if (q?.trim())         p.set('q', q.trim())
    if (dataInicio)        p.set('dataInicio', dataInicio)
    if (dataFim)           p.set('dataFim', dataFim)
    if (ordem && ordem !== 'recente') p.set('ordem', ordem)
    if (status)            p.set('status', status)
    const qs = p.toString()
    return api(`/noticias${qs ? `?${qs}` : ''}`)
  },
  async buscarPorId(id)       { return api(`/noticias/${id}`) },
  async criar(dados)          { return api('/noticias', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados)     { return api(`/noticias/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)           { await api(`/noticias/${id}`, { method: 'DELETE' }); return true },
  async atualizarStatus(id, status) {
    return api(`/noticias/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  async contagemStatus()      { return api('/noticias/contagem-status') },
}
