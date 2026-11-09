import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-update-api-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const secret = base32(crypto.randomBytes(20))
const password = 'TesteSeguro#1234567890'
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ passwordHash: hashPassword(password), totpSecret: secret }))

test('atualização usa sessão, CSRF e repositório, sem senha repetida', async () => {
  const calls = []
  const server = createServer({ taskRunner: async (task) => { calls.push(task); return { ok: true, message: 'Atualização iniciada no teste' } } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  async function call(endpoint, method = 'GET', payload, cookie, csrf) {
    const res = await fetch(url + endpoint, { method, headers: {
      ...(payload !== undefined ? { Origin: 'http://localhost:8181', 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    }, body: payload !== undefined ? JSON.stringify(payload) : undefined })
    return { code: res.status, body: await res.json(), cookies: res.headers.getSetCookie() }
  }
  try {
    assert.equal((await call('/api/updates')).code, 401)
    const login = await call('/api/login', 'POST', { password, otp: totp(secret) })
    assert.equal(login.code, 200)
    const cookie = login.cookies.find(c => c.startsWith('als_session=')).split(';')[0]
    const csrf = login.body.csrf
    assert.equal((await call('/api/updates/apply', 'POST', { password, otp: totp(secret) }, cookie)).code, 403)
    assert.equal((await call('/api/updates/configure', 'POST', { repo: '../../admin', password, otp: totp(secret) }, cookie, csrf)).code, 400)
    const info = await call('/api/updates', 'GET', undefined, cookie)
    assert.equal(info.body.signingReady, undefined)
    const otpNext = totp(secret, Date.now() + 30000)
    const config = await call('/api/updates/configure', 'POST', { repo: 'owner/repo', password, otp: otpNext }, cookie, csrf)
    assert.equal(config.code, 200)
    assert.equal((await call('/api/updates/apply', 'POST', { password }, cookie, csrf)).code, 400)
    assert.equal((await call('/api/updates/apply', 'POST', {}, undefined, csrf)).code, 401)
    const accepted = await call('/api/updates/apply', 'POST', {}, cookie, csrf)
    assert.equal(accepted.code, 202)
    assert.deepEqual(calls, [{ action: 'start_update' }])
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }) }
})
