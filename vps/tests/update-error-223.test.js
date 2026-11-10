import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-update-err-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const secret = base32(crypto.randomBytes(20))
const password = 'TesteSeguro#1234567890'
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ passwordHash: hashPassword(password), totpSecret: secret }))

test('falha do executor restrito aparece como 422 com o motivo real, não como "Falha interna"', async () => {
  const reason = "[Errno 30] Read-only file system: '/etc/alsistemas-vps/update-request.json'"
  const server = createServer({ taskRunner: async () => { throw new Error(reason) } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  async function call(endpoint, method = 'GET', payload, cookie, csrf, raw) {
    const res = await fetch(url + endpoint, { method, headers: {
      Origin: 'http://localhost:8181',
      'Content-Type': raw ? 'application/zip' : 'application/json',
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    }, body: raw ? payload : payload !== undefined ? JSON.stringify(payload) : undefined })
    return { code: res.status, body: await res.json(), cookies: res.headers.getSetCookie() }
  }
  try {
    const login = await call('/api/login', 'POST', { password, otp: totp(secret) })
    const cookie = login.cookies.find(c => c.startsWith('als_session=')).split(';')[0]
    const csrf = login.body.csrf
    const config = await call('/api/updates/configure', 'POST', { repo: 'owner/repo' }, cookie, csrf)
    assert.equal(config.code, 200)
    const apply = await call('/api/updates/apply', 'POST', {}, cookie, csrf)
    assert.equal(apply.code, 422)
    assert.equal(apply.body.error, reason)
    const upload = await call('/api/updates/upload', 'POST', Buffer.alloc(2048, 1), cookie, csrf, true)
    assert.equal(upload.code, 422)
    assert.equal(upload.body.error, reason)
    assert.deepEqual(fs.readdirSync(dir).filter(name => name.startsWith('upload-')), [], 'upload temporário deve ser removido')
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }) }
})
