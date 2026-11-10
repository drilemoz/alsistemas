import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { projectOverview, projectActivities, estimateProjectStorage, probeProjectWebsite } from '../src/project_overview.js'

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-project-overview-'))
  try {
    fs.mkdirSync(path.join(dir, 'site-um'))
    fs.writeFileSync(path.join(dir, 'site-um', 'VERSION'), '1.3.5\n')
    fs.writeFileSync(path.join(dir, 'site-um', 'index.php'), 'A'.repeat(100))
    fs.writeFileSync(path.join(dir, 'site-um', '.env'), 'DO_NOT_READ')
    fs.mkdirSync(path.join(dir, 'site-um', 'public'))
    fs.writeFileSync(path.join(dir, 'site-um', 'public', 'index.php'), 'B'.repeat(75))
    fs.symlinkSync('/etc', path.join(dir, 'site-um', 'etc-link'))
    return run(dir)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test('diagnóstico usa diretório autorizado, informa versão e não segue links ou .env', () => fixture(root => {
  const info = projectOverview('site-um', {
    root,
    projectList: () => [{ name: 'site-um', type: 'php', managed: false, enabled: null }],
    domains: () => [{ name:'site.example.com', url:'https://site.example.com', enabled: true, https: true }],
    exec: () => 'PHP 8.3.20 (cli)\n',
  })
  assert.equal(info.version, '1.3.5')
  assert.equal(info.php.version, '8.3.20')
  assert.equal(info.storage.files, 3)
  assert.equal(info.storage.skipped, 2)
  assert.equal(info.sites[0].httpsConfigured, true)
  assert.match(info.httpsNote, /não confirma certificado/)
  assert.deepEqual(Object.keys(info).includes('password'), false)
}))

test('amostragem de espaço registra resultado parcial ao alcançar limite', () => fixture(root => {
  const result = estimateProjectStorage(path.join(root, 'site-um'), { maxEntries: 2, maxDirectories: 2, maxDepth: 1 })
  assert.equal(result.incomplete, true)
  assert.ok(result.files + result.directories <= 2)
}))

test('projetos protegidos, travessia de diretórios e symlink são recusados', () => fixture(root => {
  for (const name of ['../etc', '.hidden', 'iguatama-teste', 'alsistemas', 'not-found']) {
    assert.throws(() => projectOverview(name, { root }), /não autorizado|indisponível/)
  }
  fs.symlinkSync(path.join(root, 'site-um'), path.join(root, 'outra-pasta'))
  assert.throws(() => projectOverview('outra-pasta', { root }), /indisponível/)
}))

test('histórico isola os eventos por projeto e omite IP e motivos potencialmente sensíveis', () => {
  const data = projectActivities('site-um', [
    { name: 'outro', event: 'erro', action: 'backup', reason: 'secret', ip: '127.0.0.1' },
    { name: 'site-um', event: 'task_success', action: 'backup', time: '2026-11-10T12:00:00Z', ip: '192.0.2.1', reason: 'password' },
  ])
  assert.equal(data.events.length, 1)
  assert.equal(data.events[0].action, 'backup')
  assert.ok(!JSON.stringify(data).includes('192.0.2.1'))
  assert.ok(!JSON.stringify(data).includes('secret'))
  assert.equal(data.lastProjectUpdate, null)
  assert.throws(() => projectActivities('iguatama-teste'), /não autorizado/)
})

test('interface expõe os módulos reais e não duplica os IDs', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
  assert.equal(ids.length, new Set(ids).size)
  for (const id of ['page-project-insights','page-project-activity','project-insights-grid','project-activity-events','project-detail-actions']) assert.ok(ids.includes(id), id)
  assert.match(app, /Diagnóstico e armazenamento/)
  assert.match(app, /Histórico administrativo/)
  assert.match(app, /api\/projects\/\$\{encodeURIComponent\(name\)\}\/overview/)
})


test('teste HTTP consulta apenas loopback e mantém escopo do projeto', async () => {
  const server = http.createServer((req, res) => { assert.equal(req.method, 'HEAD'); assert.equal(req.headers.host, 'site.example.com'); res.writeHead(302, { location: '/login' }); res.end() })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'als-probe-'))
    try {
      fs.mkdirSync(path.join(root, 'site-um'))
      const probe = await probeProjectWebsite('site-um', { root, port:server.address().port, domains:() => [{ name:'site.example.com', enabled:true }] })
      assert.equal(probe.checked, true)
      assert.equal(probe.statusCode, 302)
      assert.ok(probe.elapsedMs >= 0)
      assert.match(probe.source, /internet pública não testada/)
      const noDomain = await probeProjectWebsite('site-um', { root, port:server.address().port, domains:() => [] })
      assert.equal(noDomain.checked, false)
    } finally { fs.rmSync(root, { recursive:true, force:true }) }
  } finally { await new Promise(resolve => server.close(resolve)) }
})
