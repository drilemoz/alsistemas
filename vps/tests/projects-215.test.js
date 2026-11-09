import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { discoverProjectDomain } from '../src/monitor.js'

test('descobre domínio apenas quando o root Nginx corresponde ao projeto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-project-'))
  try {
    const site = path.join(dir, 'site')
    const nginx = path.join(dir, 'nginx')
    fs.mkdirSync(path.join(site, 'public'), { recursive: true })
    fs.mkdirSync(nginx)
    fs.writeFileSync(path.join(nginx, 'site.conf'), `server {\n root ${site}/public;\n server_name iguatama.online www.iguatama.online;\n}`)
    fs.writeFileSync(path.join(nginx, 'other.conf'), `server {\n root /var/www/outro;\n server_name estranho.example;\n}`)
    assert.deepEqual(discoverProjectDomain(site, nginx), ['iguatama.online', 'www.iguatama.online'])
    assert.deepEqual(discoverProjectDomain(path.join(dir, 'other'), nginx), [])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
