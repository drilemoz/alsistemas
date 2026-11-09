import { api } from './http.js'
export const modulosService = {
  async listar()             { return api('/modulos') },
  async atualizar(id, upd)   { return api(`/modulos/${id}`, { method: 'PUT', body: JSON.stringify(upd) }) },
}
