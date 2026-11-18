import { spawnSync } from 'node:child_process'
import { readFileSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs'
import { readJson, dataPath } from './store.js'

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

export function packageProgress(now = Date.now()) {
  let status = null
  try { status = readJson('packages-status.json') } catch { /* first installation */ }
  if (status && typeof status === 'object') {
    if (['queued','checking','installing','removing'].includes(status.stage) && now - Date.parse(status.time) > 10*60*1000) {
      status = {...status,stage:'failed',stale:true,message:'A instalação parou de atualizar. Recarregue o inventário antes de tentar novamente.'}
    }
  } else status = null
  return status
}
export function dependencyInfo(runner = spawnSync) {
  const status = packageProgress()
  const inventory = queryPackages(runner)
  const packages = PACKAGE_CATALOG.map(({id,apt,label,detail,group}) => ({
    id,apt,group,label,detail,version:inventory?.get(apt) || null,
    installed: inventory ? inventory.has(apt) : null,
    installable: !!inventory, removable: inventory?.has(apt) && !['python3','curl','unzip'].includes(apt)
  }))
  const npm = npmVersion(runner)
  return {
    runtime: {
      node: {version:process.versions.node,packageVersion:inventory?.get('nodejs') || null},
      npm: {...npm,packageVersion:inventory?.get('npm') || null},
      nginx: {version:inventory?.get('nginx') || null}
    },
    inventoryAvailable: !!inventory,
    checkedAt: new Date().toISOString(),
    packages,status
  }
}

const terminalStages = new Set(['completed','failed','canceled'])
function historyEntry(record) {
  if (typeof record?.job !== 'string' || !/^[a-f0-9]{24}$/.test(record.job) ||
      !terminalStages.has(record.stage) || !validPackageId(record.package) ||
      !['install','remove'].includes(record.operation) || typeof record.time !== 'string' || !Number.isFinite(Date.parse(record.time))) return null
  const { job, stage, package:pkg, operation, time } = record
  const label = PACKAGE_CATALOG.find(p=>p.id===pkg).label
  const startedAt = typeof record.startedAt === 'string' && Number.isFinite(Date.parse(record.startedAt)) ? record.startedAt : null
  return {job,stage,package:pkg,label,operation,time,startedAt,
    message:typeof record.message==='string'?record.message.slice(0,200):'',
    log:typeof record.log==='string'?record.log.slice(-18000):''}
}
export function packageHistory(job = null) {
  const entries = new Map()
  const current = packageProgress()
  const latest = current?.stale ? null : historyEntry(current)
  if (latest) entries.set(latest.job,latest)
  let fd
  try {
    fd = openSync(dataPath('packages-history.json'),constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    const info = fstatSync(fd)
    if (info.isFile() && info.nlink === 1 && info.size <= 1024*1024) {
      const buffer = Buffer.alloc(info.size + 1)
      let count = 0
      while (count < buffer.length) {
        const bytes = readSync(fd,buffer,count,buffer.length-count,null)
        if (!bytes) break
        count += bytes
      }
      const records = count <= info.size ? JSON.parse(buffer.subarray(0,count).toString('utf8')) : []
      if (Array.isArray(records)) for (const item of records.slice(0,20)) {
        const entry = historyEntry(item)
        if (entry && !entries.has(entry.job)) entries.set(entry.job,entry)
      }
    }
  } catch { /* history may not exist yet; the last terminal status is still available */ }
  finally { if (fd !== undefined) closeSync(fd) }
  const ordered = [...entries.values()].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,20)
  if (job) return ordered.find(entry=>entry.job===job) || null
  return ordered.map(({log,...record})=>({...record,hasLog:!!log}))
}
