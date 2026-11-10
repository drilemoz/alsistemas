import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'als-permission-228-'))
process.env.ALS_DATA_DIR = folder
const {createServer} = await import('../src/server.js')
const password='SenhaComplexa-128!'
const secret=base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(folder, 'admin.json'), JSON.stringify({passwordHash:hashPassword(password),totpSecret:secret}))
test('outras permissões dependem de sessão, CSRF e campos exatos', async () => {
  const tasks=[]
  const server=createServer({taskRunner:async task => { tasks.push(task); return {ok:true,name:task.name,configured:true,files:[]}}})
  await new Promise(r=>server.listen(0, '127.0.0.1',r))
  const base=`http://127.0.0.1:${server.address().port}`
  const post=(endpoint, data, cookie='', csrf='')=>fetch(base+endpoint,{method:'POST',headers:{Origin:'http://localhost:8181','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(data)})
  try {
    assert.equal((await fetch(base+'/api/projects/site-a/permissions')).status,401)
    const l=await post('/api/login',{password,otp:totp(secret)})
    assert.equal(l.status,200)
    const cookie=l.headers.get('set-cookie').split(';')[0]
    const csrf=(await l.json()).csrf
    const scan=await fetch(base+'/api/projects/site-a/permissions',{headers:{Cookie:cookie}})
    assert.equal(scan.status,200)
    assert.deepEqual(tasks.at(-1),{action:'other_project_permissions',name:'site-a',mode:'inspect'})
    assert.equal((await post('/api/projects/site-a/permissions',{mode:'allow'},cookie)).status,403)
    assert.equal((await post('/api/projects/site-a/permissions',{mode:'allow',paths:['/etc/passwd']},cookie,csrf)).status,400)
    assert.equal((await post('/api/projects/site-a/permissions',{mode:'allow',phpUser:'root'},cookie,csrf)).status,400)
    assert.equal((await post('/api/projects/iguatama-teste/permissions',{mode:'allow'},cookie,csrf)).status,404)
    assert.equal((await post('/api/projects/site-a/permissions',{mode:'allow'},cookie,csrf)).status,200)
    assert.deepEqual(tasks.at(-1),{action:'other_project_permissions',name:'site-a',mode:'allow'})
  } finally { await new Promise(r=>server.close(r));fs.rmSync(folder,{recursive:true,force:true}) }
})
