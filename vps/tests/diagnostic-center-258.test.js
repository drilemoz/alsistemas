import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = p => fs.readFileSync(new URL(p,import.meta.url),'utf8')
test('diagnóstico usa limite ampliado e consulta por grupo',()=>{
 const s=read('../src/server.js')
 assert.match(s,/\['project_file_explorer','project_diagnostics'\]\.includes\(task.action\) \? 262144/)
 assert.match(s,/action:'project_diagnostics',name,group/)
})
test('central exporta resultado parcial e tem reparo explícito',()=>{
 const s=read('../public/app.js'), h=read('../public/index.html')
 assert.match(s,/Promise\.allSettled\(jobs\)/)
 assert.match(s,/Promise\.allSettled\(\[api\(externalRoot/)
 assert.match(s,/diagnostics\/repair','POST'/)
 for(const id of ['diagnostic-center-run','diagnostic-center-copy','diagnostic-center-download','diagnostic-center-repair']) assert.ok(h.includes(`id="${id}"`))
})
