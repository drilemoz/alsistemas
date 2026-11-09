/**
 * aiClient.js — Abstração do provedor de IA
 *
 * Permite trocar entre Anthropic (Claude) e Groq sem alterar
 * a lógica de negócio em analysis.js.
 *
 * Provedor ativo: controlado pela variável de ambiente AI_PROVIDER
 *   'groq'      → Groq API (padrão) — openai-compatible, baixa latência
 *   'anthropic' → Anthropic API (Claude) — fallback / legacy
 *
 * Variáveis necessárias por provedor:
 *   Groq:      GROQ_API_KEY
 *   Anthropic: ANTHROPIC_API_KEY
 *
 * Sprint 6-B: adicionado para viabilizar migração Anthropic → Groq.
 */

/* ─── Constantes de controle de custo ───────────────────────── */
export const HISTORICO_MAX_MSGS  = 10    // máx de mensagens do histórico enviadas à IA
export const CONTEXTO_MAX_CHARS  = 4000  // máx de chars do contexto serializado
export const MAX_TOKENS_DEFAULT  = parseInt(process.env.ANTHROPIC_MAX_TOKENS || process.env.AI_MAX_TOKENS) || 1000

/* ─── Modelos padrão por provedor ───────────────────────────── */
const GROQ_DEFAULT_MODEL      = 'llama-3.3-70b-versatile'
const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-6'

/* ─── Helpers de truncamento ────────────────────────────────── */

/**
 * Trunca o histórico de mensagens para o limite configurado.
 * @param {Array} mensagens
 * @returns {Array}
 */
export function truncarHistorico(mensagens) {
  if (!Array.isArray(mensagens)) return []
  return mensagens.slice(-HISTORICO_MAX_MSGS)
}

/**
 * Trunca o contexto serializado para o limite configurado.
 * @param {object} contexto
 * @returns {string}
 */
export function truncarContexto(contexto) {
  const str = JSON.stringify(contexto || {})
  if (str.length <= CONTEXTO_MAX_CHARS) return str
  return str.slice(0, CONTEXTO_MAX_CHARS) + '…[truncado]'
}

/* ─── Provedor: Groq ─────────────────────────────────────────── */

/**
 * Envia uma mensagem via Groq API (OpenAI-compatible).
 * @param {string} systemPrompt
 * @param {string} pergunta
 * @param {Array}  historico    - mensagens anteriores [{role, content}]
 * @returns {{ resposta: string, modelo: string, tokens: object }}
 */
async function chatGroq(systemPrompt, pergunta, historico = []) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    const err = new Error('GROQ_API_KEY não configurada no .env do backend.')
    err.status = 503
    throw err
  }

  const model       = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL
  const max_tokens  = MAX_TOKENS_DEFAULT

  const mensagensEnviadas = [
    { role: 'system', content: systemPrompt },
    ...truncarHistorico(historico),
    { role: 'user', content: pergunta },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      messages: mensagensEnviadas,
      temperature: 0.4,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const err = new Error(errBody.error?.message || `Groq API error ${res.status}`)
    err.status = res.status
    throw err
  }

  const data     = await res.json()
  const resposta = data.choices?.[0]?.message?.content || ''

  return {
    resposta,
    modelo:   data.model || model,
    tokens:   {
      input_tokens:  data.usage?.prompt_tokens     || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    },
    provedor: 'groq',
  }
}

/* ─── Provedor: Anthropic ────────────────────────────────────── */

/**
 * Envia uma mensagem via Anthropic API.
 * @param {string} systemPrompt
 * @param {string} pergunta
 * @param {Array}  historico
 * @returns {{ resposta: string, modelo: string, tokens: object }}
 */
async function chatAnthropic(systemPrompt, pergunta, historico = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY não configurada no .env do backend.')
    err.status = 503
    throw err
  }

  const model      = process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL
  const max_tokens = MAX_TOKENS_DEFAULT

  // Anthropic usa campo "system" separado — remove do array de mensagens
  const mensagensEnviadas = [
    ...truncarHistorico(historico),
    { role: 'user', content: pergunta },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      system:   systemPrompt,
      messages: mensagensEnviadas,
    }),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const err = new Error(errBody.error?.message || `Anthropic API error ${res.status}`)
    err.status = res.status
    throw err
  }

  const data     = await res.json()
  const resposta = data.content?.[0]?.text || ''

  return {
    resposta,
    modelo:   data.model || model,
    tokens:   data.usage || {},
    provedor: 'anthropic',
  }
}

/* ─── Interface pública ──────────────────────────────────────── */

/**
 * Envia uma pergunta ao provedor de IA ativo (AI_PROVIDER).
 * Interface única — analysis.js não precisa conhecer o provedor.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt  - Prompt de sistema
 * @param {string} opts.pergunta      - Pergunta do usuário
 * @param {Array}  opts.historico     - Histórico de mensagens [{role, content}]
 * @returns {Promise<{ resposta: string, modelo: string, tokens: object, provedor: string }>}
 */
export async function enviarMensagem({ systemPrompt, pergunta, historico = [] }) {
  const provedor = (process.env.AI_PROVIDER || 'groq').toLowerCase()

  if (provedor === 'anthropic') {
    return chatAnthropic(systemPrompt, pergunta, historico)
  }

  // Padrão: Groq
  return chatGroq(systemPrompt, pergunta, historico)
}

/**
 * Retorna o nome do provedor ativo e o modelo configurado.
 * Útil para exibir no frontend qual IA está em uso.
 */
export function provedorInfo() {
  const provedor = (process.env.AI_PROVIDER || 'groq').toLowerCase()
  if (provedor === 'anthropic') {
    return {
      provedor:  'anthropic',
      modelo:    process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL,
      disponivel: !!process.env.ANTHROPIC_API_KEY,
    }
  }
  return {
    provedor:  'groq',
    modelo:    process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
    disponivel: !!process.env.GROQ_API_KEY,
  }
}
