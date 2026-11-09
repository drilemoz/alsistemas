import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-trusted-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const secret = base32(crypto.randomBytes(20))
const password = 'MinhaSenhaDeTeste#987654'
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ passwordHash: hashPassword(password), totpSecret: secret }), { mode: 0o600 })
const origin = 'http://localhost:8181'

test('dispositivo confiável: 30 dias, senha obrigatória, revogação, CSRF', async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  async function call(endpoint, method = 'GET', payload, cookie, csrf) {
    const response = await fetch(url + endpoint, { method, headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    }, body: payload === undefined ? undefined : JSON.stringify(payload) })
    const cookies = response.headers.getSetCookie()
    return { status: response.status, body: await response.json(), cookies }
  }
  try {
    let result = await call('/api/status')
    assert.equal(result.body.trustedDevice, false)
    result = await call('/api/login', 'POST', { password, otp: totp(secret), trustDevice: true })
    assert.equal(result.status, 200)
    assert.equal(result.body.trustedDevice, true)
    const session = result.cookies.find(v => v.startsWith('als_session=')).split(';')[0]
    const trusted = result.cookies.find(v => v.startsWith('als_trusted=')).split(';')[0]
    assert.ok(result.cookies.find(v => v.startsWith('als_trusted=')).includes('Max-Age=2592000'))
    assert.ok(!fs.readFileSync(path.join(dir, 'trusted-devices.json'), 'utf8').includes(trusted.slice(12)))
    result = await call('/api/status', 'GET', undefined, trusted)
    assert.equal(result.body.trustedDevice, true)
    result = await call('/api/login', 'POST', { password: 'senhaErrada', otp: '' }, trusted)
    assert.equal(result.status, 401)
    result = await call('/api/login', 'POST', { password, otp: '' })
    assert.equal(result.status, 401)
    result = await call('/api/login', 'POST', { password, otp: '' }, trusted)
    assert.equal(result.status, 200)
    result = await call('/api/security/devices', 'GET', undefined, `${session}; ${trusted}`)
    assert.equal(result.status, 200)
    assert.equal(result.body.devices.length, 1)
    assert.ok(result.body.currentId)
    result = await call('/api/security/forget-device', 'POST', {}, `${session}; ${trusted}`)
    assert.equal(result.status, 403)
    result = await call('/api/security/forget-device', 'POST', {}, `${session}; ${trusted}`, (await call('/api/session', 'GET', undefined, `${session}; ${trusted}`)).body.csrf)
    assert.equal(result.status, 200)
    result = await call('/api/login', 'POST', { password, otp: '' }, trusted)
    assert.equal(result.status, 401)
    assert.equal((await call('/api/status', 'GET', undefined, trusted)).body.trustedDevice, false)
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }) }
})
