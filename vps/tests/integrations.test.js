import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-integration-'))
process.env.ALS_DATA_DIR = dir
const { spaceshipStatus, saveSpaceship, removeSpaceship, listSpaceshipDns } = await import('../src/integrations.js')

test('credenciais criptografadas e status sem segredo', () => {
  saveSpaceship({apiKey:'key-test-123',apiSecret:'secret-test-123'})
  assert.equal(spaceshipStatus().configured,true)
  const stored = fs.readFileSync(path.join(dir,'integrations-spaceship.json'),'utf8')
  assert.equal(stored.includes('secret-test-123'),false)
  assert.equal(JSON.stringify(spaceshipStatus()).includes('key-test-123'),false)
  assert.equal(fs.statSync(path.join(dir, 'integrations.key')).mode & 0o077, 0)
  removeSpaceship()
  assert.equal(spaceshipStatus().configured,false)
})

test('domínio inválido é rejeitado antes da rede', async () => {
  await assert.rejects(listSpaceshipDns('http://example.com'),/Domínio inválido/)
  await assert.rejects(listSpaceshipDns('a..com'),/Domínio inválido/)
})

test('consulta DNS usa host e parâmetros obrigatórios da documentação oficial', async () => {
  saveSpaceship({apiKey:'api123',apiSecret:'secret123'})
  const result = await listSpaceshipDns('example.com',{fetchImpl: async (url, opts) => {
    assert.equal(url,'https://spaceship.dev/api/v1/dns/records/example.com?take=500&skip=0')
    assert.equal(opts.headers['X-API-Key'],'api123')
    assert.equal(opts.headers['X-API-Secret'],'secret123')
    assert.equal(opts.redirect, 'error')
    assert.ok(opts.signal)
    return {ok:true,json:async()=>({items:[{type:'A',name:'@',address:'127.0.0.1',ttl:3600}],total:1})}
  }})
  assert.equal(result.items.length,1)
  assert.equal(result.total,1)
  removeSpaceship()
})

test('limite por página e total real são preservados, sem relatar paginação completa', async () => {
  saveSpaceship({apiKey:'api123',apiSecret:'secret123'})
  const records = Array.from({ length: 500 }, (_, i) => ({ type:'A', name:`s${i}`,address:'127.0.0.1' }))
  const result = await listSpaceshipDns('example.com',{fetchImpl: async () => ({ok:true,json:async()=>({items:records,total:502})})})
  assert.equal(result.items.length,500)
  assert.equal(result.total,502)
  removeSpaceship()
})

test('falhas de autenticação têm diagnóstico útil, sem revelar credenciais', async () => {
  saveSpaceship({apiKey:'privada-api',apiSecret:'segredo-privado'})
  await assert.rejects(listSpaceshipDns('example.com',{fetchImpl:async()=>({ok:false,status:403})}), error => {
    assert.equal(error.status, 502)
    assert.match(error.message, /dnsrecords:read/)
    assert.doesNotMatch(error.message, /segredo-privado|privada-api/)
    return true
  })
  await assert.rejects(listSpaceshipDns('example.com',{fetchImpl:async()=>({ok:false,status:429})}), error => error.status === 429)
  removeSpaceship()
})

test('JSON DNS malformado é recusado em vez de simular ausência de registros', async () => {
  saveSpaceship({apiKey:'api123',apiSecret:'secret123'})
  await assert.rejects(listSpaceshipDns('example.com',{fetchImpl:async()=>({ok:true,json:async()=>({foo:42})})}), error => error.status === 502)
  removeSpaceship()
})
