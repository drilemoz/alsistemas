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

import { serviceInventory, validServiceAction } from '../src/service_inventory.js'
test('inventário combina unidades instaladas, ativas e portas locais sem dar controle de SSH', () => {
  const info=serviceInventory((program,args)=>{
    if(program.endsWith('/ss')) return 'LISTEN 0 100 127.0.0.1:25 0.0.0.0:*\nLISTEN 0 100 0.0.0.0:22 0.0.0.0:*'
    if(args[0]==='list-unit-files') return 'ssh.service enabled enabled\nmongod.service disabled disabled\npostfix.service enabled enabled'
    return 'ssh.service loaded active running OpenSSH Server\npostfix.service loaded active running Mail transport\n'
  })
  assert.deepEqual(info.mail,[25])
  assert.deepEqual(info.services.find(p=>p.unit==='ssh').actions,[])
  assert.equal(info.services.find(p=>p.unit==='mongod').active,'not-loaded')
  assert.ok(info.services.find(p=>p.unit==='postfix').mail)
  for (const [unit,op] of [['ssh','restart'],['nginx','stop'],['alsistemas-vps','stop'],[';id','start']]) assert.equal(validServiceAction(unit,op),false)
  assert.equal(validServiceAction('mongod','restart'),true)
})
