import { api } from './http.js'
export const fontesService = {
  async listar()          { return api('/fontes') },
  async criar(dados)      { return api('/fontes', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/fontes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/fontes/${id}`, { method: 'DELETE' }); return true },
}
