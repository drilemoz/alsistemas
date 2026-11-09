import { api } from './http.js'

export const mongoService = {
  async colecoes() {
    return api('/admin/mongo/colecoes')
  },
  async documentos(nome, params = {}) {
    const qs = new URLSearchParams()
    if (params.page)   qs.set('page',   params.page)
    if (params.limit)  qs.set('limit',  params.limit)
    if (params.filtro) qs.set('filtro', params.filtro)
    return api(`/admin/mongo/colecoes/${encodeURIComponent(nome)}/documentos?${qs}`)
  },
  async deletar(nome, id) {
    return api(`/admin/mongo/colecoes/${encodeURIComponent(nome)}/documentos/${id}`, { method: 'DELETE' })
  },
  async atualizar(nome, id, campos) {
    return api(`/admin/mongo/colecoes/${encodeURIComponent(nome)}/documentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ campos }),
    })
  },
  async aggregate(nome, pipeline) {
    return api(`/admin/mongo/colecoes/${encodeURIComponent(nome)}/aggregate`, {
      method: 'POST',
      body: JSON.stringify({ pipeline }),
    })
  },
}
