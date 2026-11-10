import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { base32, hashPassword, totp } from '../src/security.js'

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'al-explorer-231-'))
process.env.ALS_DATA_DIR=tmp
const {createServer}=await import('../src/server.js')
const password='Teste-Explorer-231!',secret=base32(crypto.randomBytes(20))
fs.writeFileSync(path.join(tmp,'admin.json'),JSON.stringify({passwordHash:hashPassword(password),totpSecret:secret}))

test('rotas do explorador exigem sessão CSRF e ignoram caminhos arbitrários',async()=>{
 const tasks=[]
 const server=createServer({taskRunner:async t=>{tasks.push(t);return {ok:true,items:[],total:0}}})
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok))
 const base=`http://127.0.0.1:${server.address().port}`
 const post=(url,data,cookie='',csrf='')=>fetch(base+url,{method:'POST',headers:{Origin:'http://localhost:8181','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(data)})
 try {
  assert.equal((await fetch(base+'/api/projects/site-a/files')).status,401)
  const login=await post('/api/login',{password,otp:totp(secret)})
  assert.equal(login.status,200)
  const cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf
  const query=await fetch(base+'/api/projects/site-a/files?dir=public%2Fcss&offset=0',{headers:{Cookie:cookie}})
  assert.equal(query.status,200)
  assert.deepEqual(tasks.at(-1),{action:'project_file_explorer',name:'site-a',mode:'browse',directory:'public/css',offset:0})
  assert.equal((await fetch(base+'/api/projects/iguatama-teste/files',{headers:{Cookie:cookie}})).status,404)
  assert.equal((await fetch(base+'/api/projects/site-a/files?foo=bar',{headers:{Cookie:cookie}})).status,400)
  const data={path:'public/index.php',inode:'123456',expectedMode:420,newMode:416}
  const route='/api/projects/site-a/files/mode'
  assert.equal((await post(route,data,cookie)).status,403)
  assert.equal((await post(route,{...data,root:'/etc'},cookie,csrf)).status,400)
  assert.equal((await post(route,{...data,newMode:'777'},cookie,csrf)).status,400)
  assert.equal((await post(route,data,cookie,csrf)).status,200)
  assert.deepEqual(tasks.at(-1),{action:'project_file_explorer',name:'site-a',mode:'chmod',path:'public/index.php',inode:'123456',expectedMode:420,newMode:416})
 } finally {await new Promise(ok=>server.close(ok));fs.rmSync(tmp,{recursive:true,force:true})}
})

test('explorador tem elementos para navegar, modal de permissões, ajuda e proteção',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
 const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
 const css=fs.readFileSync(new URL('../public/style.css',import.meta.url),'utf8')
 for(const id of ['explorer-items','explorer-crumbs','explorer-search','explorer-refresh','explorer-more','explorer-mode-dialog','explorer-mode-save','general-permissions-config'])
   assert.ok(html.includes(`id="${id}"`),id)
 assert.match(js,/function explorerBrowse/)
 assert.match(js,/function explorerOpenMode/)
 assert.match(js,/api\/projects\/\$\{encodeURIComponent\(explorerProject\)\}\/files\/mode/)
 assert.match(css,/\.explorer-entry/)
})
