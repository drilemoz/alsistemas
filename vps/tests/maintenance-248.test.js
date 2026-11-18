import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const root=mkdtempSync(join(tmpdir(),'als-maintenance-'))
process.env.ALS_DATA_DIR=root
const {createReleaseCache}=await import('../src/updates.js')
const {rebootState}=await import('../src/host_dashboard.js')
const {createServer}=await import('../src/server.js')

test('consulta une abas simultâneas, respeita 30 min e não trata erro como versão atual',async()=>{
  let calls=0, ts=Date.now()
  const cache=createReleaseCache({now:()=>ts,load:async(installed,flags,repo)=>{
    calls++
    if(repo==='falha/repo') throw new Error('rede')
    return {installed,repo,latest:'2.0.49',available:true,assetsReady:true}
  }})
  const [a,b]=await Promise.all([cache.read('2.0.48','owner/repo'),cache.read('2.0.48','owner/repo')])
  assert.equal(calls,1)
  assert.equal(a,b)
  ts+=1_799_000
  assert.equal(await cache.read('2.0.48','owner/repo'),a)
  ts+=1001
  await cache.read('2.0.48','owner/repo')
  assert.equal(calls,2)
  const failed=await cache.read('2.0.48','falha/repo')
  assert.equal(failed.checkError,true)
  assert.equal(failed.available,false)
  assert.equal(await cache.read('2.0.48','falha/repo',{force:true}),failed)
  assert.equal(calls,3)
})
test('API autenticada anuncia a Release, e somente a versão revisada é encaminhada ao instalador',async()=>{
  const token='e'.repeat(64), csrf='f'.repeat(64)
  const hash=createHash('sha256').update(token).digest('hex')
  writeFileSync(join(root,'sessions.json'),JSON.stringify({[hash]:{csrf,expires:Date.now()+60_000}}))
  const current=readFileSync(new URL('../../VERSION',import.meta.url),'utf8').trim()
  const next=current.replace(/\d+$/,v=>String(Number(v)+1))
  const unexpected=current.replace(/\d+$/,v=>String(Number(v)+2))
  let lookups=0
  const tasks=[]
  const server=createServer({releaseLookup:async (installed,opts,repo)=>{
    lookups++
    return {installed,repo,available:true,latest:next,assetsReady:true}
  },taskRunner:async task=>{tasks.push(task);return {ok:true}},hostStatus:()=>({state:'idle'})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+server.address().port
  const headers={Cookie:'als_session='+token}
  const post=body=>fetch(base+'/api/updates/apply',{method:'POST',headers:{...headers,Origin:'http://localhost:8181','Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)})
  try {
    assert.equal((await fetch(base+'/api/updates/availability')).status,401)
    const info=await (await fetch(base+'/api/updates/availability',{headers})).json()
    assert.equal(info.latest,next,JSON.stringify(info))
    assert.ok(info.checkedAt)
    assert.equal((await post({version:unexpected})).status,409)
    assert.equal((await post({version:next})).status,202)
    assert.deepEqual(tasks,[{action:'start_update',version:next,repo:'drilemoz/alsistemas'}])
    assert.equal(lookups,1)
    for (const p of ['maintenance-worker.js','maintenance-offline.html','maintenance-offline.js','maintenance-offline.css']) {
      const response=await fetch(base+'/'+p)
      assert.equal(response.status,200)
      assert.equal(response.headers.get('cache-control'),'no-store')
      await response.arrayBuffer()
    }
  } finally {
    await new Promise(resolve=>server.close(resolve))
    rmSync(root,{recursive:true,force:true})
  }
})
test('contagem vem dos horários do servidor e sessão web voltar não confirma novo boot',()=>{
  const boot='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const now=Date.now(), record={boot,phase:'scheduled',requestedAt:now/1000}
  const start=rebootState(record,boot,now)
  assert.equal(Date.parse(start.scheduledFor)-Date.parse(start.requestedAt),8000)
  assert.equal(Date.parse(start.deadlineAt)-Date.parse(start.requestedAt),240000)
  assert.equal(rebootState(record,boot,now+241000).state,'unconfirmed')
  assert.equal(rebootState(record,other,now+30000).state,'rebooted')
  const worker=readFileSync(new URL('../public/maintenance-worker.js',import.meta.url),'utf8')
  assert.match(worker,/req.mode!=='navigate'\|\|url.pathname!=='\/'/)
  assert.doesNotMatch(worker,/\/api\/|cache\.put/)
})
