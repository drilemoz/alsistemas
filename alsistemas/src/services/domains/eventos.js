import { api } from './http.js'
export const eventosService = {
  async listar()          { return api('/eventos') },
  async listarTodos()     { return api('/eventos/todos') },
  async criar(dados)      { return api('/eventos', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/eventos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/eventos/${id}`, { method: 'DELETE' }); return true },
}
