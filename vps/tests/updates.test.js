import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'als-updates-'))
process.env.ALS_DATA_DIR = dir
const { compareVersion, validateRepo, configureRepo, updateInfo, checkRelease, DEFAULT_REPO } = await import('../src/updates.js')

test('repositório padrão seguro é usado sem editar configurações', () => {
  assert.equal(DEFAULT_REPO, 'drilemoz/alsistemas')
  assert.equal(updateInfo('2.0.5').repo, DEFAULT_REPO)
})

test('repositório allowlist e comparação sem execuções arbitrárias', () => {
  for (const value of ['../xx', 'a/../../b', 'a/b.git', 'https://github.com/a/b', 'a/b?token=1', 'a/b/c', 'a/b\ncmd']) assert.equal(validateRepo(value), false)
  for (const value of ['adriedsonlemoz/AL-Sistemas', 'my-user/repo_name']) assert.equal(validateRepo(value), true)
  assert.equal(compareVersion('2.0.4', '2.0.3'), 1)
  assert.equal(compareVersion('2.0.4', '2.0.4'), 0)
  assert.equal(compareVersion('2.0.2', '2.0.4'), -1)
  assert.equal(compareVersion('latest', '2.0.4'), null)
})

test('consulta GitHub apenas informa disponibilidade, não valida assinatura no frontend', async () => {
  configureRepo('my-user/repo_name')
  assert.equal(updateInfo('2.0.4').repo, 'my-user/repo_name')
  const url = 'https://api.github.com/repos/my-user/repo_name/releases/latest'
  const fake = async (actual) => {
    assert.equal(actual, url)
    return { ok: true, headers: { get() { return null } }, json: async () => ({ tag_name: 'v2.0.5', assets: [
      { name: 'AL-Sistemas-v2.0.5-VPS.zip' }, { name: 'update-manifest.json' }, { name: 'update-manifest.json.sig' }
    ] }) }
  }
  const data = await checkRelease('2.0.4', fake)
  assert.equal(data.available, true)
  assert.equal(data.assetsReady, true)
  assert.equal(data.signingReady, false)
  assert.match(data.message, /assinatura será validada/)
  fs.rmSync(dir, { recursive: true, force: true })
})


test('GitHub sem Releases informa ausência, sem simular atualização', async () => {
  configureRepo('drilemoz/alsistemas')
  const result = await checkRelease('2.0.6', async (url) => {
    assert.equal(url, 'https://api.github.com/repos/drilemoz/alsistemas/releases/latest')
    return { ok: false, status: 404, headers: { get() { return null } } }
  })
  assert.equal(result.available, false)
  assert.equal(result.assetsReady, false)
  assert.match(result.message, /ainda não há Release/)
})
