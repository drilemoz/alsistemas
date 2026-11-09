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
function stripComments(text) {
  return text.split(/\r?\n/).map(line => line.replace(/\s+#.*$/, '').replace(/^\s*#.*/, '')).join('\n')
}
function serverBlocks(text) {
  const cleaned = stripComments(text)
  const blocks = []
  const re = /\bserver\s*\{/g
  let m
  while ((m = re.exec(cleaned)) && blocks.length < 80) {
    let depth = 1, i = re.lastIndex
    for (; i < cleaned.length && depth; i++) {
      if (cleaned[i] === '{') depth++
      if (cleaned[i] === '}') depth--
    }
    if (depth === 0) blocks.push(cleaned.slice(re.lastIndex, i - 1))
    re.lastIndex = i
  }
  return blocks
}
function safeRoot(root, projectPath) {
  if (!root || /[$*{}]/.test(root)) return false
  const resolved = path.resolve(root)
  return resolved === projectPath || resolved === path.join(projectPath, 'public')
}

// Detecta apenas domínios que apontam explicitamente para a pasta do projeto.
// Não considera domínio publicado sem correspondência de 'root' e server_name.
export function detectSiteDomains(projectPath, { available = '/etc/nginx/sites-available', enabled = '/etc/nginx/sites-enabled' } = {}) {
  const found = new Map()
  let files
  try { files = fs.readdirSync(available, { withFileTypes: true }) } catch { return [] }
  for (const f of files.slice(0, 200)) {
    if (!f.isFile() || !/^[A-Za-z0-9_.-]+\.conf$/.test(f.name)) continue
    const config = path.join(available, f.name)
    let content
    try { content = readSafe(config) } catch { continue }
    if (!content) continue
    let active = false
    try {
      const link = path.join(enabled, f.name)
      if (fs.lstatSync(link).isSymbolicLink()) active = path.resolve(enabled, fs.readlinkSync(link)) === config
      else if (fs.lstatSync(link).isFile()) active = fs.realpathSync(link) === fs.realpathSync(config)
    } catch { /* desativado ou desconhecido */ }
    for (const block of serverBlocks(content)) {
      const roots = [...block.matchAll(/(?:^|[;{}\n])\s*root\s+([^;\s]+)\s*;/gm)].map(m => m[1])
      if (!roots.some(root => safeRoot(root, projectPath))) continue
      const names = [...block.matchAll(/\bserver_name\s+([^;]+);/g)]
        .flatMap(m => m[1].trim().split(/\s+/)).filter(isSafeHost)
      const secure = /\blisten\s+[^;]*\b443\b[^;]*;/m.test(block) || /\bssl_certificate\s+/m.test(block)
      for (const domain of names) {
        const key = domain.toLowerCase()
        const old = found.get(key)
        // Preferir bloco HTTPS e configuração habilitada.
        if (!old || (active && !old.enabled) || (secure && !old.https && active === old.enabled)) {
          found.set(key, { name: domain, url: `${secure ? 'https' : 'http'}://${domain}`, enabled: active, https: secure, config: f.name })
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)).slice(0, 12)
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
