import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/server.js'

const dir = fileURLToPath(new URL('../public/', import.meta.url))

test('HTTP entrega todos os scripts reais do HTML (inclusive integrações)', async () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="(\/[^"]+)"/g)].map(match => match[1])
  assert.deepEqual(scripts.sort(), ['/app.js', '/integrations.js'])
  const server = createServer()
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    for (const script of scripts) {
      const response = await fetch(base+script)
      assert.equal(response.status,200,`${script} não disponível pela rota HTTP`)
      assert.match(response.headers.get('content-type') || '', /text\/javascript/)
      assert.match(response.headers.get('content-security-policy') || '', /script-src 'self'/)
      const actual = await response.text()
      assert.equal(actual, fs.readFileSync(path.join(dir,path.basename(script)),'utf8'))
    }
  } finally { await new Promise(resolve=>server.close(resolve)) }
})
