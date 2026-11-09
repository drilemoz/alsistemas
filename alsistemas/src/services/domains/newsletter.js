import { api } from './http.js'

export const newsletterService = {
  async assinar(email, nome = '') {
    return api('/newsletter/assinar', { method: 'POST', body: JSON.stringify({ email, nome }) })
  },
  async listarAssinantes({ page = 1, limit = 50, ativo } = {}) {
    const p = new URLSearchParams({ page, limit })
    if (ativo !== undefined) p.set('ativo', String(ativo))
    return api(`/newsletter/assinantes?${p}`)
  },
  async removerAssinante(id) {
    return api(`/newsletter/assinantes/${id}`, { method: 'DELETE' })
  },
  async alterarStatus(id, ativo) {
    return api(`/newsletter/assinantes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ ativo }) })
  },
}
