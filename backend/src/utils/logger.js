/**
 * #7 — Logging estruturado com pino.
 * Nível controlado pela variável LOG_LEVEL (padrão: info).
 * Em desenvolvimento, usa pino-pretty se disponível.
 */
import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Em produção, JSON puro; em dev, formatado (se pino-pretty instalado)
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }),
  base: { service: 'alsistemas-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export default logger
