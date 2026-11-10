// Dados de diagnóstico por projeto: modo somente leitura, sem executar conteúdo do projeto.
// Não confundir configuração Nginx/HTTPS com disponibilidade pública verificada.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { projects } from './monitor.js'
import { detectSiteDomains } from './project_inspector.js'

const validName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const privateName = /^(?:\.|\.env|node_modules$|vendor$|__pycache__$|cache$|tmp$|\.git$)/i
const sensitiveName = /(?:\.(?:pem|key|p12|pfx|sqlite3?|db|sql|bak|backup|secret|kdbx)|(?:^|[-_.])(?:secret|credential|password|private[-_]?key)(?:[-_.]|$))/i
const MAX_ENTRIES = 2500
const MAX_DIRS = 350
const MAX_DEPTH = 6

function isAllowedName(name) {
  return typeof name === 'string' && validName.test(name) && !name.startsWith('.') && !['iguatama-teste', 'alsistemas'].includes(name)
}
export function safeProjectDirectory(name, root) {
  if (!isAllowedName(name)) throw Object.assign(new Error('Projeto não autorizado'), { status: 404 })
  const rootReal = fs.realpathSync(root)
  const candidate = path.join(rootReal, name)
  try {
    const st = fs.lstatSync(candidate)
    if (!st.isDirectory() || st.isSymbolicLink() || fs.realpathSync(candidate) !== candidate) throw new Error()
  } catch {
    throw Object.assign(new Error('Projeto indisponível'), { status: 404 })
  }
  return candidate
}

export function estimateProjectStorage(directory, { maxEntries = MAX_ENTRIES, maxDirectories = MAX_DIRS, maxDepth = MAX_DEPTH } = {}) {
  // Não segue links simbólicos nem lê conteúdo. Valores limitados e sinalizados como parciais.
  let files = 0, directories = 0, bytes = 0, skipped = 0, incomplete = false
  const stack = [{ directory, depth: 0 }]
  while (stack.length && files + directories < maxEntries && directories < maxDirectories) {
    const item = stack.pop()
    if (item.depth > maxDepth) { incomplete = true; continue }
    directories++
    let entries
    try { entries = fs.readdirSync(item.directory, { withFileTypes: true }) }
    catch { incomplete = true; continue }
    for (const entry of entries) {
      if (files + directories >= maxEntries || directories >= maxDirectories) { incomplete = true; break }
      if (privateName.test(entry.name) || sensitiveName.test(entry.name) || entry.isSymbolicLink()) { skipped++; continue }
      const target = path.join(item.directory, entry.name)
      if (entry.isDirectory()) {
        if (item.depth >= maxDepth) { incomplete = true; continue }
        stack.push({ directory: target, depth: item.depth + 1 })
      } else if (entry.isFile()) {
        try {
          const st = fs.lstatSync(target)
          if (st.isFile() && !st.isSymbolicLink()) { bytes += st.size; files++ }
        } catch { incomplete = true }
      }
    }
  }
  if (stack.length) incomplete = true
  return { bytes, files, directories, skipped, incomplete, limits: { maxEntries, maxDirectories, maxDepth } }
}

function safeVersion(directory) {
  try {
    const file = path.join(directory, 'VERSION')
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128) return null
    const value = fs.readFileSync(file, 'utf8').trim()
    return /^[vV]?\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-+][A-Za-z0-9.-]{1,40})?$/.test(value) ? value : null
  } catch { return null }
}

function phpInfo(exec = execFileSync) {
  try {
    const text = exec('/usr/bin/php', ['-v'], { timeout: 1800, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 65536 })
    return { version: /PHP\s+(\d+\.\d+\.\d+)/i.exec(text)?.[1] || null, source: 'PHP CLI, não necessariamente o pool PHP-FPM do site' }
  } catch { return { version: null, source: 'PHP CLI indisponível; PHP-FPM não verificado' } }
}

function readSmallJsonFile(directory, filename, limit = 65536) {
  try {
    const target = path.join(directory, filename)
    const st = fs.lstatSync(target)
    if (!st.isFile() || st.isSymbolicLink() || st.size > limit) return null
    const data = JSON.parse(fs.readFileSync(target, 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch { return null }
}
function composerInfo(directory) {
  const manifest = readSmallJsonFile(directory, 'composer.json')
  if (!manifest) return { present:false, dependencies:null, note:'composer.json não encontrado ou indisponível' }
  const requires = manifest.require && typeof manifest.require === 'object' && !Array.isArray(manifest.require) ? Object.keys(manifest.require) : []
  const lock = readSmallJsonFile(directory, 'composer.lock', 2 * 1024 * 1024)
  return { present:true, dependencies:requires.filter(name => name !== 'php' && !name.startsWith('ext-')).length,
    lockedPackages:Array.isArray(lock?.packages) ? lock.packages.length : null,
    note:'Contagem declarada no Composer; segurança das dependências não verificada' }
}
function mariaDbState(exec = execFileSync) {
  try {
    const value = exec('/bin/systemctl', ['is-active', 'mariadb'], { timeout:1800, encoding:'utf8', stdio:['ignore','pipe','ignore'], maxBuffer:2048 }).trim()
    return value === 'active' ? 'ativo' : value === 'inactive' ? 'inativo' : 'não identificado'
  } catch { return 'não identificado' }
}

// O root é parametrizável apenas em testes; a API usa sempre /var/www/projetos.
export function projectOverview(name, { root = '/var/www/projetos', projectList = projects, domains = detectSiteDomains, exec = execFileSync } = {}) {
  const directory = safeProjectDirectory(name, root)
  const project = projectList(root).find(p => p.name === name)
  if (!project) throw Object.assign(new Error('Projeto não encontrado'), { status: 404 })
  const detected = domains(directory)
  const storage = estimateProjectStorage(directory)
  let freeBytes = null
  try { const disk = fs.statfsSync(directory); freeBytes = disk.bavail * disk.bsize } catch { /* desconhecido */ }
  return {
    name: project.name, type: project.type, managed: project.managed, directory,
    version: safeVersion(directory), checkedAt: new Date().toISOString(),
    sites: detected.map(({ name, url, enabled, https }) => ({ name, url, configured: true, nginxEnabled: enabled, httpsConfigured: https })).slice(0, 12),
    nginx: { managed: project.managed, enabled: project.enabled, note: 'Configuração detectada; disponibilidade pública ainda não verificada' },
    php: project.type === 'php' ? phpInfo(exec) : null,
    composer: project.type === 'php' ? composerInfo(directory) : null,
    storage,
    diskFreeBytes: freeBytes,
    database: { state: 'não associado', mariadbService: mariaDbState(exec), note: 'O estado do MariaDB é global da VPS. Nenhum banco é associado automaticamente e nenhuma credencial é lida.' },
    httpsNote: 'HTTPS configurado no Nginx não confirma certificado válido ou site acessível.',
  }
}

export function projectActivities(name, events = [], updateStatus = null) {
  if (!isAllowedName(name)) throw Object.assign(new Error('Projeto não autorizado'), { status: 404 })
  const filtered = (Array.isArray(events) ? events : [])
    .filter(event => event && event.name === name)
    .slice(0, 40).map(ev => ({ time: String(ev.time || ''), event: String(ev.event || '').slice(0, 60), action: String(ev.action || '').slice(0, 60), success: ev.success ?? null }))
  const update = name === 'iguatamaonline' && updateStatus ? {
    stage: String(updateStatus.stage || '').slice(0, 40), message: String(updateStatus.message || '').slice(0, 180),
    updatedAt: String(updateStatus.updatedAt || '').slice(0, 45),
  } : null
  return { name, events: filtered, lastProjectUpdate: update, note: 'Histórico administrativo disponível. Não inclui arquivos de log do Nginx/PHP nem garante registro de alterações externas.' }
}

// Diagnóstico local, sob demanda, sem DNS, sem seguir redirecionamentos e sem executar código.
// Nunca afirma disponibilidade pela Internet; consulta o vhost Nginx via 127.0.0.1:80.
export async function probeProjectWebsite(name, { root = '/var/www/projetos', domains = detectSiteDomains, port = 80 } = {}) {
  const directory = safeProjectDirectory(name, root)
  const site = domains(directory).find(item => item.enabled && item.name)
  if (!site) return { checked: false, note: 'Não há vhost Nginx habilitado identificado para este projeto.' }
  const started = process.hrtime.bigint()
  return new Promise(resolve => {
    const request = http.request({ hostname:'127.0.0.1', port, method:'HEAD', path:'/', headers: { Host:site.name }, timeout:2500, agent:false }, response => {
      response.resume()
      resolve({ checked:true, site:site.name, statusCode:response.statusCode, elapsedMs:Number((process.hrtime.bigint() - started) / 1000000n), source:'HTTP local do Nginx; internet pública não testada' })
    })
    request.on('timeout', () => request.destroy(Object.assign(new Error('Timeout'), { code:'ETIMEDOUT' })))
    request.on('error', error => resolve({ checked:false, site:site.name, errorCode:['ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(error.code) ? error.code : 'indisponível', note:'Teste HTTP local não concluído; a disponibilidade pública não foi verificada.' }))
    request.end()
  })
}
