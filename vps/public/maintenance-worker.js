'use strict'
const cacheName='als-maintenance-v1'
const assets=['/maintenance-offline.html','/maintenance-offline.js','/maintenance-offline.css']
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(assets)).then(()=>self.skipWaiting()))
})
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('als-maintenance-')&&name!==cacheName).map(name=>caches.delete(name)))).then(()=>self.clients.claim()))
})
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url)
  if (req.method!=='GET'||url.origin!==self.location.origin) return
  if (assets.includes(url.pathname)&&!url.search) {
    event.respondWith(caches.open(cacheName).then(cache=>cache.match(url.pathname)).then(match=>match||fetch(req)))
    return
  }
  if (req.mode!=='navigate'||url.pathname!=='/'||url.search) return
  event.respondWith((async()=>{
    let response
    try {
      response=await fetch(req,{signal:AbortSignal.timeout(8000)})
      if(response.status<500)return response
    } catch {}
    const offline=await caches.open(cacheName).then(cache=>cache.match(assets[0]))
    return offline||response||Response.error()
  })())
})
