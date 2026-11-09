import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { projects, monitor, parseMeminfo } from '../src/monitor.js'

test('projetos externos: apenas leitura, recusa links e detecta tipos disponíveis', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'als-projects-'))
  try {
    const staticSite = path.join(root, 'site-estatico')
    const phpSite = path.join(root, 'site-php')
    const nodeSite = path.join(root, 'site-node')
    fs.mkdirSync(path.join(staticSite, 'public'), { recursive: true })
    fs.mkdirSync(path.join(phpSite, 'public'), { recursive: true })
    fs.mkdirSync(nodeSite)
    fs.writeFileSync(path.join(staticSite, 'public/index.html'), '<h1>Existente</h1>')
    fs.writeFileSync(path.join(phpSite, 'public/index.php'), '<?php echo 1;')
    fs.writeFileSync(path.join(nodeSite, 'package.json'), '{"name":"site-node"}')
    fs.symlinkSync(staticSite, path.join(root, 'link-site'))
    fs.mkdirSync(path.join(root, '.oculto'))
    const entries = projects(root).sort((a, b) => a.name.localeCompare(b.name))
    assert.equal(entries.length, 3)
    assert.deepEqual(Object.fromEntries(entries.map(x => [x.name, x.type])), {
      'site-estatico': 'static', 'site-node': 'node', 'site-php': 'php'
    })
    assert.ok(entries.every(x => x.managed === false && x.enabled === null))
    assert.equal(fs.readFileSync(path.join(staticSite, 'public/index.html'), 'utf8'), '<h1>Existente</h1>')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('métricas são números locais e meminfo respeita KiB', () => {
  assert.deepEqual(parseMeminfo('MemTotal: 2048 kB\nMemAvailable: 512 kB'), { MemTotal: 2097152, MemAvailable: 524288 })
  const m = monitor()
  assert.ok(m.ram.total > 0)
  assert.ok(m.disk.total > 0)
  assert.ok(m.cpuCount >= 1)
  assert.ok(m.uptimeSeconds >= 0)
  assert.equal(typeof m.services.nginx, 'string')
})
