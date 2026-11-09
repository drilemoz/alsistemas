import { spawnSync } from 'node:child_process'
import { readJson } from './store.js'

export const PACKAGE_CATALOG = Object.freeze([
  { id: 'php-curl', label: 'PHP 8.3 · cURL', apt: 'php8.3-curl' },
  { id: 'php-mbstring', label: 'PHP 8.3 · mbstring', apt: 'php8.3-mbstring' },
  { id: 'php-xml', label: 'PHP 8.3 · XML', apt: 'php8.3-xml' },
  { id: 'php-mysql', label: 'PHP 8.3 · MySQL', apt: 'php8.3-mysql' },
  { id: 'php-zip', label: 'PHP 8.3 · ZIP', apt: 'php8.3-zip' },
  { id: 'php-gd', label: 'PHP 8.3 · GD', apt: 'php8.3-gd' },
  { id: 'php-intl', label: 'PHP 8.3 · Intl', apt: 'php8.3-intl' },
  { id: 'composer', label: 'Composer', apt: 'composer' }
])

export const validPackageId = value => typeof value === 'string' && PACKAGE_CATALOG.some(pkg => pkg.id === value)

function queryPackage(name, runner = spawnSync) {
  try {
    const p = runner('/usr/bin/dpkg-query', ['-W', '-f=${Status}\t${Version}', name], {
      encoding: 'utf8', shell: false, timeout: 1400, maxBuffer: 8192
    })
    const result = String(p.stdout || '')
    if (p.status !== 0 || !result.startsWith('install ok installed\t')) return { installed: false, version: null }
    return { installed: true, version: result.slice('install ok installed\t'.length).trim().slice(0, 60) }
  } catch { return { installed: false, version: null } }
}

export function dependencyInfo(runner = spawnSync) {
  let status = null
  try { status = readJson('packages-status.json') } catch { /* first installation */ }
  return {
    packages: PACKAGE_CATALOG.map(p => ({ id: p.id, label: p.label, ...queryPackage(p.apt, runner) })),
    status: status && typeof status === 'object' ? status : null,
    note: 'Instalação permitida apenas para os pacotes listados. npm e Composer de projetos terão isolamento próprio em uma etapa futura.'
  }
}
