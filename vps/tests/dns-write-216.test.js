import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-dns-write-216-'))
process.env.ALS_DATA_DIR = dir
const {saveSpaceship, changeSpaceshipDns} = await import('../src/integrations.js')
saveSpaceship({apiKey:'test-key',apiSecret:'test-secret'})
const original = {type:'A',name:'blog',address:'192.0.2.1',ttl:1800,group:{type:'custom'}}
const fake = (items, expected, method, expectedBody) => {
  const calls=[]
  return {
    calls,
    fetchImpl:async (url,opt) => {
      calls.push({url,opt})
      assert.equal(opt.headers['X-API-Key'],'test-key')
      assert.equal(opt.headers['X-API-Secret'],'test-secret')
      if (calls.length === 1) {
        assert.equal(opt.method,'GET')
        assert.match(url,/take=500&skip=0/)
        return {ok:true,status:200,json:async()=>({items,total:items.length})}
      }
      assert.equal(opt.method,method)
      assert.deepEqual(JSON.parse(opt.body),expectedBody)
      assert.equal(url,'https://spaceship.dev/api/v1/dns/records/example.com')
      return {ok:true,status:204,json:async()=>{throw new Error('resposta 204 não tem JSON')}}
    }
  }
}
const record = {type:'A',name:'blog',value:'192.0.2.1',ttl:1800}
test('criação exige preflight e PUT com force=false, sem ler JSON 204', async () => {
  const stub=fake([],null,'PUT',{force:false,items:[{type:'A',name:'loja',address:'192.0.2.5',ttl:1800}]})
  const result=await changeSpaceshipDns('example.com',{action:'create',record:{type:'A',name:'loja',value:'192.0.2.5',ttl:1800}},stub)
  assert.equal(result.accepted,true)
  assert.equal(stub.calls.length,2)
})
test('editar TTL preserva o destino e exige correspondência exata no GET', async () => {
  const stub=fake([original],null,'PUT',{force:false,items:[{type:'A',name:'blog',address:'192.0.2.1',ttl:3600}]})
  const result=await changeSpaceshipDns('example.com',{action:'update_ttl',record:{...record,ttl:3600},previous:record},stub)
  assert.equal(result.action,'update_ttl')
})
test('exclusão envia DELETE apenas do registro original, sem TTL', async () => {
  const stub=fake([original],null,'DELETE',[{type:'A',name:'blog',address:'192.0.2.1'}])
  const result=await changeSpaceshipDns('example.com',{action:'delete',record,previous:record},stub)
  assert.equal(result.action,'delete')
})
test('proteção de nomes essenciais impede escrita mesmo com senha já validada', async () => {
  for (const name of ['@','painel','www','mail','_dmarc','migrar']) {
    await assert.rejects(changeSpaceshipDns('example.com',{action:'create',record:{...record,name}}, {fetchImpl:()=>{throw new Error('não acessar API')}}),/protegido/)
  }
})
test('edição de valor não pode ser disfarçada como edição de TTL', async () => {
  await assert.rejects(changeSpaceshipDns('example.com',{action:'update_ttl',previous:record,record:{...record,value:'192.0.2.7',ttl:3600}}, {fetchImpl:()=>{throw new Error('não acessar API')}}),/somente TTL/)
})
test('preflight rejeita registros de grupo de produto, mudanças e duplicados', async () => {
  for (const items of [[{...original,group:{type:'product'}}],[{...original,ttl:7200}],[]]) {
    const stub=fake(items)
    await assert.rejects(changeSpaceshipDns('example.com',{action:'delete',record,previous:record},stub),/alterado|personalizado|existe/)
    assert.equal(stub.calls.length,1)
  }
  const stub=fake([original])
  await assert.rejects(changeSpaceshipDns('example.com',{action:'create',record},stub),/já existe/)
  assert.equal(stub.calls.length,1)
})
test('preflight com zona paginada impede escrita incompleta', async () => {
  let calls=0
  await assert.rejects(changeSpaceshipDns('example.com',{action:'create',record:{...record,name:'nova'}},{fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({items:[original],total:501})}}}),/mais de 500/)
  assert.equal(calls,1)
})
test('não aceita IPv4 inválido, TTL incorreto e URL como nome', async () => {
  for (const bad of [{...record,value:'127.0.0.999'},{...record,ttl:5},{...record,name:'https://x'}]) {
    await assert.rejects(changeSpaceshipDns('example.com',{action:'create',record:bad},{fetchImpl:()=>{throw new Error('não acessar API')}}))
  }
})
test('falha de permissão em escrita menciona dnsrecords:write', async () => {
  let n=0
  await assert.rejects(changeSpaceshipDns('example.com',{action:'create',record:{...record,name:'nova'}},{fetchImpl:async()=>{n++;return n===1?{ok:true,status:200,json:async()=>({items:[],total:0})}:{ok:false,status:403}}}),/dnsrecords:write/)
})
