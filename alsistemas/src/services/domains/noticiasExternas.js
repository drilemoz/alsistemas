import { api } from './http.js'
export const noticiasExternasService = {
  async listar()          { return api('/noticias-externas') },
  async listarTodas()     { return api('/noticias-externas/todas') },
  async criar(dados)      { return api('/noticias-externas', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/noticias-externas/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/noticias-externas/${id}`, { method: 'DELETE' }); return true },
}
