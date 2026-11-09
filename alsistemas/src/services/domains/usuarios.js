import { api } from './http.js'

export const usuariosService = {
  async listar()               { return api('/admin/usuarios') },
  async buscarPorId(id)        { return api(`/admin/usuarios/${id}`) },
  async criar(dados)           { return api('/admin/usuarios', { method: 'POST', body: JSON.stringify(dados) }) },
  async editar(id, dados)      { return api(`/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluir(id)            { return api(`/admin/usuarios/${id}`, { method: 'DELETE' }) },
  async listarPerfis()         { return api('/admin/usuarios/perfis/todos') },
  async criarPerfil(dados)     { return api('/admin/usuarios/perfis/novo', { method: 'POST', body: JSON.stringify(dados) }) },
  async editarPerfil(id, dados){ return api(`/admin/usuarios/perfis/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluirPerfil(id)      { return api(`/admin/usuarios/perfis/${id}`, { method: 'DELETE' }) },
}
