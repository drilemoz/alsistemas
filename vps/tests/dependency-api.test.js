import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-dependency-api-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const password = 'SenhaTestes$22222222222'
const secret = base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(dir,'admin.json'), JSON.stringify({passwordHash: hashPassword(password), totpSecret: secret}))

test('API de pacotes exige sessão, CSRF, senha, TOTP e allowlist', async () => {
  const received = []
  const server = createServer({taskRunner: async task => {
    received.push(task)
    return {ok:true,started:true,message:'Instalação solicitada'}
  }})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  async function call(route,method='GET',payload,cookie,csrf) {
    const response = await fetch(base+route,{method,headers:{
      ...(payload===undefined?{}:{'Content-Type':'application/json',Origin:'http://localhost:8181'}),
      ...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})
    },body:payload===undefined?undefined:JSON.stringify(payload)})
    return {status:response.status,body:await response.json(),headers:response.headers}
  }
  try {
    assert.equal((await call('/api/dependencies')).status,401)
    const login = await call('/api/login','POST',{password,otp:totp(secret)})
    assert.equal(login.status,200)
    const cookie=login.headers.getSetCookie().find(v=>v.startsWith('als_session=')).split(';')[0]
    const csrf=login.body.csrf
    const inv=await call('/api/dependencies','GET',undefined,cookie)
    assert.equal(inv.status,200)
    assert.equal(inv.body.packages.length,8)
    assert.equal((await call('/api/dependencies/install','POST',{package:'composer',password,otp:totp(secret)},cookie)).status,403)
    assert.equal((await call('/api/dependencies/install','POST',{package:'curl; rm -rf /',password,otp:totp(secret)},cookie,csrf)).status,400)
    assert.equal((await call('/api/dependencies/install','POST',{package:'composer',password,otp:totp(secret),cmd:'id'},cookie,csrf)).status,400)
    assert.equal((await call('/api/dependencies/install','POST',{package:'composer',password:'errada',otp:totp(secret)},cookie,csrf)).status,401)
    assert.equal(received.length,0)
    const admin = JSON.parse(fs.readFileSync(path.join(dir,'admin.json'),'utf8'))
    admin.lastTotpStep = -1
    fs.writeFileSync(path.join(dir,'admin.json'),JSON.stringify(admin))
    const installed=await call('/api/dependencies/install','POST',{package:'php-zip',password,otp:totp(secret)},cookie,csrf)
    assert.equal(installed.status,202)
    assert.deepEqual(received,[{action:'install_package',package:'php-zip'}])
    const audit=await call('/api/audit','GET',undefined,cookie)
    assert.ok(audit.body.events.some(e=>e.event==='package_install_requested' && e.package==='php-zip'))
  } finally { await new Promise(resolve=>server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}) }
})
