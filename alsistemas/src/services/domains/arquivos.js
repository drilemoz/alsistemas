/**
 * arquivos.js — Serviço para o editor de arquivos de configuração.
 */
import { api } from './http.js'

export const arquivosService = {
  /** Lista todos os arquivos da whitelist com status de existência. */
  listar: () => api('/admin/arquivos'),

  /** Retorna o conteúdo completo de um arquivo pelo key. */
  ler: (key) => api(`/admin/arquivos/${key}`),

  /** Salva o conteúdo de um arquivo. */
  salvar: (key, conteudo) =>
    api(`/admin/arquivos/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ conteudo }),
    }),
}
