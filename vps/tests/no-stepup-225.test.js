import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-no-stepup-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const secret = base32(crypto.randomBytes(20))
const password = 'SenhaDeLogin#202625'
fs.writeFileSync(path.join(dir, 'admin.json'), JSON.stringify({passwordHash: hashPassword(password), totpSecret: secret}))

test('pós-login: endpoints privilegiados não pedem nova senha/TOTP, mas exigem sessão e CSRF', async () => {
  const tasks = []
  const server = createServer({taskRunner: async task => {tasks.push(task);return {ok:true,operationId:'teste'}}})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const root = `http://127.0.0.1:${server.address().port}`
  const post = async (route, value, cookie, csrf, origin='http://localhost:8181') => {
    const res = await fetch(root + route,{method:'POST', headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(value)})
    return {status:res.status,body:await res.json(),headers:res.headers}
  }
  try {
    const login = await post('/api/login',{password,otp:totp(secret)})
    assert.equal(login.status,200)
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const csrf = login.body.csrf
    const cases = [
      ['/api/dependencies/install',{package:'php-intl'},202],
      ['/api/updates/configure',{repo:'owner/repo'},200],
      ['/api/projects/iguatamaonline/maintenance',{mode:'backup_code'},200],
      ['/api/projects/iguatamaonline/update/github',{repo:'owner/repo'},202]
    ]
    for (const [url, payload, code] of cases) {
      assert.equal((await post(url,payload)).status,401,url+' sem sessão')
      assert.equal((await post(url,payload,cookie)).status,403,url+' sem CSRF')
      assert.equal((await post(url,payload,cookie,csrf,'https://evil.invalid')).status,403,url+' origem diferente')
      assert.equal((await post(url,payload,cookie,csrf)).status,code,url+' autenticado')
      assert.equal((await post(url,{...payload,password,otp:'123456'},cookie,csrf)).status,400,url+' campos extras')
    }
    assert.equal(tasks.length,3)
    assert.equal((await post('/api/security/revoke-all',{},cookie)).status,403)
    assert.equal((await post('/api/security/revoke-all',{password,otp:'123456'},cookie,csrf)).status,400)
    assert.equal((await post('/api/security/revoke-all',{},cookie,csrf)).status,200)
    assert.equal((await post('/api/dependencies/install',{package:'php-intl'},cookie,csrf)).status,401)
  } finally { await new Promise(resolve=>server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}) }
})

test('todos os formulários pós-login da VPS estão sem senha ou OTP', () => {
  const html = fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
  for (const id of ['external-auth-form','package-form','update-repo-form','revoke-devices','spaceship-confirm-form','update-apply-form']) {
    const start = html.indexOf(`id="${id}"`)
    assert.ok(start>=0,id)
    const snippet=html.slice(start,html.indexOf('</form>',start))
    assert.doesNotMatch(snippet, /name="password"|name="otp"|external-otp/,id)
  }
  const serverSource = fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8')
  const afterLogin = serverSource.slice(serverSource.indexOf('const sess = sessionFrom(req)'))
  assert.doesNotMatch(afterLogin,/verifyPassword\(|matchingTotpStep\(|x-update-otp|lastTotpStep/)
})
