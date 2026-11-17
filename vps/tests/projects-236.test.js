import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { projects } from '../src/monitor.js'
import { projectOverview, estimateProjectStorage, probeProjectWebsite } from '../src/project_overview.js'

const ui = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
function sourceOf(name) {
  return ui.match(new RegExp('^(?:async )?function ' + name + '\\([\\s\\S]*?^}', 'm'))?.[0]
}
async function fixture(fn) {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'als-projects-236-')))
  try { await fn(temporary) } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}

test('um arquivo Nginx compartilhado mantém domínios separados e o protocolo real na lista e no diagnóstico', () => fixture(async temporary => {
  const root = path.join(temporary, 'projects')
  const available = path.join(temporary, 'available')
  const enabled = path.join(temporary, 'enabled')
  const one = path.join(root, 'site-um')
  const two = path.join(root, 'site-dois')
  for (const directory of [one, two, available, enabled]) fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(path.join(root, 'iguatama-teste'))
  fs.mkdirSync(path.join(root, 'nome--duplo'))
  fs.writeFileSync(path.join(available, 'multi'),
    `server { listen 80; server_name um.example.org; root "${one}"; location /alt { root ${two}; } }
     server { listen 443 ssl; server_name dois.example.org; root ${two}; }`)
  fs.symlinkSync('../available/multi', path.join(enabled, 'novo-nome'))
  fs.writeFileSync(path.join(available, 'disable.conf'),
    `server { listen 80; server_name reserva.example.org; root ${two}; }`)
  const nginx = { available, enabled }
  const list = projects(root, { nginx })
  assert.equal(list.find(p => p.name === 'site-um').domain, 'um.example.org')
  assert.deepEqual(list.find(p => p.name === 'site-um').domains, ['um.example.org'])
  assert.equal(list.find(p => p.name === 'site-um').sites[0].url, 'http://um.example.org')
  assert.equal(list.find(p => p.name === 'site-dois').sites[0].url, 'https://dois.example.org')
  assert.equal(list.find(p => p.name === 'site-dois').sites[1].enabled, false)
  const protectedProject = list.find(p => p.name === 'iguatama-teste')
  assert.equal(protectedProject.protected, true)
  assert.equal(protectedProject.capabilities.diagnostics, false)
  assert.equal(list.find(p => p.name === 'nome--duplo').capabilities.files, false)
  const { detectSiteDomains } = await import('../src/project_inspector.js')
  const domains = dir => detectSiteDomains(dir, nginx)
  const overview = await projectOverview('site-um', {
    root, domains, exec: async () => { throw Object.assign(new Error('inactive'), { stdout: 'inactive\n' }) },
  })
  assert.deepEqual(overview.sites.map(site => site.url), ['http://um.example.org'])
  assert.equal(overview.database.mariadbService, 'inativo')
  assert.equal((await probeProjectWebsite('site-dois', { root, domains })).checked, false)
}))

test('varredura limita também itens excluídos e não os soma ao total', () => fixture(async temporary => {
  for (let i = 0; i < 15; i++) fs.writeFileSync(path.join(temporary, '.oculto-' + i), 'não ler')
  const storage = await estimateProjectStorage(temporary, { maxEntries: 4 })
  assert.equal(storage.files, 0)
  assert.equal(storage.skipped, 4)
  assert.equal(storage.incomplete, true)
}))

test('fechar confirmação sem clique fica falso mesmo com returnValue de aprovação', async () => {
  const form = new EventTarget()
  const button = {}
  const dialog = Object.assign(new EventTarget(), {
    open: false, returnValue: '',
    showModal() { this.open = true },
    close() { this.open = false; this.dispatchEvent(new Event('close')) },
    querySelector() { return form },
  })
  const confirm = vm.runInNewContext(sourceOf('confirmAction') + '\nconfirmAction', {
    $: id => id === 'confirm-dialog' ? dialog : id === 'confirm-accept' ? button : {},
  })
  const proceed = confirm('Primeira operação', 'Confirmar')
  const submit = new Event('submit', { cancelable: true })
  submit.submitter = button
  form.dispatchEvent(submit)
  assert.equal(await proceed, true)
  dialog.returnValue = 'confirm'
  const cancel = confirm('Segunda operação', 'Confirmar')
  assert.equal(dialog.returnValue, '')
  dialog.returnValue = 'confirm'
  dialog.close()
  assert.equal(await cancel, false)
})

test('catálogo abre sem carregar diagnóstico e popup/diagnóstico reutilizam consulta em andamento e resultado', async () => {
  const detail = sourceOf('renderProjectPage')
  assert.doesNotMatch(detail, /getProjectOverview|\/overview/)
  assert.match(sourceOf('openProjectSheet'), /getProjectOverview\(name\)/)
  let count = 0
  const check = vm.runInNewContext(sourceOf('getProjectOverview') + '\ngetProjectOverview', {
    projectOverviewCache: new Map(), projectOverviewTtlMs: 30_000,
    api: async () => ({ version: '1.0.' + (++count) }),
  })
  const a = check('site-um')
  const b = check('site-um')
  assert.equal(a, b)
  assert.equal((await a).version, '1.0.1')
  assert.equal((await check('site-um')).version, '1.0.1')
  assert.equal((await check('site-um', { force: true })).version, '1.0.2')
})
