import test from 'node:test'
import assert from 'node:assert/strict'
import { serviceDiagnostics } from '../src/monitor.js'

test('diagnóstico só consulta as quatro unidades permitidas sem shell', () => {
  const commands = []
  const out = serviceDiagnostics((program, args) => {
    commands.push([program, args])
    return 'ActiveState=active\nSubState=running\nUnitFileState=enabled\n'
  })
  assert.equal(out.services.length, 4)
  assert.equal(out.services[0].unit, 'nginx')
  assert.equal(out.services[0].active, 'active')
  assert.equal(out.services[0].enabled, 'enabled')
  assert.equal(commands.length, 4)
  assert.ok(commands.every(([p, a]) => p === '/bin/systemctl' && a[0] === 'show' && !a.includes('restart')))
})

test('diagnóstico não inventa estados quando systemctl falha', () => {
  const out = serviceDiagnostics(() => { throw new Error('unit missing') })
  assert.ok(out.services.every(s => s.active === 'unknown' && s.enabled === 'unknown'))
})
