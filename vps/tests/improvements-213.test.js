import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'als-audit213-'))
process.env.ALS_DATA_DIR = temp
const { audit, lastAudit } = await import('../src/store.js')
const { checkRelease } = await import('../src/updates.js')

test('auditoria nova omite campos undefined sem perder campos válidos', () => {
  try {
    audit('task_success', { name: undefined, action: 'validate_nginx', enabled: null, success: true })
    const events = lastAudit()
    assert.equal(events.length, 1)
    assert.equal(events[0].action, 'validate_nginx')
    assert.equal(events[0].success, 'true')
    assert.equal(Object.hasOwn(events[0], 'name'), false)
    assert.equal(Object.hasOwn(events[0], 'enabled'), false)
    assert.doesNotMatch(fs.readFileSync(path.join(temp, 'audit.jsonl'), 'utf8'), /"undefined"/)
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
})

test('releases exibem notas, CHANGELOG só da versão e README da tag', async () => {
  const urls = []
  const fetcher = async url => {
    urls.push(url)
    if (url.endsWith('/releases/latest')) return { ok: true, headers: { get: () => null }, json: async () => ({
      tag_name: 'v2.0.13', body: 'Melhorias no painel', assets: [
        { name: 'AL-Sistemas-v2.0.13-VPS.zip' }, { name: 'update-manifest.json' }
      ]
    }) }
    if (url.endsWith('/README.md')) return { ok: true, headers: { get: () => null }, text: async () => '# README versão 2.0.13\nMudanças no painel' }
    if (url.endsWith('/CHANGELOG.md')) return { ok: true, headers: { get: () => null }, text: async () => '## 2.0.13 — Atual\n- correção auditoria\n\n## 2.0.12 — Antiga\n- antiga mudança' }
    throw new Error(`URL inesperada: ${url}`)
  }
  const r = await checkRelease('2.0.12', fetcher)
  assert.equal(r.available, true)
  assert.equal(r.assetsReady, true)
  assert.equal(r.releaseNotes, 'Melhorias no painel')
  assert.match(r.changes, /correção auditoria/)
  assert.doesNotMatch(r.changes, /antiga mudança/)
  assert.match(r.readme, /README versão 2\.0\.13/)
  assert.equal(r.readmeUrl, 'https://github.com/drilemoz/alsistemas/blob/v2.0.13/README.md')
  assert.ok(urls.includes('https://raw.githubusercontent.com/drilemoz/alsistemas/v2.0.13/README.md'))
  assert.ok(urls.includes('https://raw.githubusercontent.com/drilemoz/alsistemas/v2.0.13/CHANGELOG.md'))
})

test('README ausente ou excessivo não bloqueia a verificação de atualização', async () => {
  const fetcher = async url => {
    if (url.endsWith('/releases/latest')) return { ok: true, headers: { get: () => null }, json: async () => ({
      tag_name: 'v2.0.13', body: '<script>não executar</script>', assets: [
        { name: 'AL-Sistemas-v2.0.13-VPS.zip' }, { name: 'update-manifest.json' }
      ]
    }) }
    if (url.endsWith('/README.md')) return { ok: true, headers: { get: () => '9999999' } }
    if (url.endsWith('/CHANGELOG.md')) return { ok: false, status: 404 }
    throw new Error('Inesperado')
  }
  const r = await checkRelease('2.0.12', fetcher)
  assert.equal(r.available, true)
  assert.equal(r.assetsReady, true)
  assert.equal(r.readme, null)
  assert.equal(r.changes, null)
  assert.equal(r.releaseNotes, '<script>não executar</script>') // a UI deve usar textContent.
})

test('interface usa nós de texto para notas externas e fornece ícones e filtros', () => {
  const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')
  assert.match(html, /id="update-notes"/)
  assert.match(html, /data-audit-filter="access"/)
  assert.match(html, /data-audit-filter="system"/)
  assert.match(js, /node\('p', note, 'release-text'\)/)
  assert.match(js, /node\('pre', readme, 'release-text'\)/)
  assert.match(js, /function auditDetail\(item\)/)
  assert.match(js, /function serviceCard\(container/)
  assert.match(js, /function loadTrustedDevices/)
  assert.match(css, /\.audit-item/)
  assert.match(css, /\.service-card/)
})
