import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'als-domains-237-'))
process.env.ALS_DATA_DIR = dir
const { saveSpaceship } = await import('../src/integrations.js')
const { listDomains, changeDomainSettings, changePointer, redirectDiagnostics, redirectSource, publicIpv4 } = await import('../src/domains.js')
const { createServer } = await import('../src/server.js')
const { writeJson } = await import('../src/store.js')
saveSpaceship({apiKey:'sample-key',apiSecret:'sample-secret'})
after(() => fs.rmSync(dir,{recursive:true,force:true}))
const account = { name:'example.com', expirationDate:'2027-11-18T12:00:00Z', lifecycleStatus:'registered', autoRenew:true, nameservers:{provider:'basic',hosts:['ns2.example.com','ns1.example.com']}, contacts:{notForUi:'redacted'} }
const ok = (value,status=200) => ({ok:true,status,json:async()=>value})
const denied = status => ({ok:false,status})
const oldA = {name:'ir',type:'A',address:'192.0.2.30',ttl:300,group:{type:'custom'}}
const oldC = {name:'ir',type:'CNAME',cname:'old.example.net',ttl:300,group:{type:'custom'}}

test('lista domínios paginados, canoniza servidores e não retorna contatos', async () => {
  const data = await listDomains(25,{fetchImpl:async (url,opt) => {
    assert.match(url,/\/v1\/domains\?take=25&skip=25$/)
    assert.equal(opt.headers['X-API-Key'],'sample-key')
    return ok({items:[account],total:77})
  }})
  assert.equal(data.next,50)
  assert.equal(data.items[0].expirationDate,account.expirationDate)
  assert.deepEqual(data.items[0].nameservers.hosts,['ns1.example.com','ns2.example.com'])
  assert.equal('contacts' in data.items[0],false)
  await assert.rejects(listDomains(0,{fetchImpl:async()=>denied(403)}),/domains:read/)
})

test('renovação e servidores DNS usam estado anterior e escopo correto', async () => {
  const changes=[]
  const provider={fetchImpl:async (url,opt)=>{
    if (opt.method==='GET') return ok(account)
    changes.push({url,body:JSON.parse(opt.body)})
    return ok(url.endsWith('/autorenew') ? {isEnabled:false} : {provider:'custom',hosts:['ns1.example.net','ns2.example.net']})
  }}
  assert.equal((await changeDomainSettings('example.com',{action:'autorenew',previous:true,value:false},provider)).verified,true)
  assert.deepEqual(changes[0].body,{isEnabled:false})
  await assert.rejects(changeDomainSettings('example.com',{action:'autorenew',previous:false,value:true},provider),/estado mudou/)
  const desired={provider:'custom',hosts:['ns2.example.net','ns1.example.net']}
  assert.equal((await changeDomainSettings('example.com',{action:'nameservers',previous:account.nameservers,value:desired},provider)).verified,true)
  assert.match(changes[1].url,/\/nameservers$/)
  assert.deepEqual(changes[1].body,{provider:'custom',hosts:['ns1.example.net','ns2.example.net']})
  await assert.rejects(changeDomainSettings('example.com',{action:'autorenew',previous:true,value:false},{
    fetchImpl:async (u,o)=>o.method==='GET'?ok(account):denied(403)
  }),/domains:write/)
})

function zoneFixture(old, fail) {
  let records = [old]
  const commands = []
  return { commands, rows:()=>records, fetchImpl:async (url,opt) => {
    if (url.endsWith('/v1/domains/example.com')) return ok(account)
    if (opt.method === 'GET') return ok({items:records,total:records.length})
    const payload = JSON.parse(opt.body)
    const item = opt.method === 'PUT' ? payload.items[0] : payload[0]
    const val = item.address ?? item.cname
    commands.push({method:opt.method,val})
    if (fail?.(opt.method,val)) return denied(422)
    if (opt.method === 'PUT') {
      assert.equal(payload.force,false)
      if (item.type === 'CNAME') assert.equal(records.length,0)
      records = [...records,{...item,group:{type:'custom'}}]
    } else records = records.filter(r=>(r.address ?? r.cname)!==val)
    return ok(null,204)
  }}
}
test('troca A cria o novo antes de retirar o antigo', async () => {
  const provider=zoneFixture(oldA)
  const result=await changePointer('example.com',{name:'ir',type:'A',value:'192.0.2.31',ttl:360,previous:{ttl:300,value:oldA.address}},provider)
  assert.equal(result.verified,true)
  assert.deepEqual(provider.commands,[{method:'PUT',val:'192.0.2.31'},{method:'DELETE',val:'192.0.2.30'}])
  assert.equal(provider.rows()[0].address,'192.0.2.31')
})
test('falha na troca CNAME compensa e verifica o registro anterior', async () => {
  const provider=zoneFixture(oldC,(method,value)=>method==='PUT'&&value==='unavailable.example.net')
  await assert.rejects(changePointer('example.com',{name:'ir',type:'CNAME',value:'unavailable.example.net',ttl:300,previous:{ttl:300,value:oldC.cname}},provider),/anterior foi confirmado/)
  assert.deepEqual(provider.commands.map(c=>c.method),['DELETE','PUT','PUT'])
  assert.equal(provider.rows()[0].cname,oldC.cname)
})
test('nomes protegidos, fora da zona e troca concorrente não passam', async () => {
  assert.throws(()=>redirectSource('example.com','ir.other.com'),/subdomínio/)
  assert.throws(()=>redirectSource('example.com','painel.example.com'),/protegido/)
  assert.throws(()=>redirectSource('example.com','example.com'),/subdomínio/)
  assert.throws(()=>publicIpv4('169.254.169.254'),/público/)
  assert.throws(()=>publicIpv4('127.0.0.1'),/público/)
  let finish
  const body={name:'ir',type:'A',ttl:300,value:'192.0.2.33',previous:null}
  const options={fetchImpl:async url=>url.endsWith('/v1/domains/example.com') ?
    await new Promise(resolve=>{finish=resolve}) : url.includes('?') ? ok({items:[],total:0}) : ok(null,204)}
  const operation=changePointer('example.com',body,options)
  await assert.rejects(changePointer('example.com',body,options),/em andamento/)
  finish(ok(account))
  assert.equal((await operation).accepted,true)
})

test('diagnóstico exige DNS alinhado antes de testar IPv4 e separa IPv6 e HTTPS', async () => {
  const visits=[]
  const check=(host,ip,secure)=>{visits.push({host,ip,secure});return {matching:!secure,tlsValid:secure}}
  let target='1.0.0.1'
  const resolver={resolve4:async()=>[target],resolve6:async()=>['2001:db8::1']}
  const rule={host:'ir.example.com',enabled:true,code:302,destination:'https://example.net',preserve:true}
  assert.equal((await redirectDiagnostics(rule,'1.1.1.1',{resolver,check})).http,null)
  assert.equal(visits.length,0)
  target='1.1.1.1'
  const result=await redirectDiagnostics(rule,'1.1.1.1',{resolver,check})
  assert.equal(result.dns.matching,true)
  assert.equal(result.dns.ipv6.length,1)
  assert.equal(result.http.matching,true)
  assert.equal(result.https.matching,false)
  assert.equal(visits.length,2)
})

test('rotas reais usam sessão, origem e CSRF, e só chamam operações Nginx permitidas', async () => {
  const got=[]
  const server=createServer({taskRunner:async task=>{got.push(task);return {ok:true,items:[],item:task.rule}},spaceshipOptions:{fetchImpl:async()=>ok(account)}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const token='f'.repeat(64), csrf='b'.repeat(64)
  writeJson('sessions.json',{[crypto.createHash('sha256').update(token).digest('hex')]:{csrf,expires:Date.now()+50000}})
  const origin='http://localhost:8181'
  const url='http://127.0.0.1:'+server.address().port+'/api/domains/example.com/redirects'
  const request={host:'ir.example.com',revision:null,rule:{destination:'https://example.net/',code:302,preserve:false,https:false,enabled:true}}
  const call=(method,payload,credentials={})=>fetch(url,{method,headers:{...(payload?{'Content-Type':'application/json',Origin:origin}:{}),...credentials},body:payload?JSON.stringify(payload):undefined})
  const cookie={Cookie:'als_session='+token}, auth={...cookie,'X-CSRF-Token':csrf}
  try {
    assert.equal((await call('GET')).status,401)
    assert.equal((await call('POST',request,cookie)).status,403)
    assert.equal((await call('POST',request,{...auth,Origin:'http://other.example.com'})).status,403)
    assert.equal((await call('POST',{...request,host:'www.example.com'},auth)).status,400)
    assert.equal((await call('POST',{...request,command:'x'},auth)).status,400)
    assert.equal(got.length,0)
    assert.equal((await call('POST',request,auth)).status,200)
    assert.equal(got[0].action,'save_domain_redirect')
    assert.equal((await call('GET',null,cookie)).status,200)
    assert.deepEqual(got[1],{action:'list_domain_redirects',zone:'example.com'})
  } finally { await new Promise(resolve=>server.close(resolve)) }
})
