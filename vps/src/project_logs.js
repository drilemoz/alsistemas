// Consulta SOMENTE LEITURA de logs exclusivamente associados a um projeto.
// Sem shell, sem seguir links simbólicos, sem ler logs globais ou arquivos secretos.
import fs from 'node:fs'
import path from 'node:path'
import { projects } from './monitor.js'
import { safeProjectDirectory } from './project_overview.js'
import { detectSiteDomains } from './project_inspector.js'

const MAX_SOURCES = 8
const MAX_READ = 48 * 1024
const MAX_LINES = 70
const MAX_LINE = 850
const nginxName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.log$/
const phpName = /^(?:laravel(?:-\d{4}-\d{2}-\d{2})?|php[-_]error|error|app)\.log$/i

// Não é garantia de limpeza total de segredos. Não envia nada a terceiros.
export function redactProjectLog(line) {
  return String(line || '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
    .replace(/\b(Authorization|Cookie|Set-Cookie|X-Api-Key)\s*[:=]\s*.*/gi, '$1=[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|token|secret|api[_-]?key|session)\s*[:=]\s*["']?[^\s,;"']+/gi, '$1=[REDACTED]')
    .replace(/([A-Z]+\s+\S+?)\?[^\s"']+/g, '$1?[QUERY_REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\b[0-9a-f]{28,}\b/gi, '[HEX_REDACTED]')
    .slice(0, MAX_LINE)
}

function isRegularNoLink(filename) {
  try { const st = fs.lstatSync(filename); return st.isFile() && !st.isSymbolicLink() }
  catch { return false }
}
function isDirNoLink(filename) {
  try { const st = fs.lstatSync(filename); return st.isDirectory() && !st.isSymbolicLink() }
  catch { return false }
}

// Ler apenas a cauda, evitando carregar logs enormes na memória.
export function readLogTail(filename, { maxBytes = MAX_READ, maxLines = MAX_LINES } = {}) {
  const st = fs.lstatSync(filename)
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('Arquivo de log não é regular')
  const size = Math.min(maxBytes, st.size)
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
  try {
    const buffer = Buffer.alloc(size)
    const bytes = fs.readSync(fd, buffer, 0, size, st.size - size)
    const text = buffer.subarray(0, bytes).toString('utf8')
    let chunks = text.split(/\r?\n/)
    if (st.size > size) chunks = chunks.slice(1) // primeira linha pode estar incompleta
    const lines = chunks.filter(Boolean).slice(-maxLines).map(redactProjectLog)
    return { lines, truncated: st.size > size || chunks.length > maxLines, bytesScanned: bytes }
  } finally { fs.closeSync(fd) }
}

function nginxBlocks(config) {
  // Apenas blocos server completos. Não executar configurações ou seguir includes.
  const clean = config.replace(/^\s*#.*$/gm, '')
  const found = []
  const pattern = /\bserver\s*\{/g
  let m
  while ((m = pattern.exec(clean)) && found.length < 60) {
    let depth = 1, i = pattern.lastIndex
    for (; i < clean.length && depth; i++) {
      if (clean[i] === '{') depth++
      if (clean[i] === '}') depth--
    }
    if (!depth) found.push(clean.slice(pattern.lastIndex, i - 1))
    pattern.lastIndex = i
  }
  return found
}
function nginxPaths(directory, siteList, available) {
  const paths = new Set()
  const validConfig = /^[A-Za-z0-9_.-]+\.conf$/
  for (const site of siteList.slice(0, 12)) {
    if (!site.enabled || !validConfig.test(site.config || '')) continue
    const configPath = path.join(available, site.config)
    if (!isRegularNoLink(configPath)) continue
    let config
    try {
      if (fs.statSync(configPath).size > 512 * 1024) continue
      config = fs.readFileSync(configPath, 'utf8')
    } catch { continue }
    for (const block of nginxBlocks(config)) {
      const roots = [...block.matchAll(/(?:^|[;{}\n])\s*root\s+([^;\s]+)\s*;/gm)].map(match => match[1])
      if (!roots.some(root => root === directory || root === path.join(directory, 'public'))) continue
      // Sem logs globais herdados de http{} e sem logs de outros vhosts.
      for (const match of block.matchAll(/\berror_log\s+(\/var\/log\/nginx\/[A-Za-z0-9._-]+\.log)(?:\s+[^;]+)?\s*;/g)) {
        const filename = path.basename(match[1])
        if (nginxName.test(filename) && filename !== 'error.log' && filename !== 'access.log') paths.add(match[1])
      }
    }
  }
  return [...paths].slice(0, 3)
}
function phpPaths(directory) {
  const found = []
  for (const relative of ['storage/logs', 'logs']) {
    const folder = path.join(directory, relative)
    if (relative.includes('/') && !isDirNoLink(path.join(directory, relative.split('/')[0]))) continue
    if (!isDirNoLink(folder)) continue
    let items
    try { items = fs.readdirSync(folder, { withFileTypes: true }) } catch { continue }
    for (const entry of items) {
      if (!entry.isFile() || !phpName.test(entry.name)) continue
      const filename = path.join(folder, entry.name)
      if (isRegularNoLink(filename)) found.push({ filename, label: relative + '/' + entry.name })
    }
  }
  return found.sort((a,b) => {
    try { return fs.statSync(b.filename).mtimeMs - fs.statSync(a.filename).mtimeMs } catch { return 0 }
  }).slice(0, 5)
}

export function projectLogs(name, { root = '/var/www/projetos', available = '/etc/nginx/sites-available', projectList = projects, domains = detectSiteDomains } = {}) {
  const directory = safeProjectDirectory(name, root)
  if (!projectList(root).some(project => project.name === name)) throw Object.assign(new Error('Projeto não encontrado'), { status:404 })
  const sources = []
  const files = [
    ...phpPaths(directory).map(file => ({ ...file, type:'php' })),
    ...nginxPaths(directory, domains(directory, { available }), available).map(filename => ({ filename, label:'Nginx: ' + path.basename(filename), type:'nginx' })),
  ].slice(0, MAX_SOURCES)
  for (const item of files) {
    const entry = { type:item.type, label:item.label, available:false, lines:[], truncated:false }
    try {
      const result = readLogTail(item.filename)
      Object.assign(entry, result, { available:true })
    } catch (error) {
      entry.reason = error.code === 'EACCES' || error.code === 'EPERM' ? 'Sem permissão de leitura para o serviço do painel' : 'Log indisponível no momento'
    }
    sources.push(entry)
  }
  return {
    name, checkedAt:new Date().toISOString(), sources,
    note: sources.length
      ? 'Trechos recentes de logs associados ao projeto. Dados sensíveis comuns são ocultados, mas revise o conteúdo antes de compartilhar.'
      : 'Nenhum log isolado do projeto foi encontrado. Logs globais do Nginx e do PHP não são exibidos para evitar mistura entre sites.',
    limits:{ maxSources:MAX_SOURCES, maxLinesPerSource:MAX_LINES, maxBytesPerSource:MAX_READ },
  }
}
