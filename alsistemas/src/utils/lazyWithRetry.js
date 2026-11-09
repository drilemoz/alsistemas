import { lazy } from 'react'

const BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Failed to load module script',
  'ChunkLoadError',
]

export function isChunkLoadError(error) {
  const message = error?.message || String(error || '')
  return error?.name === 'ChunkLoadError' || CHUNK_ERROR_PATTERNS.some(pattern => message.includes(pattern))
}

function chunkIdentity(error) {
  const message = error?.message || String(error || '')
  const asset = message.match(/https?:\/\/[^\s)]+|\/assets\/[^\s)]+/)?.[0]
  return asset || window.location.pathname
}

async function refreshServiceWorkerAndCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.update().catch(() => null)))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key.startsWith('alsistemas-')).map(key => caches.delete(key)))
    }
  } catch {
    // A recuperação prossegue mesmo se o navegador bloquear alguma limpeza.
  }
}

function reloadWithCacheBust() {
  const url = new URL(window.location.href)
  url.searchParams.set('__als_update', Date.now().toString())
  window.location.replace(url.toString())
}

export async function recoverFromChunkError(error) {
  if (!isChunkLoadError(error)) return false

  const retryKey = `als:chunk-retry:${BUILD_ID}:${chunkIdentity(error)}`
  if (sessionStorage.getItem(retryKey)) return false

  sessionStorage.setItem(retryKey, '1')
  await refreshServiceWorkerAndCaches()
  reloadWithCacheBust()
  return true
}

/**
 * React.lazy com recuperação automática de chunks obsoletos após deploy.
 * Cada arquivo quebrado só provoca uma recarga, impedindo loops infinitos.
 */
export function lazyWithRetry(importer, moduleName = 'módulo') {
  return lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      if (await recoverFromChunkError(error)) return new Promise(() => {})
      if (!isChunkLoadError(error)) throw error

      const enhancedError = new Error(
        `Não foi possível carregar o ${moduleName}. O sistema tentou atualizar os arquivos automaticamente.`,
        { cause: error }
      )
      enhancedError.name = 'ChunkLoadError'
      throw enhancedError
    }
  })
}
