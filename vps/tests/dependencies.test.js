import test from 'node:test'
import assert from 'node:assert/strict'
import { validPackageId, PACKAGE_CATALOG, dependencyInfo } from '../src/dependencies.js'

test('catálogo APT limita nomes, sem comandos arbitrários', () => {
  for (const id of ['php-curl', 'php-zip', 'composer']) assert.equal(validPackageId(id), true)
  for (const id of ['../etc', 'nginx;rm', 'nodejs', 'sudo', 'php8.3-curl', null, []]) assert.equal(validPackageId(id), false)
  assert.equal(PACKAGE_CATALOG.length, 8)
})
test('inventário usa dpkg-query sem shell e informa versões reais', () => {
  const seen = []
  const simulated = (command, args, opts) => {
    seen.push({ command, args, opts })
    return { status: 0, stdout: 'install ok installed\t8.3.0-1' }
  }
  const result = dependencyInfo(simulated)
  assert.equal(result.packages.length, 8)
  assert.equal(result.packages[0].installed, true)
  assert.equal(result.packages[0].version, '8.3.0-1')
  assert.equal(seen[0].command, '/usr/bin/dpkg-query')
  assert.equal(seen[0].opts.shell, false)
  assert.equal(seen[0].args[2], 'php8.3-curl')
})
