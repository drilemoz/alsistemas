import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupProjectRelease, PORTAL_REPO } from '../src/project_release.js'
const asset = {name:'Atualizacao-v1.0.156.zip',size:1850000}
const lookup = (data) => lookupProjectRelease(PORTAL_REPO, async url => { assert.equal(url,'https://api.github.com/repos/drilemoz/Meu-Site/releases/latest'); return Response.json(data) })
test('release do portal seleciona pacote oficial, ignora ZIP de fonte', async () => {
  const info = await lookup({tag_name:'v1.0.156',assets:[asset,{name:'Meu-Site-fonte.zip',size:2000000}],body:'Novidades'})
  assert.equal(info.latest,'1.0.156'); assert.equal(info.assetsReady,true); assert.equal(info.asset,asset.name); assert.equal(info.notes,'Novidades')
})
test('release ambígua, sem pacote oficial ou fora do limite não é instalável',async()=>{
  for (const assets of [[asset,{...asset,name:'Meu-Site-update-v1.0.156.zip'}],[{...asset,name:'fonte.zip'}],[{...asset,size:66000000}]]) assert.equal((await lookup({tag_name:'v1.0.156',assets})).assetsReady,false)
  await assert.rejects(lookup({tag_name:'v1.0.156',prerelease:true,assets:[asset]}),/estável/)
})
