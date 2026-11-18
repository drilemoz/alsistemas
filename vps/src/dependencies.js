import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readJson } from './store.js'

export const PACKAGE_CATALOG = Object.freeze(JSON.parse(readFileSync(new URL('./package_catalog.json',import.meta.url),'utf8')).map(Object.freeze))
export const validPackageId = value => typeof value === 'string' && PACKAGE_CATALOG.some(pkg => pkg.id === value)

const probe = (runner,command,args,options = {}) => runner(command,args,{
  shell:false, encoding:'utf8', cwd:'/', timeout:1700, maxBuffer:32768,
  env:{PATH:'/usr/bin:/bin',LC_ALL:'C',HOME:'/nonexistent',NPM_CONFIG_USERCONFIG:'/dev/null',NPM_CONFIG_GLOBALCONFIG:'/nonexistent/als-npm-globalrc'},
  ...options
})
function queryPackages(runner) {
  try {
    const p = probe(runner,'/usr/bin/dpkg-query',['-W','-f=${binary:Package}\t${Status}\t${Version}\n',
      ...PACKAGE_CATALOG.map(item=>item.apt),'nodejs','npm','nginx'])
    if (p.error || ![0,1].includes(p.status)) return null
    const rows = new Map()
    for (const line of String(p.stdout || '').split('\n')) {
      const [name,status,version] = line.split('\t')
      if (name && status === 'install ok installed' && version) rows.set(name.split(':')[0],version.trim().slice(0,80))
    }
    return rows
  } catch { return null }
}
function npmVersion(runner) {
  try {
    const p = probe(runner,'/usr/bin/npm',['--version'])
    if (p.error?.code === 'ENOENT') return {state:'missing',version:null}
    const version = String(p.stdout || '').trim()
    return p.status === 0 && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)
      ? {state:'ready',version} : {state:'unavailable',version:null}
  } catch { return {state:'unavailable',version:null} }
}

export function dependencyInfo(runner = spawnSync, now = Date.now()) {
  let status = null
  try { status = readJson('packages-status.json') } catch { /* first installation */ }
  if (status && typeof status === 'object') {
    if (['queued','checking','installing'].includes(status.stage) && now - Date.parse(status.time) > 10*60*1000) {
      status = {...status,stage:'failed',message:'A instalação parou de atualizar. Recarregue o inventário antes de tentar novamente.'}
    }
  } else status = null
  const inventory = queryPackages(runner)
  const packages = PACKAGE_CATALOG.map(({id,apt,label,detail,group}) => ({
    id,group,label,detail,version:inventory?.get(apt) || null,
    installed: inventory ? inventory.has(apt) : null,
    installable: !!inventory
  }))
  const npm = npmVersion(runner)
  return {
    runtime: {
      node: {version:process.versions.node,packageVersion:inventory?.get('nodejs') || null},
      npm: {...npm,packageVersion:inventory?.get('npm') || null},
      nginx: {version:inventory?.get('nginx') || null}
    },
    inventoryAvailable: !!inventory,
    packages,status
  }
}
