// Dados de diagnóstico por projeto: modo somente leitura, sem executar conteúdo do projeto.
// Não confundir configuração Nginx/HTTPS com disponibilidade pública verificada.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { projects } from './monitor.js'
import { detectSiteDomains } from './project_inspector.js'

const validName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const privateName = /^(?:\.|\.env|node_modules$|vendor$|__pycache__$|cache$|tmp$|\.git$)/i
const sensitiveName = /(?:\.(?:pem|key|p12|pfx|sqlite3?|db|sql|bak|backup|secret|kdbx)|(?:^|[-_.])(?:secret|credential|password|private[-_]?key)(?:[-_.]|$))/i
const MAX_ENTRIES = 2500
const MAX_DIRS = 350
const MAX_DEPTH = 6
const execCommand = async (...args) => (await promisify(execFile)(...args)).stdout

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

export async function estimateProjectStorage(directory, { maxEntries = MAX_ENTRIES, maxDirectories = MAX_DIRS, maxDepth = MAX_DEPTH } = {}) {
  // Conta metadados, sem ler conteúdo. O limite também inclui entradas descartadas.
  let files = 0, directories = 0, bytes = 0, skipped = 0, incomplete = false, visited = 0
  const stack = [{ directory, depth: 0 }]
  while (stack.length && visited < maxEntries && files + directories < maxEntries && directories < maxDirectories) {
    const item = stack.pop()
    try {
      const st = await fs.promises.lstat(item.directory)
      if (!st.isDirectory() || st.isSymbolicLink() || await fs.promises.realpath(item.directory) !== item.directory) {
        incomplete = true
        continue
      }
      const dir = await fs.promises.opendir(item.directory)
      directories++
      for await (const entry of dir) {
        if (visited >= maxEntries || files + directories >= maxEntries) { incomplete = true; break }
        visited++
        if (privateName.test(entry.name) || sensitiveName.test(entry.name) || entry.isSymbolicLink()) { skipped++; continue }
        const target = path.join(item.directory, entry.name)
        if (entry.isDirectory()) {
          if (item.depth >= maxDepth || directories + stack.length >= maxDirectories) { incomplete = true; continue }
          stack.push({ directory: target, depth: item.depth + 1 })
        } else if (entry.isFile()) {
          try {
            const st = await fs.promises.lstat(target)
            if (st.isFile() && !st.isSymbolicLink()) { bytes += st.size; files++ }
            else incomplete = true
          } catch { incomplete = true }
        }
      }
    } catch { incomplete = true }
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

async function phpInfo(exec) {
  try {
    const text = await exec('/usr/bin/php', ['-v'], { timeout: 1800, encoding: 'utf8', maxBuffer: 65536 })
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
async function mariaDbState(exec) {
  let value
  try { value = await exec('/bin/systemctl', ['is-active', 'mariadb'], { timeout:1800, encoding:'utf8', maxBuffer:2048 }) }
  catch (error) { value = error.stdout }
  return { active: 'ativo', inactive: 'inativo', failed: 'falhou', activating: 'iniciando', deactivating: 'parando' }[String(value || '').trim()] || 'não identificado'
}

// O root é parametrizável apenas em testes; a API usa sempre /var/www/projetos.
export async function projectOverview(name, { root = '/var/www/projetos', projectList = projects, domains = detectSiteDomains, exec = execCommand } = {}) {
  const directory = safeProjectDirectory(name, root)
  const project = projectList(root, { withDomains: false }).find(p => p.name === name)
  if (!project) throw Object.assign(new Error('Projeto não encontrado'), { status: 404 })
  const detected = domains(directory)
  const [storage, php, mariadbService, diskFreeBytes] = await Promise.all([
    estimateProjectStorage(directory), project.type === 'php' ? phpInfo(exec) : null, mariaDbState(exec),
    fs.promises.statfs(directory).then(disk => disk.bavail * disk.bsize, () => null),
  ])
  return {
    name: project.name, type: project.type, managed: project.managed, directory,
    version: safeVersion(directory), checkedAt: new Date().toISOString(),
    sites: detected.map(({ name, url, enabled, https, http }) => ({ name, url, configured: true, nginxEnabled: enabled, httpsConfigured: https, httpConfigured: http })).slice(0, 12),
    nginx: {
      managed: project.managed, enabled: project.enabled,
      configured: detected.length > 0,
      note: 'Configuração detectada; disponibilidade pública ainda não verificada',
    },
    php,
    composer: project.type === 'php' ? composerInfo(directory) : null,
    storage,
    diskFreeBytes,
    database: { state: 'não associado', mariadbService, note: 'O estado do MariaDB é global da VPS. Nenhum banco é associado automaticamente e nenhuma credencial é lida.' },
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
  const site = domains(directory).find(item => item.enabled && item.name && item.http !== false)
  if (!site) return { checked: false, note: 'Não há vhost HTTP na porta 80 habilitado identificado para este projeto.' }
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
