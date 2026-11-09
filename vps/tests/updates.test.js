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

test('consulta GitHub apenas informa disponibilidade, não exige chave Ed25519', async () => {
  configureRepo('my-user/repo_name')
  assert.equal(updateInfo('2.0.4').repo, 'my-user/repo_name')
  const url = 'https://api.github.com/repos/my-user/repo_name/releases/latest'
  const fake = async (actual) => {
    assert.equal(actual, url)
    return { ok: true, headers: { get() { return null } }, json: async () => ({ tag_name: 'v2.0.5', assets: [
      { name: 'AL-Sistemas-v2.0.5-VPS.zip' }, { name: 'update-manifest.json' }
    ] }) }
  }
  const data = await checkRelease('2.0.4', fake)
  assert.equal(data.available, true)
  assert.equal(data.assetsReady, true)
  assert.equal('signingReady' in data, false)
  assert.match(data.message, /SHA-256 e estrutura serão conferidos/)
  fs.rmSync(dir, { recursive: true, force: true })
})


test('repositório público sem Release tem diagnóstico específico e não habilita instalação', async () => {
  configureRepo('drilemoz/alsistemas')
  const urls = []
  const result = await checkRelease('2.0.10', async (url) => {
    urls.push(url)
    if (url.endsWith('/releases/latest')) return { ok: false, status: 404 }
    if (url === 'https://api.github.com/repos/drilemoz/alsistemas') return { ok: true, status: 200 }
    throw new Error('URL inesperada: ' + url)
  })
  assert.equal(urls.length, 2)
  assert.equal(result.available, false)
  assert.equal(result.assetsReady, false)
  assert.equal(result.repoAccessible, true)
  assert.equal(result.releaseStatus, 'no_stable_release')
  assert.match(result.message, /não há Release estável pública/)
})

test('404 de repositório ausente ou privado não afirma que está acessível', async () => {
  const result = await checkRelease('2.0.10', async (url) => ({ ok: false, status: 404 }))
  assert.equal(result.available, false)
  assert.equal(result.repoAccessible, false)
  assert.equal(result.releaseStatus, 'repo_unavailable')
  assert.match(result.message, /não encontrado ou privado/)
})

test('falha de rede ou rate limit não é confundida com ausência de Release', async () => {
  await assert.rejects(checkRelease('2.0.10', async () => {
    throw new Error('Falha de rede simulada')
  }), /Falha de rede/)
  await assert.rejects(checkRelease('2.0.10', async () => ({
    ok: false, status: 403, headers: { get: key => key === 'x-ratelimit-remaining' ? '0' : null }
  })), /Limite de consultas públicas/)
})

test('não usa fallback para ZIP da branch sem manifesto SHA-256', async () => {
  const data = await checkRelease('2.0.10', async url => ({
    ok: url.endsWith('/repos/drilemoz/alsistemas'), status: url.endsWith('/releases/latest') ? 404 : 200
  }))
  assert.equal(data.available, false)
  assert.equal(data.assetsReady, false)
  assert.equal(data.latest, undefined)
})

test('Release sem manifesto não libera o botão de atualização', async () => {
  const fake = async () => ({ ok: true, headers: { get: () => null }, json: async () => ({
    tag_name: 'v2.0.14', assets: [{ name: 'AL-Sistemas-v2.0.14-VPS.zip' }]
  }) })
  const data = await checkRelease('2.0.12', fake)
  assert.equal(data.available, true)
  assert.equal(data.assetsReady, false)
})
