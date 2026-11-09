import { api } from './http.js'

export const infraestruturaService = {

  async credenciais() { return api('/admin/infraestrutura/credenciais') },
  async salvarCredencial(plataforma, segredo, metadata = {}) {
    return api(`/admin/infraestrutura/credenciais/${encodeURIComponent(plataforma)}`, {
      method: 'PUT', body: JSON.stringify({ segredo, metadata }),
    })
  },
  async removerCredencial(plataforma) {
    return api(`/admin/infraestrutura/credenciais/${encodeURIComponent(plataforma)}`, { method: 'DELETE' })
  },
  async testarConexoes() {
    return api('/admin/infraestrutura/testar-conexoes', { method: 'POST', body: '{}' })
  },
  async mongoStatus()         { return api('/admin/infraestrutura/mongodb/status') },
  async mongoColecoes()       { return api('/admin/infraestrutura/mongodb/colecoes') },
  async mongoDocumentos(nome, page = 1, limit = 20, q = '') {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (q) p.set('q', q)
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(nome)}?${p}`)
  },
  async mongoExcluirDoc(colecao, id) {
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(colecao)}/doc/${id}`, { method: 'DELETE' })
  },
  async mongoStatsColecao(nome) {
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(nome)}/stats`)
  },
  async mongoIndices(nome) {
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(nome)}/indices`)
  },
  async mongoCriarIndice(nome, campos, unique = false) {
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(nome)}/indices`, {
      method: 'POST',
      body: JSON.stringify({ campos, unique, background: true }),
    })
  },
  async mongoRemoverIndice(nome, nomeIndice) {
    return api(`/admin/infraestrutura/mongodb/colecoes/${encodeURIComponent(nome)}/indices/${encodeURIComponent(nomeIndice)}`, {
      method: 'DELETE',
    })
  },
  async cloudinaryStatus()    { return api('/admin/infraestrutura/cloudinary/status') },
  async cloudinaryRecursos(tipo = 'image', max = 20, cursor = null) {
    const p = new URLSearchParams({ tipo, max: String(max) })
    if (cursor) p.set('cursor', cursor)
    return api(`/admin/infraestrutura/cloudinary/recursos?${p}`)
  },
  async cloudinaryExcluir(public_id, tipo = 'image') {
    return api('/admin/infraestrutura/cloudinary/recursos', {
      method: 'DELETE', body: JSON.stringify({ public_id, tipo }),
    })
  },
  async sistemaMetricas()     { return api('/admin/infraestrutura/sistema/metricas') },
  async limparCache()         { return api('/admin/infraestrutura/sistema/limpar-cache', { method: 'POST', body: '{}' }) },
  // ── Plataformas (Render + Vercel) ───────────────────────────
  async plataformasStatus()      { return api('/admin/infraestrutura/plataformas/status') },
  async renderServicos()         { return api('/admin/infraestrutura/plataformas/render/servicos') },
  async renderDeploys(svcId)     { return api(`/admin/infraestrutura/plataformas/render/servicos/${svcId}/deploys`) },
  async vercelConfiguracao()      { return api('/admin/infraestrutura/plataformas/vercel/configuracao') },
  async salvarVercelConfiguracao(token, teamId = '') {
    return api('/admin/infraestrutura/plataformas/vercel/configuracao', {
      method: 'PUT', body: JSON.stringify({ token, teamId }),
    })
  },
  async testarVercel(token = '', teamId = '') {
    return api('/admin/infraestrutura/plataformas/vercel/testar', {
      method: 'POST', body: JSON.stringify({ token, teamId }),
    })
  },
  async removerVercelConfiguracao() {
    return api('/admin/infraestrutura/plataformas/vercel/configuracao', { method: 'DELETE' })
  },
  async vercelProjetos()         { return api('/admin/infraestrutura/plataformas/vercel/projetos') },
  async vercelDeploys(projId)    { return api(`/admin/infraestrutura/plataformas/vercel/projetos/${projId}/deploys`) },
}
