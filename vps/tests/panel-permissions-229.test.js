import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'als-panel-229-'))
process.env.ALS_DATA_DIR=folder
const {createServer}=await import('../src/server.js')
const password='Senha-Exemplo-229!'
const secret=base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(folder,'admin.json'),JSON.stringify({passwordHash:hashPassword(password),totpSecret:secret}))

test('perfil configurado exclusivamente por login e CSRF, sem caminho absoluto nem usuário arbitrário',async()=>{
 const tasks=[]
 const server=createServer({taskRunner:async task=>{tasks.push(task);return {ok:true,configured:true,files:[],name:task.name}}})
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
 const base=`http://127.0.0.1:${server.address().port}`
 const post=(url,data,cookie='',csrf='')=>fetch(base+url,{method:'POST',headers:{Origin:'http://localhost:8181','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(data)})
 try {
  assert.equal((await fetch(base+'/api/projects/iguatamaonline/permissions/catalog')).status,401)
  const login=await post('/api/login',{password,otp:totp(secret)})
  assert.equal(login.status,200)
  const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf
  assert.equal((await fetch(base+'/api/projects/iguatamaonline/permissions/catalog',{headers:{Cookie:cookie}})).status,200)
  assert.equal(tasks.at(-1).mode,'discover')
  const route='/api/projects/iguatamaonline/permissions/profile',payload={files:['VERSION','app/updater.php'],phpUser:'www-data'}
  assert.equal((await post(route,payload,cookie)).status,403)
  assert.equal((await post(route,{...payload,root:'/etc'},cookie,csrf)).status,400)
  assert.equal((await post(route,{...payload,files:[]},cookie,csrf)).status,400)
  assert.equal((await post(route,{...payload,phpUser:'root;sh'},cookie,csrf)).status,400)
  assert.equal((await post('/api/projects/iguatama-teste/permissions/profile',payload,cookie,csrf)).status,404)
  assert.equal((await post(route,payload,cookie,csrf)).status,200)
  assert.deepEqual(tasks.at(-1),{action:'other_project_permissions',name:'iguatamaonline',mode:'configure',files:payload.files,phpUser:payload.phpUser})
  assert.equal((await post('/api/projects/iguatamaonline/permissions',{mode:'allow'},cookie,csrf)).status,200)
  assert.equal(tasks.at(-1).mode,'allow')
 } finally {await new Promise(ok=>server.close(ok));fs.rmSync(folder,{recursive:true,force:true})}
})
