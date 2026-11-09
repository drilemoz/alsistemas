/**
 * #1 — Cache com Redis + fallback em memória.
 * Interface idêntica ao cache anterior: cacheGet / cacheSet / cacheDel.
 * Se Redis estiver indisponível, usa Map em memória automaticamente.
 */
import { getRedis, isRedisDisponivel } from './redis.js'

// ─── Fallback em memória ──────────────────────────────────────
const _store = new Map()

function memGet(chave) {
  const e = _store.get(chave)
  if (!e) return null
  if (Date.now() > e.expiraEm) { _store.delete(chave); return null }
  return e.valor
}

function memSet(chave, valor, ttl) {
  _store.set(chave, { valor, expiraEm: Date.now() + ttl * 1000 })
}

function memDel(chave) { _store.delete(chave) }

// ─── API pública ──────────────────────────────────────────────

/**
 * Retorna o valor do cache ou null se ausente/expirado.
 */
export async function cacheGet(chave) {
  if (isRedisDisponivel()) {
    try {
      const raw = await getRedis().get(chave)
      return raw ? JSON.parse(raw) : null
    } catch { /* cai no fallback */ }
  }
  return memGet(chave)
}

/**
 * Armazena um valor com TTL em segundos (padrão: 60s).
 */
export async function cacheSet(chave, valor, ttlSegundos = 60) {
  if (isRedisDisponivel()) {
    try {
      await getRedis().set(chave, JSON.stringify(valor), 'EX', ttlSegundos)
      return
    } catch { /* cai no fallback */ }
  }
  memSet(chave, valor, ttlSegundos)
}

/**
 * Invalida uma entrada do cache.
 */
export async function cacheDel(chave) {
  if (isRedisDisponivel()) {
    try {
      await getRedis().del(chave)
      return
    } catch { /* cai no fallback */ }
  }
  memDel(chave)
}

/**
 * Verifica se um IP já contabilizou visualização para uma notícia.
 * Usado para deduplicação de views (#5).
 * TTL padrão: 24h (86400s).
 */
export async function viewJaContabilizada(noticiaId, ip, ttl = 86400) {
  const chave = `view:${noticiaId}:${ip}`
  if (isRedisDisponivel()) {
    try {
      const redis = getRedis()
      const existe = await redis.get(chave)
      if (existe) return true
      await redis.set(chave, '1', 'EX', ttl)
      return false
    } catch { /* cai no fallback */ }
  }
  // Sem Redis: nunca deduplica (aceita todas as views)
  return false
}
// ... (código existente)

/**
 * Remove todas as entradas do cache (Redis ou memória).
 * Retorna o número de chaves removidas (estimado em memória).
 */
export async function cacheClearAll() {
  if (isRedisDisponivel()) {
    try {
      const redis = getRedis()
      const keys = await redis.keys('*')
      if (keys.length) await redis.del(...keys)
      return keys.length
    } catch {
      // fallback para memória
    }
  }
  // Fallback em memória: limpa todo o Map
  const count = _store.size
  _store.clear()
  return count
}