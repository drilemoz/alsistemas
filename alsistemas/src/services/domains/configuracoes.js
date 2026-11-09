import { api } from './http.js'
export const configuracoesService = {
  async listar()              { return api('/configuracoes') },
  async atualizar(chave, valor) {
    return api(`/configuracoes/${chave}`, { method: 'PUT', body: JSON.stringify({ valor }) })
  },
  async atualizarLote(pares) {
    return api('/configuracoes-lote', { method: 'PUT', body: JSON.stringify({ pares }) })
  },
}
