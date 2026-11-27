import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = p => fs.readFileSync(new URL(p,import.meta.url),'utf8')
test('reparos privados são opções fixas exclusivas do IguatamaOnline',()=>{
 const s=read('../src/server.js'), h=read('../public/index.html'), a=read('../public/app.js')
 for(const id of ['deploy-control-permissions','deploy-backup-permissions']) {
   assert.ok(s.includes(`'${id}'`)); assert.ok(h.includes(`value="${id}"`))
 }
 assert.ok(s.includes("operation.startsWith('deploy-') && name!=='iguatamaonline'"))
 assert.ok(a.includes("option.value.startsWith('deploy-') && item.name !== 'iguatamaonline'"))
 assert.ok(a.includes("repair.endsWith('-permissions')"))
})
