import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'als-hosting-'))
process.env.ALS_DATA_DIR = dir
const { createServer } = await import('../src/server.js')
const { saveSpaceship } = await import('../src/integrations.js')
const { writeJson } = await import('../src/store.js')
const { dnsDiagnostics, publicIPv4, recordHost } = await import('../src/dns_diagnostics.js')
const { validateHosting } = await import('../src/hosting.js')
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
const zone = 'example.com', host = 'uaicortes.'+zone, ipv4 = '18.217.192.20'
const cmd = {displayName:'Uai Cortes',name:'uaicortes',type:'static',mode:'subdomain',host,zone,publicIp:ipv4}
const pubFetch = async url => {
  const type = url.searchParams.get('type'), name = url.searchParams.get('name')
  let answer = []
  if (type === 'NS') answer = [['ns1','ns2'].map(x=>x+'.nameservers.net'),2]
  else if (type === 'A') answer = [[ipv4],1]
  return {ok:true,json:async()=>({Status:0,Answer:answer.length ? answer[0].map(data=>({name:name+'.',data,type:answer[1],TTL:300})) : []})}
}
const direct = async (ip,asked,type,referral) => {
  assert.equal(ip,ipv4)
  if (referral) { assert.equal(asked,zone); assert.equal(type,'NS') }
  return {state:'answered',values:type === 'NS' ? ['ns1.nameservers.net','ns2.nameservers.net'] : [ipv4],ttl:120}
}

test('normaliza endereço e limita o DNS à zona e a IPv4 público', () => {
  assert.equal(validateHosting(cmd,'painel.example.com').domain,host)
  for(const bad of [{host:'painel.example.com'},{host:'fora.net'},{publicIp:'169.254.169.254'},{publicIp:'127.0.0.1'},{name:'iguatamaonline'}])
    assert.throws(()=>validateHosting({...cmd,...bad},'painel.example.com'))
  assert.throws(()=>validateHosting({...cmd,mode:'none'},'painel.example.com'))
  assert.equal(recordHost(zone,'@'),zone)
  assert.equal(recordHost(zone,'_dmarc'),'_dmarc.'+zone)
  assert.throws(()=>recordHost(zone,'https://example.net'))
  assert.equal(publicIPv4('100.64.0.1'),false)
  assert.equal(publicIPv4(ipv4),true)
})
test('diagnóstico separa registro pai, recursivos, A e AAAA', async () => {
  const report = await dnsDiagnostics(zone,{mode:'servers'},{fetchImpl:pubFetch,direct})
  assert.deepEqual(report.sources.map(x=>x.id),['parent-0','parent-1','google','cloudflare'])
  assert.equal(report.sources[0].ttl,120)
  assert.deepEqual(report.website.map(x=>[x.type,x.state]),[['A','answered'],['AAAA','empty']])
  await assert.rejects(dnsDiagnostics(zone,{host:'fora.net'}),/fora da zona/)
})
test('HTTP autenticado cria e acompanha projeto, isola ZIP e não sobrescreve DNS', async () => {
  const session = 'b'.repeat(64), csrf = 'c'.repeat(64), origin='http://localhost:8181'
  writeJson('sessions.json',{[createHash('sha256').update(session).digest('hex')]:{csrf,expires:Date.now()+60000}})
  saveSpaceship({apiKey:'fixture',apiSecret:'fixture'})
  const records=[{name:'@',type:'A',address:ipv4,ttl:1800}], projects=[], actions=[]
  let writes=0, nsProvider='basic', providerFail=false
  const fetchImpl = async (url,options) => {
    const parsed=new URL(url)
    if(parsed.pathname.endsWith('/v1/domains/'+zone)) return {ok:true,json:async()=>({name:zone,nameservers:{provider:nsProvider,hosts:['ns1.nameservers.net','ns2.nameservers.net']}})}
    if(parsed.pathname.includes('/v1/dns/records/')){
      if(options.method==='PUT'){
        writes++
        if (providerFail) return {ok:false,status:403}
        const body=JSON.parse(options.body)
        assert.equal(body.force,false)
        assert.equal(body.items.length,1)
        records.push(body.items[0])
        return {ok:true,status:204}
      }
      return {ok:true,json:async()=>({items:records,total:records.length})}
    }
    throw new Error(parsed.pathname)
  }
  const taskRunner=async task=>{
    actions.push(task)
    if(task.action==='create_project') projects.push({name:task.name,hostingDomain:task.domain,enabled:true,capabilities:{hosting:true}})
    if(task.action==='publish_project_zip'){
      const payload=fs.readFileSync(path.join(dir,task.upload))
      assert.equal(createHash('sha256').update(payload).digest('hex'),task.sha256)
      projects.find(p=>p.name===task.name).release={files:2,publishedAt:new Date().toISOString()}
      return {ok:true,files:2}
    }
    return {ok:true,httpsConfigured:true,path:'/var/www/projetos/'+task.name}
  }
  const server=createServer({taskRunner,spaceshipOptions:{fetchImpl},hostingCatalog:()=>projects,diagnosticOptions:{fetchImpl:pubFetch,direct},retryDelay:1})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base='http://127.0.0.1:'+server.address().port
  async function call(url, method='GET',payload,auth=true,withCsrf=true){
    const headers={...(auth?{Cookie:'als_session='+session}:{}),...(withCsrf?{'X-CSRF-Token':csrf}:{}),...(method !== 'GET'?{Origin:origin}:{}),
      ...(payload !== undefined ? {'Content-Type':Buffer.isBuffer(payload)?'application/zip':'application/json'}:{})}
    const res=await fetch(base+url,{method,headers,body:payload===undefined?undefined:Buffer.isBuffer(payload)?payload:JSON.stringify(payload)})
    return {status:res.status,body:await res.json()}
  }
  async function settled(name){
    for(let i=0;i<50;i++){
      const r=await call('/api/projects/'+name+'/hosting')
      if(!r.body.working) return r.body
      await sleep(10)
    }
    throw new Error('provisionamento simulado não terminou')
  }
  try {
    assert.equal((await call('/api/hosting/projects','POST',cmd,false)).status,401)
    assert.equal((await call('/api/hosting/projects','POST',cmd,true,false)).status,403)
    assert.equal((await call('/api/hosting/projects','POST',cmd)).status,201)
    const hosted=await settled('uaicortes')
    assert.equal(hosted.dns.state,'confirmed')
    assert.equal(hosted.tls.state,'active')
    assert.equal(writes,1)
    assert.equal(records.at(-1).name,'uaicortes')
    assert.equal(actions[1].action,'enable_project_tls')
    assert.equal((await call('/api/projects/uaicortes/hosting/dns')).body.expected[0],ipv4)
    assert.equal((await call('/api/projects/ficticio/hosting/upload','POST',Buffer.alloc(50))).status,404)
    assert.equal((await call('/api/projects/uaicortes/hosting/upload','POST',Buffer.alloc(50))).status,200)
    assert.equal((await call('/api/projects/uaicortes/hosting')).body.release.files,2)
    assert.equal(fs.readdirSync(dir).filter(file=>file.startsWith('upload-')).length,0)
    const conflict={...cmd,name:'outro',publicIp:'8.8.4.4'}
    assert.equal((await call('/api/hosting/projects','POST',conflict)).status,409)
    assert.equal(writes,1)
    assert.equal(projects.length,1)
    assert.equal((await call('/api/projects/uaicortes/hosting/retry','POST',{})).status,202)
    assert.equal((await settled('uaicortes')).tls.state,'active')
    assert.equal(writes,1,'retomar não duplica DNS')
    providerFail=true
    const other={...cmd,name:'pingado',host:'pingado.'+zone}
    assert.equal((await call('/api/hosting/projects','POST',other)).status,201)
    assert.equal((await settled('pingado')).dns.state,'failed')
    assert.equal(projects.length,2,'projeto local permanece se DNS falhar')
    nsProvider='custom'
    assert.equal((await call('/api/hosting/projects','POST',{...cmd,name:'manual',host:'manual.'+zone,publicIp:'8.8.4.4'})).status,201)
    assert.equal((await settled('manual')).dns.state,'manual')
    assert.equal(writes,2)
  } finally {await new Promise(resolve=>server.close(resolve))}
})
