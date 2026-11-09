import { api } from './http.js'
export const categoriasService = {
  async listar()          { return api('/categorias') },
  async criar(dados)      { return api('/categorias', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/categorias/${id}`, { method: 'DELETE' }); return true },
}
