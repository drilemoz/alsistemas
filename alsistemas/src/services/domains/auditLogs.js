import { api } from './http.js'

export const auditLogsService = {
  /**
   * Lista registros de auditoria.
   * @param {{ recurso?: string, admin_id?: string, page?: number, limit?: number }} opts
   */
  async listar({ recurso, admin_id, page = 1, limit = 20 } = {}) {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (recurso)  p.set('recurso', recurso)
    if (admin_id) p.set('admin_id', admin_id)
    return api(`/audit-logs?${p}`)
  },
}
