import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'als-ext-218-'))
process.env.ALS_DATA_DIR = folder
const { createServer } = await import('../src/server.js')
const password = 'SenhaForte!Projeto218'
const secret = base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(folder, 'admin.json'), JSON.stringify({ passwordHash: hashPassword(password), totpSecret: secret }))

test('projetos externos: sessão, CSRF, confirmação sem reautenticação e escopo fixo', async () => {
  const tasks = []
  const server = createServer({ taskRunner: async task => {
    tasks.push(task)
    if (task.action === 'inspect_external_project') return { ok: true, name: 'iguatamaonline', files: [], backups: [] }
    return { ok: true, operationId: 'abc'.repeat(8), mode: task.mode }
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const origin = 'http://localhost:8181'
  const post = (uri, data, cookie, csrf) => fetch(base + uri, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {})
  }, body: JSON.stringify(data) })
  try {
    const suffix = '/api/projects/iguatamaonline'
    assert.equal((await fetch(base + suffix + '/maintenance')).status, 401)
    const login = await post('/api/login', { password, otp: totp(secret) })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const csrf = (await login.json()).csrf
    const scan = await fetch(base + suffix + '/maintenance', { headers: { Cookie: cookie } })
    assert.equal(scan.status, 200)
    assert.equal((await scan.json()).name, 'iguatamaonline')
    assert.equal((await post(suffix + '/maintenance', { mode: 'allow' }, cookie)).status, 403)
    assert.equal((await post(suffix + '/maintenance', { mode: 'remove' }, cookie, csrf)).status, 400)
    assert.equal((await post(suffix + '/maintenance', { mode: 'allow', password, otp: totp(secret) }, cookie, csrf)).status, 400, 'credenciais adicionais não são aceitas')
    assert.equal((await post(suffix + '/maintenance', { mode: 'allow', otp: 'xxxxxx' }, cookie, csrf)).status, 400)
    const approved = await post(suffix + '/maintenance', { mode: 'allow' }, cookie, csrf)
    assert.equal(approved.status, 200)
    assert.equal(tasks.at(-1).action, 'project_permissions')
    assert.equal(tasks.at(-1).name, 'iguatamaonline')
    assert.equal((await post(suffix + '/maintenance', { mode: 'restore' }, cookie, csrf)).status, 200)
    assert.equal((await post(suffix + '/update/github', { repo: 'invalido/../../etc' }, cookie, csrf)).status, 400)
    assert.equal((await post(suffix + '/update/github', { repo: 'owner/repo', password, otp: '123456' }, cookie, csrf)).status, 400)
    assert.equal((await post(suffix + '/update/github', { repo: 'owner/repo' }, cookie, csrf)).status, 202)
    const status = await fetch(base + suffix + '/update/status', { headers: { Cookie: cookie } })
    assert.equal(status.status, 200)
    assert.equal((await status.json()).status, null)
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(folder, { recursive: true, force: true }) }
})
