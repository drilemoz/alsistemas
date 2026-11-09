// AL Sistemas — Service Worker
// HTML e chunks do Vite nunca são servidos de um cache antigo após deploy.
const CACHE_NAME = 'alsistemas-v1'
const API_CACHE_NAME = 'alsistemas-api-v1'
const PRECACHE_URLS = ['/manifest.json']

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const hasOldCaches = keys.some(key => key !== CACHE_NAME && key !== API_CACHE_NAME)
    await Promise.all(keys.filter(key => key !== CACHE_NAME && key !== API_CACHE_NAME).map(key => caches.delete(key)))
    await self.clients.claim()
    if (!hasOldCaches) return
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }))
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(request))
    return
  }

  // Chunks versionados precisam ir sempre à rede. Um 404 deve chegar ao app,
  // que limpa os caches e recarrega o index.html da versão atual.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(request))
    return
  }

  // Navegações sempre buscam o index atual; não armazenamos HTML do deploy.
  if (request.mode === 'navigate') {
    event.respondWith(networkNavigate(request))
    return
  }

  if (url.pathname.match(/\.(woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$/)) {
    event.respondWith(cacheFirstStatic(request))
  }
})

async function cacheFirstStatic(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirstAPI(request) {
  const cache = await caches.open(API_CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ erro: 'Sem conexão', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function networkNavigate(request) {
  try {
    return await fetch(request, { cache: 'no-store' })
  } catch {
    return new Response('<h1>Sem conexão</h1><p>Verifique sua internet e tente novamente.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
