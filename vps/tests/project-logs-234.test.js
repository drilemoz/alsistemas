import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { projectLogs, readLogTail, redactProjectLog } from '../src/project_logs.js'

function fixture(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'al-logs-234-'))
  const root = path.join(directory, 'projects')
  const available = path.join(directory, 'sites-available')
  const logs = path.join(directory, 'nginx')
  const site = path.join(root, 'site-um')
  fs.mkdirSync(site, { recursive:true })
  fs.mkdirSync(path.join(root, 'outro'))
  fs.mkdirSync(available)
  fs.mkdirSync(logs)
  try { return fn({ directory, root, available, logs, site }) }
  finally { fs.rmSync(directory, { recursive:true, force:true }) }
}

test('cauda limitada não carrega o log inteiro e oculta tokens, IP, query e headers conhecidos', () => fixture(({ directory }) => {
  const pathname = path.join(directory, 'test.log')
  fs.writeFileSync(pathname, Array.from({length:100}, (_, i) => `entry${i} GET /foo?password=secret token=abcd1234 Authorization:Bearer` + ' Bearer SECRET_VALUE 192.168.1.1').join('\n'))
  const result = readLogTail(pathname, {maxBytes:1900,maxLines:4})
  assert.equal(result.lines.length, 4)
  assert.equal(result.truncated, true)
  assert.ok(!JSON.stringify(result.lines).includes('SECRET_VALUE'))
  assert.ok(!JSON.stringify(result.lines).includes('192.168.1.1'))
  assert.ok(!JSON.stringify(result.lines).includes('password=secret'))
  assert.match(redactProjectLog('Cookie:abc token=SuperSecret 10.0.0.1'), /\[REDACTED\]/)
}))

test('mostra apenas arquivo PHP local e ignora projetos vizinhos, links e caminhos protegidos', () => fixture(({ root, site, available }) => {
  fs.mkdirSync(path.join(site, 'storage', 'logs'), {recursive:true})
  fs.writeFileSync(path.join(site, 'storage', 'logs', 'laravel.log'), 'PHP ERROR site-um\n')
  fs.writeFileSync(path.join(root, 'outro', 'error.log'), 'OUTRO-SITE-SECRET')
  fs.symlinkSync(path.join(root, 'outro', 'error.log'), path.join(site, 'storage', 'logs', 'app.log'))
  fs.writeFileSync(path.join(site, 'storage', 'logs', '.env'), 'SECRET-HIDDEN')
  const data = projectLogs('site-um', {root, available, projectList:() => [{name:'site-um'}], domains:() => []})
  assert.equal(data.sources.length,1)
  assert.match(data.sources[0].lines.join(''), /PHP ERROR site-um/)
  assert.ok(!JSON.stringify(data).includes('OUTRO-SITE-SECRET'))
  assert.ok(!JSON.stringify(data).includes('SECRET-HIDDEN'))
  assert.throws(() => projectLogs('iguatama-teste', {root,available}), /não autorizado/)
  assert.throws(() => projectLogs('../outro', {root,available}), /não autorizado/)
  assert.throws(() => projectLogs('outro', {root,available, projectList:()=>[{name:'site-um'}]}), /não encontrado/)
}))

test('ignora pasta PHP apontando por symlink fora do projeto', () => fixture(({ root, site, available }) => {
  fs.mkdirSync(path.join(site, 'storage'))
  fs.symlinkSync(path.join(root, 'outro'), path.join(site, 'storage', 'logs'))
  fs.writeFileSync(path.join(root, 'outro', 'app.log'), 'OUTRO')
  const result = projectLogs('site-um', {root, available, projectList:() => [{name:'site-um'}], domains:()=>[]})
  assert.equal(result.sources.length,0)
}))

test('não mistura outros server blocks ao selecionar logs do Nginx', () => fixture(({ root, site, available }) => {
  const config = `server { listen 80; root ${site}/public; server_name site.example.com; error_log /var/log/nginx/site-um-error.log warn; }\nserver { listen 80; root ${root}/outro; server_name outro.example.com; error_log /var/log/nginx/outro-error.log warn; }`
  fs.writeFileSync(path.join(available, 'sites.conf'), config)
  const data = projectLogs('site-um', {root, available, projectList:()=>[{name:'site-um'}], domains:() => [{ enabled:true, config:'sites.conf' }]})
  assert.equal(data.sources.length,1)
  assert.equal(data.sources[0].label, 'Nginx: site-um-error.log')
  assert.equal(data.sources[0].available, false) // caminho oficial não foi criado no fixture
  assert.ok(!JSON.stringify(data).includes('outro-error.log'))
}))

test('UI expõe seleção de fonte, pesquisa e controles de relatório sem ID duplicado', () => {
  const html = fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
  const app = fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1])
  assert.equal(ids.length,new Set(ids).size)
  for (const id of ['page-project-runtime-logs','project-runtime-logs-source','project-runtime-logs-search','project-runtime-logs-copy','project-runtime-logs-download','project-runtime-logs-reload']) assert.ok(ids.includes(id), id)
  assert.match(app,/Logs e erros/)
  assert.ok(app.includes('`/api/projects/${encodeURIComponent(name)}/logs`'))
  const server = fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8')
  assert.match(server,/if \(section === 'logs'\) return json\(res, 200, projectLogs\(name\)\)/)
})
