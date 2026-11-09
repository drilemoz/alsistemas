import { api } from './http.js'
export const onibusService = {
  async listar()          { return api('/onibus') },
  async listarTodos()     { return api('/onibus/todos') },
  async criar(dados)      { return api('/onibus', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados) { return api(`/onibus/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)       { await api(`/onibus/${id}`, { method: 'DELETE' }); return true },
}
