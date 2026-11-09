import { api } from './http.js'

export const securityService = {
  resumo: () => api('/admin/security/resumo'),
  eventos: (params = {}) => api(`/admin/security/eventos?${new URLSearchParams(params)}`),
  resolver: (id, resolvido = true) => api(`/admin/security/eventos/${id}`, {
    method: 'PATCH', body: JSON.stringify({ resolvido }),
  }),
}
