import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-update-upload-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const password = 'SenhaForte!Teste-217'
const secret = base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({ passwordHash: hashPassword(password), totpSecret: secret }))

test('upload ZIP: sessão, CSRF, hash, tamanho e limite restrito', async () => {
  const calls = []
  const server = createServer({ taskRunner: async task => {
    if (task.upload) {
      const raw = fs.readFileSync(path.join(dir, task.upload))
      assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), task.sha256)
      assert.equal(raw.length, 1024)
    }
    calls.push(task)
    return { ok: true, operationId: '01'.repeat(12) }
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const headers = { Origin: 'http://localhost:8181', 'Content-Type': 'application/zip' }
  const file = Buffer.alloc(1024, 0x42)
  try {
    const login = await fetch(url + '/api/login', {
      method: 'POST', headers: { Origin: 'http://localhost:8181', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, otp: totp(secret) })
    })
    assert.equal(login.status, 200)
    const { csrf } = await login.json()
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const send = (payload, extra = {}) => fetch(url + '/api/updates/upload', {
      method: 'POST', headers: { ...headers, Cookie: cookie, 'X-CSRF-Token': csrf,
        ...extra }, body: payload
    })
    assert.equal((await fetch(url + '/api/updates/upload', { method: 'POST', headers, body: file })).status, 401)
    assert.equal((await send(file, { 'X-CSRF-Token': 'invalido' })).status, 403)
    assert.equal((await send(file, { 'Content-Type': 'text/plain' })).status, 415)
    assert.equal((await send(Buffer.alloc(200))).status, 413)
    const accepted = await send(file)
    assert.equal(accepted.status, 202)
    assert.equal((await accepted.json()).operationId, '01'.repeat(12))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].action, 'start_update')
    assert.match(calls[0].upload, /^upload-[0-9a-f]{24}\.zip$/)
    assert.equal(fs.existsSync(path.join(dir, calls[0].upload)), false, 'arquivo temporário removido após handoff')
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }) }
})
