/**
 * #1 — Cliente Redis compartilhado (ioredis).
 * Reconecta automaticamente; erros são logados mas não derrubam o servidor.
 */
import Redis from 'ioredis'
import { logger } from './logger.js'

let redisClient = null
let redisDisponivel = false

export function criarRedisClient(url) {
  const client = new Redis(url || process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      // Desiste após 3 tentativas; servidor segue sem Redis (fallback em memória)
      if (times > 3) return null
      return Math.min(times * 500, 2000)
    },
  })

  client.on('connect', () => {
    redisDisponivel = true
    logger.info('✅ Redis conectado')
  })

  client.on('error', (err) => {
    if (redisDisponivel) {
      logger.warn({ err: err.message }, '⚠️  Redis desconectado — usando cache em memória')
    }
    redisDisponivel = false
  })

  client.on('reconnecting', () => logger.info('🔄 Redis reconectando...'))

  return client
}

export function getRedis() { return redisClient }
export function isRedisDisponivel() { return redisDisponivel }

export async function iniciarRedis(url) {
  redisClient = criarRedisClient(url)
  try {
    await redisClient.connect()
  } catch {
    logger.warn('⚠️  Redis indisponível na inicialização — cache em memória ativo')
  }
  return redisClient
}

export default { getRedis, isRedisDisponivel, iniciarRedis }
