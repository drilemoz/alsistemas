import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const home = fs.mkdtempSync(path.join(os.tmpdir(),'als-apt-history-'))
process.env.ALS_DATA_DIR = home
const {writeJson} = await import('../src/store.js')
const {packageHistory} = await import('../src/dependencies.js')
test.after(()=>fs.rmSync(home,{recursive:true,force:true}))
const record = (id, fields={}) => ({job:id.padStart(24,'0'),package:'node-build',stage:'failed',operation:'install',time:'2026-11-18T03:00:00.000Z',log:'Registro privado',...fields})
test('histórico limita itens, valida operações e só fornece log no detalhe', () => {
  const newer = record('a',{time:'2026-11-18T04:00:00.000Z',stage:'completed',startedAt:'2026-11-18T03:58:00.000Z'})
  const older = record('b',{operation:'remove'})
  writeJson('packages-history.json',[older,newer,{...older,stage:'checking'},record('c',{operation:'prune'}),record('d',{time:'invalid'}),record('e',{package:'ssh'})])
  writeJson('packages-status.json',newer)
  const list = packageHistory()
  assert.deepEqual(list.map(row=>row.job),[newer.job,older.job])
  assert.equal(list[0].hasLog,true)
  assert.ok(list.every(row=>!Object.hasOwn(row,'log')))
  assert.equal(packageHistory(older.job).log,older.log)
  assert.equal(packageHistory('f'.repeat(24)),null)
})
test('ignora histórico ligado a arquivo externo ou excedendo o limite', () => {
  fs.unlinkSync(path.join(home,'packages-history.json'))
  const outside = path.join(home,'outside.json')
  fs.writeFileSync(outside,JSON.stringify([record('6')]))
  fs.symlinkSync(outside,path.join(home,'packages-history.json'))
  assert.equal(packageHistory('6'.padStart(24,'0')),null)
  fs.unlinkSync(path.join(home,'packages-history.json'))
  fs.writeFileSync(path.join(home,'packages-history.json'),Buffer.alloc(1024*1024+1))
  assert.equal(packageHistory().length,1)
})
