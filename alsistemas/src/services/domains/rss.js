import { api } from './http.js'

export const rssService = {
  async listarFontes()         { return api('/admin/rss/fontes') },
  async fontesPadrao()         { return api('/admin/rss/fontes/padrao') },
  async criarFonte(dados)      { return api('/admin/rss/fontes', { method: 'POST', body: JSON.stringify(dados) }) },
  async editarFonte(id, dados) { return api(`/admin/rss/fontes/${id}`, { method: 'PUT', body: JSON.stringify(dados) }) },
  async excluirFonte(id)       { await api(`/admin/rss/fontes/${id}`, { method: 'DELETE' }); return true },
  async importarFonte(id, dados = {}) {
    return api(`/admin/rss/fontes/${id}/importar`, { method: 'POST', body: JSON.stringify(dados) })
  },
  async importarTodas()        { return api('/admin/rss/importar-todas', { method: 'POST', body: '{}' }) },
  async testarUrl(url)         { return api('/admin/rss/testar-url', { method: 'POST', body: JSON.stringify({ url }) }) },
  async status()               { return api('/admin/rss/status') },
  async iniciarScheduler(expressao) {
    return api('/admin/rss/scheduler/iniciar', {
      method: 'POST',
      body: JSON.stringify({ expressao: expressao || '0 * * * *' }),
    })
  },
  async pararScheduler()       { return api('/admin/rss/scheduler/parar', { method: 'POST', body: '{}' }) },
  async executarAgora()        { return api('/admin/rss/scheduler/executar-agora', { method: 'POST', body: '{}' }) },
}
