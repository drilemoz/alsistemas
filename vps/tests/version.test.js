import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const expected = '2.0.30'

test('versão consistente nos três componentes e respectivos lockfiles', () => {
  for (const folder of ['vps', 'alsistemas', 'backend']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, folder, 'package.json'), 'utf8'))
    assert.equal(pkg.version, expected, `${folder}/package.json`)
    if (folder !== 'vps') {
      const lock = JSON.parse(fs.readFileSync(path.join(root, folder, 'package-lock.json'), 'utf8'))
      assert.equal(lock.version, expected, `${folder}/package-lock.json`)
      assert.equal(lock.packages[''].version, expected, `${folder}/package-lock.json packages[""]`)
    }
  }
  assert.match(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), /^## 2.0.30 —/m)
  assert.match(fs.readFileSync(path.join(root, 'vps/src/server.js'), 'utf8'), /VERSION = '2.0.30'/)
})


test('identificação de versão e nome na raiz para GitHub Manager', () => {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()
  assert.equal(version, expected)
  for (const file of ['github-manager.json', 'app_identity.json']) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
    assert.equal(metadata.name, 'al-sistemas-vps')
    assert.equal(metadata.displayName, 'AL Sistemas VPS')
    assert.equal(metadata.version, version)
    assert.equal(metadata.repository, 'drilemoz/alsistemas')
  }
})
