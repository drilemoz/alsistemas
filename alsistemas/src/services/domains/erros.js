import { api, BASE_URL } from './http.js'

const BASE_URL_ERROS = BASE_URL + '/erros'

export const errosService = {
  // Fire-and-forget: nunca lança exceção para não criar loop infinito
  async capturar({ tipo, mensagem, stack, dados } = {}) {
    try {
      const payload = {
        tipo,
        mensagem: String(mensagem || 'Erro desconhecido').slice(0, 2000),
        stack:    stack ? String(stack).slice(0, 5000) : null,
        url:      window.location.href,
        rota:     window.location.pathname,
        user_agent: navigator.userAgent,
        usuario_email: null,
        dados: dados || null,
      }
      await fetch(BASE_URL_ERROS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
    } catch { /* silencioso */ }
  },

  async listar({ tipo, lido, status, page = 1, limit = 50 } = {}) {
    const p = new URLSearchParams({ page, limit })
    if (tipo   !== undefined) p.set('tipo', tipo)
    if (status !== undefined) p.set('status', status)
    if (lido   !== undefined && status === undefined) p.set('lido', String(lido))
    return api(`/erros?${p}`)
  },

  async contagem()              { return api('/erros/contagem') },
  async marcarLido(id, lido = true) {
    return api(`/erros/${id}/lido`, { method: 'PATCH', body: JSON.stringify({ lido }) })
  },
  async atualizarStatus(id, status) {
    return api(`/erros/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  async marcarTodosLidos() {
    return api('/erros/marcar-todos-lidos', { method: 'PATCH', body: '{}' })
  },
  async excluir(id)             { await api(`/erros/${id}`, { method: 'DELETE' }) },
  async bulkDelete(ids)         { return api('/erros/bulk',        { method: 'DELETE', body: JSON.stringify({ ids }) }) },
  async bulkStatus(ids, status) { return api('/erros/bulk-status', { method: 'PATCH',  body: JSON.stringify({ ids, status }) }) },
  async limpar({ tipo, status, apenas_lidos } = {}) {
    const p = new URLSearchParams()
    if (tipo)         p.set('tipo', tipo)
    if (status)       p.set('status', status)
    if (apenas_lidos) p.set('apenas_lidos', 'true')
    return api(`/erros${p.toString() ? '?' + p : ''}`, { method: 'DELETE' })
  },
}
