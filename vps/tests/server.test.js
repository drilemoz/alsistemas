import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { base32, totp } from '../src/security.js'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'als-test-'))
process.env.ALS_DATA_DIR = temp
const { createServer } = await import('../src/server.js')
const origin = 'http://localhost:8181'

test('setup TOTP, autenticação, sessão e CSRF', async () => {
  const code = 'a'.repeat(48)
  fs.writeFileSync(path.join(temp, 'bootstrap-token'), `${code}\n`, { mode: 0o600 })
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  async function call(path, method = 'GET', payload, cookie, csrf) {
    const res = await fetch(url + path, { method, headers: {
      ...(payload ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    }, body: payload && JSON.stringify(payload) })
    return { res, body: await res.json() }
  }
  try {
    let r = await call('/api/status')
    assert.equal(r.body.configured, false)
    r = await call('/api/setup/begin', 'POST', { bootstrap: 'wrong' })
    assert.equal(r.res.status, 401)
    r = await call('/api/setup/begin', 'POST', { bootstrap: code })
    assert.equal(r.res.status, 200)
    const { challenge, secret } = r.body
    r = await call('/api/setup/finish', 'POST', { bootstrap: code, challenge, password: 'weak', otp: totp(secret) })
    assert.equal(r.res.status, 400)
    r = await call('/api/setup/finish', 'POST', { bootstrap: code, challenge, password: 'Segura#987654321', otp: totp(secret) })
    assert.equal(r.res.status, 200)
    assert.ok(!fs.existsSync(path.join(temp, 'bootstrap-token')))
    r = await call('/api/setup/begin', 'POST', { bootstrap: code })
    assert.equal(r.res.status, 409)
    r = await call('/api/login', 'POST', { password: 'wrong', otp: totp(secret) })
    assert.equal(r.res.status, 401)
    r = await call('/api/login', 'POST', { password: 'Segura#987654321', otp: totp(secret) })
    assert.equal(r.res.status, 200)
    const cookie = r.res.headers.get('set-cookie').split(';')[0]
    const csrf = r.body.csrf
    r = await call('/api/session', 'GET', undefined, cookie)
    assert.equal(r.res.status, 200)
    r = await call('/api/tasks', 'POST', { action: 'delete_all' }, cookie, csrf)
    assert.equal(r.res.status, 400)
    r = await call('/api/tasks', 'POST', { action: 'create_project', name: 'test', type: 'static' }, cookie)
    assert.equal(r.res.status, 403)
    r = await call('/api/projects', 'GET', undefined, cookie)
    assert.equal(r.res.status, 200)
    // 2.0.25: mudança DNS requer sessão, origem e CSRF, sem senha repetida.
    const dnsPayload = { domain:'example.com', command:{action:'create',record:{type:'A',name:'teste',value:'192.0.2.5',ttl:1800}} }
    r = await call('/api/integrations/spaceship/dns/change', 'POST', dnsPayload, cookie)
    assert.equal(r.res.status, 403)
    r = await call('/api/integrations/spaceship/dns/change', 'POST', dnsPayload, undefined, csrf)
    assert.equal(r.res.status, 401)
    r = await call('/api/integrations/spaceship/dns/change', 'POST', dnsPayload, cookie, csrf)
    assert.notEqual(r.res.status, 401, 'sessão já autorizou a requisição; provedor pode estar indisponível')
    r = await call('/api/logout', 'POST', {}, cookie, csrf)
    assert.equal(r.res.status, 200)
    r = await call('/api/session', 'GET', undefined, cookie)
    assert.equal(r.res.status, 401)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
