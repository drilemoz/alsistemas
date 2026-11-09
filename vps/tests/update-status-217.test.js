import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-update-state-'))
process.env.ALS_DATA_DIR = dir
const { updateInfo } = await import('../src/updates.js')

test('progresso da operação persiste, identifica a origem e denuncia estado antigo', () => {
  const status = { id: 'a'.repeat(24), mode: 'file', stage: 'backup', message: 'Fazendo backup',
    time: new Date().toISOString() }
  fs.writeFileSync(path.join(dir, 'update-status.json'), JSON.stringify(status))
  assert.equal(updateInfo('2.0.17').status.id, status.id)
  assert.equal(updateInfo('2.0.17').status.stage, 'backup')
  status.time = new Date(Date.now() - 20 * 60_000).toISOString()
  fs.writeFileSync(path.join(dir, 'update-status.json'), JSON.stringify(status))
  assert.equal(updateInfo('2.0.17').status.stage, 'stalled')
  fs.rmSync(dir, { recursive: true, force: true })
})
