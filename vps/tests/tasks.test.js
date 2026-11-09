import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { totp } from '../src/security.js'

// Processo de teste separado: não existe sudo; somente o executor injetado recebe tarefas.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-tasks-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')

test('tarefas: exige autenticação, CSRF, esquema estrito e permissão explícita', async () => {
  const received = []
  const server = createServer({ taskRunner: async task => {
    received.push(task)
    return { ok: true, name: task.name, enabled: task.enabled, unchanged: false }
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const bootstrap = 'f'.repeat(48)
  fs.writeFileSync(path.join(dir, 'bootstrap-token'), bootstrap, { mode: 0o600 })
  async function call(endpoint, method = 'GET', payload, cookie, csrf) {
    const response = await fetch(url + endpoint, { method, headers: {
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json', Origin: 'http://localhost:8181' }),
      ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    }, body: payload === undefined ? undefined : JSON.stringify(payload) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') }
  }
  try {
    const begin = await call('/api/setup/begin', 'POST', { bootstrap })
    assert.equal(begin.status, 200)
    const finish = await call('/api/setup/finish', 'POST', { bootstrap, challenge: begin.body.challenge, password: 'ForteSenha$987654321', otp: totp(begin.body.secret) })
    assert.equal(finish.status, 200)
    // Uma mesma senha TOTP deve ser reutilizada no teste de replay, mesmo se o relógio mudar de janela.
    const loginOtp = totp(begin.body.secret)
    const login = await call('/api/login', 'POST', { password: 'ForteSenha$987654321', otp: loginOtp })
    assert.equal(login.status, 200)
    const cookie = login.cookie.split(';')[0]
    const csrf = login.body.csrf
    const replay = await call('/api/login', 'POST', { password: 'ForteSenha$987654321', otp: loginOtp })
    assert.equal(replay.status, 401)
    const action = { action: 'set_site_state', name: 'site-novo', enabled: false }
    assert.equal((await call('/api/tasks', 'POST', action)).status, 401)
    assert.equal((await call('/api/tasks', 'POST', action, cookie)).status, 403)
    assert.equal((await call('/api/tasks', 'POST', { ...action, enabled: 'false' }, cookie, csrf)).status, 400)
    assert.equal((await call('/api/tasks', 'POST', { ...action, command: 'id' }, cookie, csrf)).status, 400)
    assert.equal((await call('/api/tasks', 'POST', { action: 'create_project', name: 'site-novo', type: 'static', bash: 'id' }, cookie, csrf)).status, 400)
    assert.equal(received.length, 0)
    const result = await call('/api/tasks', 'POST', action, cookie, csrf)
    assert.equal(result.status, 200)
    assert.deepEqual(received, [action])
    assert.equal((await call('/api/tasks', 'POST', { action: 'set_site_state', name: 'site-novo', enabled: true }, cookie, csrf)).status, 200)
    assert.equal(received.length, 2)
    assert.equal((await call('/api/tasks', 'POST', { action: 'validate_nginx', command: 'rm -rf /' }, cookie, csrf)).status, 400)
    assert.equal((await call('/api/tasks', 'POST', { action: 'backup_project', name: 'site-novo', passphrase: 'curta' }, cookie, csrf)).status, 400)
    assert.equal((await call('/api/tasks', 'POST', { action: 'backup_project', name: 'site-novo', passphrase: 'SecretBackupPhrase12345', command: 'id' }, cookie, csrf)).status, 400)
    assert.equal((await call('/api/tasks', 'POST', { action: 'validate_nginx' }, cookie, csrf)).status, 200)
    const backups = await call('/api/backups', 'GET', undefined, cookie)
    assert.equal(backups.status, 200)
    assert.equal((await call('/api/backups', 'GET')).status, 401)
    assert.equal((await call('/api/tasks', 'POST', { action: 'backup_project', name: 'site-novo', passphrase: 'SecretBackupPhrase12345' }, cookie)).status, 403)
    assert.equal((await call('/api/tasks', 'POST', { action: 'backup_project', name: 'site-novo', passphrase: 'SecretBackupPhrase12345' }, cookie, csrf)).status, 200)
    assert.equal(received.length, 5)
    const audit = await call('/api/audit', 'GET', undefined, cookie)
    assert.equal(audit.status, 200)
    assert.ok(audit.body.events.some(e => e.event === 'task_success' && e.enabled === 'false' && e.name === 'site-novo'))
    assert.ok(!JSON.stringify(audit.body).includes('SecretBackupPhrase12345'))
  } finally {
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
