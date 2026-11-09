import { api, BASE_URL } from './http.js'

export const backupService = {
  async listar()              { return api('/admin/backup') },
  async stats()               { return api('/admin/backup/~stats') },
  async criar(descricao = '') { return api('/admin/backup', { method: 'POST', body: JSON.stringify({ descricao }) }) },
  async importar(arquivo, descricao = '') {
    const form = new FormData()
    form.append('arquivo', arquivo)
    if (descricao.trim()) form.append('descricao', descricao.trim())
    const res = await fetch(`${BASE_URL}/admin/backup/import`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`)
    return data
  },
  async restaurar(id) { return api(`/admin/backup/${id}/restore`, { method: 'POST', body: '{}' }) },
  async excluir(id)   { return api(`/admin/backup/${id}`, { method: 'DELETE' }) },
  downloadUrl(id)     { return `${BASE_URL}/admin/backup/${id}/download` },
}
