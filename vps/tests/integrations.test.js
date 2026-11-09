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
  removeSpaceship()
  assert.equal(spaceshipStatus().configured,false)
})
test('domínio inválido é rejeitado antes da rede', async () => {
  await assert.rejects(listSpaceshipDns('http://example.com'),/Domínio inválido/)
  await assert.rejects(listSpaceshipDns('a..com'),/Domínio inválido/)
})
test('consulta DNS utiliza cabeçalhos e URL fixos', async () => {
  saveSpaceship({apiKey:'api123',apiSecret:'secret123'})
  const result = await listSpaceshipDns('example.com',{fetchImpl: async (url, opts) => {
    assert.equal(url,'https://api.spaceship.com/v1/dns/records/example.com')
    assert.equal(opts.headers['X-API-Key'],'api123')
    assert.equal(opts.headers['X-API-Secret'],'secret123')
    return {ok:true,json:async()=>({items:[{type:'A',name:'@',value:'127.0.0.1'}]})}
  }})
  assert.equal(result.items.length,1)
  removeSpaceship()
})
