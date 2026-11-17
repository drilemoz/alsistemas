import fs from 'node:fs'
import path from 'node:path'

const validName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/
const validHost = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const hidden = /^(?:\.|node_modules$|vendor$|__pycache__$|cache$|\.env.*$)/i
const sensitive = /(?:\.(?:pem|key|p12|pfx|sqlite3?|db|sql|bak|backup|secret|kdbx)|(?:^|[-_.])(?:secret|credential|password|private[-_]?key)(?:[-_.]|$))/i
const fileLimit = 150

function isSafeHost(name) {
  return validHost.test(name) && !name.includes('..') && !/\.(?:local|internal|invalid|test)$/i.test(name)
}
function readSafe(pathname, max = 512 * 1024) {
  const s = fs.lstatSync(pathname)
  if (!s.isFile() || s.isSymbolicLink() || s.size > max) return null
  return fs.readFileSync(pathname, 'utf8')
}
// Só considera diretivas literais do próprio bloco server. Não segue includes.
function serverDirectives(text) {
  const tokens = text.match(/#[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{[^}]*\}|[{};]|[^\s{};#"']+/g) || []
  const blocks = []
  let depth = 0, serverDepth = -1, directives, words = []
  for (const token of tokens) {
    if (token.startsWith('#')) continue
    if (token === '{') {
      if (serverDepth === -1 && words.length === 1 && words[0] === 'server') {
        if (blocks.length >= 80) break
        serverDepth = depth + 1
        directives = new Map()
      }
      depth++
      words = []
    } else if (token === '}') {
      if (depth === serverDepth) {
        blocks.push(directives)
        serverDepth = -1
      }
      depth--
      words = []
    } else if (token === ';') {
      if (depth === serverDepth && words.length > 1) {
        const [key, ...args] = words
        directives.set(key, [...(directives.get(key) || []), args])
      }
      words = []
    } else words.push(token)
  }
  return blocks
}
const unquote = value => value.replace(/^(["'])(.*)\1$/, '$2')
const siteFile = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/

export function indexSiteDomains({ available = '/etc/nginx/sites-available', enabled = '/etc/nginx/sites-enabled' } = {}) {
  const configs = new Map()
  function entries(folder) {
    try { return fs.readdirSync(folder, { withFileTypes: true }).slice(0, 200) } catch { return [] }
  }
  for (const entry of entries(available)) {
    if (!entry.isFile() || !siteFile.test(entry.name)) continue
    const filename = path.resolve(available, entry.name)
    configs.set(filename, { name: entry.name, enabled: false })
  }
  for (const entry of entries(enabled)) {
    if (!siteFile.test(entry.name)) continue
    const filename = path.resolve(enabled, entry.name)
    try {
      if (entry.isSymbolicLink()) {
        const destination = path.resolve(enabled, fs.readlinkSync(filename))
        if (configs.has(destination)) configs.get(destination).enabled = true
      } else if (entry.isFile()) configs.set(filename, { name: entry.name, enabled: true })
    } catch { /* configuração indisponível */ }
  }
  const byRoot = new Map()
  for (const [filename, config] of configs) {
    let raw
    try { raw = readSafe(filename, 128 * 1024) } catch { continue }
    if (!raw) continue
    for (const block of serverDirectives(raw)) {
      const value = block.get('root')?.[0]?.[0]
      if (!value) continue
      const root = unquote(value)
      if (!path.isAbsolute(root) || /[$*{}\\]/.test(root)) continue
      const resolved = path.resolve(root)
      const names = (block.get('server_name') || []).flat().map(unquote).filter(isSafeHost)
      if (!names.length) continue
      const listens = block.get('listen') || []
      let http = !listens.length, https = false
      for (const [address, ...options] of listens) {
        const match = /(?:^|:)(80|443)$/.exec(unquote(address))
        if (match?.[1] === '80' && !options.includes('ssl')) http = true
        if (match?.[1] === '443' && (options.includes('ssl') || block.has('ssl_certificate'))) https = true
      }
      const sites = byRoot.get(resolved) || []
      for (const name of names) sites.push({ name, http, https, enabled: config.enabled, config: config.name })
      byRoot.set(resolved, sites)
    }
  }
  return projectPath => {
    const canonical = path.resolve(projectPath)
    const found = new Map()
    for (const site of [...(byRoot.get(canonical) || []), ...(byRoot.get(path.join(canonical, 'public')) || [])]) {
      const key = site.name.toLowerCase()
      const old = found.get(key)
      if (!old || (site.enabled && !old.enabled)) found.set(key, { ...site })
      else if (site.enabled === old.enabled) {
        old.http ||= site.http
        if (site.https && !old.https) {
          old.https = true
          old.config = site.config
        }
      }
    }
    return [...found.values()].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
      .slice(0, 12).map(site => ({ ...site, url: site.https ? 'https://' + site.name : site.http ? 'http://' + site.name : null }))
  }
}

export function detectSiteDomains(projectPath, options) {
  return indexSiteDomains(options)(projectPath)
}

function safeProject(root, name) {
  if (typeof name !== 'string' || !validName.test(name) || name.startsWith('.')) {
    throw Object.assign(new Error('Nome de projeto inválido'), { status: 400 })
  }
  const project = path.join(root, name)
  try {
    if (!fs.lstatSync(project).isDirectory() || fs.lstatSync(project).isSymbolicLink()) throw new Error()
    const actualRoot = fs.realpathSync(root)
    const actualProject = fs.realpathSync(project)
    if (actualProject !== path.join(actualRoot, name)) throw new Error()
  } catch {
    throw Object.assign(new Error('Projeto indisponível para navegação'), { status: 404 })
  }
  return project
}

// Não lê o conteúdo dos arquivos. Evita links simbólicos, .env, chaves e pastas
// do sistema, limita profundidade e total de entradas; não altera o projeto.
export function listProjectDirectory(name, relative = '', root = '/var/www/projetos') {
  const project = safeProject(root, name)
  if (typeof relative !== 'string' || relative.length > 512 || relative.startsWith('/') || relative.includes('\\') || relative.includes('\0')) {
    throw Object.assign(new Error('Caminho inválido'), { status: 400 })
  }
  const parts = relative ? relative.split('/') : []
  if (parts.length > 5 || parts.some(part => !part || part === '.' || part === '..' || hidden.test(part) || sensitive.test(part) || !/^[^\x00-\x1f/]{1,128}$/.test(part))) {
    throw Object.assign(new Error('Caminho não permitido'), { status: 400 })
  }
  let dir = project
  for (const part of parts) {
    dir = path.join(dir, part)
    try {
      const stat = fs.lstatSync(dir)
      if (!stat.isDirectory() || stat.isSymbolicLink() || !fs.realpathSync(dir).startsWith(project + path.sep)) throw new Error()
    } catch { throw Object.assign(new Error('Diretório indisponível'), { status: 404 }) }
  }
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { throw Object.assign(new Error('Sem permissão para listar a pasta'), { status: 403 }) }
  const list = entries.filter(x => (x.isFile() || x.isDirectory()) && !x.isSymbolicLink() &&
    !hidden.test(x.name) && !sensitive.test(x.name) && x.name.length <= 128)
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'pt-BR'))
  const output = list.slice(0, fileLimit).map(x => {
    let size = null
    if (x.isFile()) { try { size = fs.lstatSync(path.join(dir, x.name)).size } catch {} }
    return { name: x.name, directory: x.isDirectory(), size }
  })
  return { name, path: parts.join('/'), parent: parts.slice(0, -1).join('/'), entries: output, truncated: list.length > fileLimit, readOnly: true }
}
