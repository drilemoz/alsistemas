import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {EventEmitter} from 'node:events'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'als-term-api-'))
process.env.ALS_DATA_DIR=dir
process.env.ALS_ORIGIN='https://panel.example.test'
const {createServer}=await import('../src/server.js')
const {hashPassword,base32,totp}=await import('../src/security.js')
const secret=base32(crypto.randomBytes(20)), password='TesteDeTerminal#2026'
fs.writeFileSync(path.join(dir,'admin.json'),JSON.stringify({passwordHash:hashPassword(password),totpSecret:secret}))
class FakeSocket extends EventEmitter {writableLength=0;written=[];write(v){this.written.push(v);return true}destroy(){this.destroyed=true}}
test('API terminal exige sessão, origem, CSRF e confirmação; fecha no logout',async()=>{
 let socket
 const server=createServer({terminalOptions:{connect:()=>{socket=new FakeSocket();queueMicrotask(()=>socket.emit('connect'));return socket}}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`
 const post=async(url,value,cookie,csrf,origin='https://panel.example.test')=>{
  const res=await fetch(root+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(value)});return {status:res.status,body:await res.json(),headers:res.headers}
 }
 try{
  assert.equal((await post('/api/terminal/open',{confirm:'ABRIR'})).status,401)
  const login=await post('/api/login',{password,otp:totp(secret)});assert.equal(login.status,200)
  const cookie=login.headers.get('set-cookie').split(';')[0],csrf=login.body.csrf
  assert.equal((await post('/api/terminal/open',{confirm:'ABRIR'},cookie)).status,403)
  assert.equal((await post('/api/terminal/open',{confirm:'ABRIR'},cookie,csrf,'https://other.example')).status,403)
  assert.equal((await post('/api/terminal/open',{},cookie,csrf)).status,400)
  const opened=await post('/api/terminal/open',{confirm:'ABRIR'},cookie,csrf);assert.equal(opened.status,200)
  const route='/api/terminal/'+opened.body.id
  socket.emit('data',Buffer.from('hello'))
  assert.equal((await post(route+'/poll',{cursor:0},cookie,csrf)).body.output,'hello')
  assert.equal((await post(route+'/input',{value:'id\n'},cookie,csrf)).status,200)
  assert.deepEqual(socket.written,['id\n'])
  assert.equal((await post('/api/logout',{},cookie,csrf)).status,200);assert.equal(socket.destroyed,true)
  assert.equal((await post(route+'/poll',{cursor:0},cookie,csrf)).status,401)
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true})}
})
