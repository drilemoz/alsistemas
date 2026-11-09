import { api } from './http.js'
export const topicosService = {
  async listar()          { return api('/topicos') },
  async listarTodos()     { return api('/topicos/todos') },
  async criar(dados)      { return api('/topicos', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/topicos/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/topicos/${id}`, { method: 'DELETE' }); return true },
}
