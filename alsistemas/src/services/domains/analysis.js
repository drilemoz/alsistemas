/**
 * analysis.js — Serviço de domínio: Análise Inteligente (Sprint 4)
 *
 * Sprint 4 — ADIÇÃO PURA.
 */
import { api } from './http.js'

export const analysisService = {
  /** Overview geral: saúde do sistema, alertas, stats */
  overview: () => api('/analysis/overview'),

  /** Comparação local ↔ GitHub de um projeto */
  sync: (projectName) => api(`/analysis/sync/${encodeURIComponent(projectName)}`),

  /** Chat com IA Assistant */
  chat: (pergunta, contexto = {}) =>
    api('/analysis/ai/chat', {
      method: 'POST',
      body:   JSON.stringify({ pergunta, contexto }),
    }),
}
