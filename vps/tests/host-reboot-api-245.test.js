import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
const root=fs.mkdtempSync(path.join(os.tmpdir(),'als-host-reboot-'))
process.env.ALS_DATA_DIR=root
const {createServer}=await import('../src/server.js')
test('reinício usa sessão, origem, CSRF, confirmação e apenas a tarefa fixa',async()=>{
  const token='a'.repeat(64), csrf='d'.repeat(64)
  const hash=crypto.createHash('sha256').update(token).digest('hex')
  fs.writeFileSync(path.join(root,'sessions.json'),JSON.stringify({[hash]:{csrf,expires:Date.now()+60000}}))
  let state='idle', ready, finish
  const called=[]
  const blocking=new Promise(resolve=>{finish=resolve})
  const started=new Promise(resolve=>{ready=resolve})
  const server=createServer({taskRunner:async task=>{
    called.push(task)
    if(task.action==='validate_nginx'){ready();await blocking;return {ok:true,valid:true}}
    state='scheduled'
    return {ok:true}
  },hostStatus:()=>({state,canCheckBoot:true}),siteHealth:async()=>({source:'loopback',sites:[]})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+server.address().port
  const call=(url,data,auth=true,headers={})=>fetch(base+url,{method:data?'POST':'GET',headers:{
    ...(auth?{Cookie:'als_session='+token}:{}),
    ...(data?{'Content-Type':'application/json',Origin:'http://localhost:8181','X-CSRF-Token':csrf}:{}),...headers
  },body:data?JSON.stringify(data):undefined})
  try {
    assert.equal((await call('/api/host/sites',null,false)).status,401)
    const endpoint='/api/host/reboot'
    assert.equal((await call(endpoint,{confirm:'REINICIAR'},false)).status,401)
    assert.equal((await call(endpoint,{confirm:'REINICIAR'},true,{'X-CSRF-Token':'wrong'})).status,403)
    assert.equal((await call(endpoint,{confirm:'sim'})).status,400)
    const active=call('/api/tasks',{action:'validate_nginx'})
    await started
    assert.equal((await call(endpoint,{confirm:'REINICIAR'})).status,409)
    finish()
    assert.equal((await active).status,200)
    const executed=await call(endpoint,{confirm:'REINICIAR'})
    assert.equal(executed.status,202)
    assert.equal((await executed.json()).state,'scheduled')
    assert.deepEqual(called,[{action:'validate_nginx'},{action:'schedule_host_reboot'}])
    assert.equal((await call('/api/tasks',{action:'validate_nginx'})).status,409)
    state='rebooted'
    assert.equal((await (await call(endpoint)).json()).state,'rebooted')
  } finally{
    finish()
    await new Promise(resolve=>server.close(resolve))
    fs.rmSync(root,{recursive:true,force:true})
  }
})
