/**
 * rssJob.js  — v2.1 (corrigido)
 * ──────────────────────────────
 * Agendador de importações RSS via node-cron.
 *
 * CORREÇÃO v2.1:
 *  - executarCiclo agora passa respeitarIntervalo=true para importarTodasFontes
 *    quando chamado pelo scheduler automático. Isso faz com que o cron job
 *    respeite os campos auto_update e intervalo_min de cada fonte (comportamento
 *    antes feito pelo rssScheduler.js, agora descontinuado).
 *  - Importação manual (dispararImportacaoManual) passa respeitarIntervalo=false,
 *    importando todas as fontes ativas independentemente do intervalo.
 *
 * Este é o ÚNICO scheduler ativo. O rssScheduler.js foi removido de server.js.
 */
import cron from 'node-cron'
import { importarTodasFontes } from '../services/rssImporter.js'
import { logger } from '../utils/logger.js'

// ─── Estado interno ──────────────────────────────────────────────────────────

let tarefaCron  = null
let emExecucao  = false
let ultimoCiclo = null

// ─── Execução de ciclo ────────────────────────────────────────────────────────

/**
 * Executa um ciclo completo de importação.
 *
 * @param {'agendado'|'manual'} motivo
 * @param {boolean} respeitarIntervalo
 *   true  → respeita auto_update e intervalo_min por fonte (uso pelo cron)
 *   false → importa todas as fontes ativas (uso pelo botão "Importar Agora")
 */
async function executarCiclo(motivo = 'agendado', respeitarIntervalo = true) {
  if (emExecucao) {
    logger.warn({ motivo }, '⏩ Ciclo RSS ignorado: já em execução')
    return null
  }

  emExecucao = true
  const inicio = Date.now()
  logger.info({ motivo, respeitarIntervalo }, '🔄 Iniciando ciclo de importação RSS')

  try {
    // FIX: passa respeitarIntervalo para que fontes com auto_update=false
    // e fontes cujo intervalo_min ainda não venceu sejam puladas no cron.
    const resultados = await importarTodasFontes(3, respeitarIntervalo)

    const totais = resultados.reduce(
      (acc, r) => ({
        importadas:    acc.importadas    + (r.importadas    ?? 0),
        ignoradas:     acc.ignoradas     + (r.ignoradas     ?? 0),
        fontesComErro: acc.fontesComErro + (r.erro ? 1 : 0),
      }),
      { importadas: 0, ignoradas: 0, fontesComErro: 0 }
    )

    const duracaoMs = Date.now() - inicio
    const duracao   = (duracaoMs / 1_000).toFixed(1) + 's'

    logger.info(
      { motivo, duracao, fontes: resultados.length, ...totais },
      '✅ Ciclo RSS concluído'
    )

    ultimoCiclo = new Date()
    return { resultados, totais, duracao, finalizadoEm: ultimoCiclo }

  } catch (err) {
    const duracao = ((Date.now() - inicio) / 1_000).toFixed(1) + 's'
    logger.error({ motivo, duracao, err: err.message }, '❌ Falha crítica no ciclo RSS')
    return null

  } finally {
    emExecucao = false
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicia o job de importação RSS com o cron configurado.
 *
 * @param {string} [expressao='0 * * * *']  Expressão cron (padrão: a cada hora)
 * @param {string} [timezone='America/Sao_Paulo']
 */
export function iniciarRssJob(
  expressao = '0 * * * *',
  timezone  = 'America/Sao_Paulo'
) {
  if (tarefaCron) {
    logger.warn('⚠️ Cron RSS já está ativo — chamada ignorada')
    return
  }

  if (!cron.validate(expressao)) {
    throw new Error(`Expressão cron inválida: "${expressao}"`)
  }

  // FIX: passa respeitarIntervalo=true para execuções agendadas
  tarefaCron = cron.schedule(expressao, () => executarCiclo('agendado', true), {
    scheduled: true,
    timezone,
  })

  logger.info({ expressao, timezone }, '📡 Cron RSS iniciado')
}

/**
 * Para o cron job.
 */
export function pararRssJob() {
  if (tarefaCron) {
    tarefaCron.stop()
    tarefaCron = null
    logger.info('📡 Cron RSS encerrado')
  }
}

/**
 * Dispara uma execução imediata fora do agendamento (botão "Importar Agora").
 * Importa TODAS as fontes ativas, ignorando intervalo_min.
 *
 * @returns {Promise<Object|null>}
 */
export function dispararImportacaoManual() {
  // FIX: respeitarIntervalo=false → importa tudo, independentemente do intervalo
  return executarCiclo('manual', false)
}

/**
 * Retorna o estado atual do job.
 *
 * @returns {{ ativo, emExecucao, ultimoCiclo }}
 */
export function statusRssJob() {
  return {
    ativo:       !!tarefaCron,
    emExecucao,
    ultimoCiclo,
  }
}
