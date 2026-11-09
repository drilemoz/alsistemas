import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = '/var/www/projetos'
const allowed = ['nginx', 'php8.3-fpm', 'mariadb', 'alsistemas-vps']
const managedPrefix = '# AL-SISTEMAS-MANAGED-SITE'
const legacyPrefix = '# Gerenciado pelo AL Sistemas; não altera sites existentes.'

export function parseMeminfo(text) {
  const result = {}
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_]+):\s+(\d+) kB/.exec(line)
    if (match) result[match[1]] = Number(match[2]) * 1024
  }
  return result
}
export function monitor() {
  const mem = parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'))
  const disk = fs.statfsSync('/')
  const total = disk.blocks * disk.bsize
  const free = disk.bavail * disk.bsize
  const services = Object.fromEntries(allowed.map(name => {
    try {
      const status = execFileSync('/bin/systemctl', ['is-active', name], { timeout: 1500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      return [name, status]
    } catch { return [name, 'inactive/unknown'] }
  }))
  const load = os.loadavg()
  return {
    timestamp: new Date().toISOString(), hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()), cpuCount: os.cpus().length,
    loadAverage: load, ram: { total: mem.MemTotal || os.totalmem(), available: mem.MemAvailable ?? os.freemem() },
    swap: { total: mem.SwapTotal || 0, free: mem.SwapFree || 0 },
    disk: { total, free, used: total - free }, services,
  }
}
export function projects(dir = root) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(entry.name) && !entry.name.startsWith('.'))
      .slice(0, 250)
      .map(entry => {
        const folder = path.join(dir, entry.name)
        let type = 'unknown'
        try {
          if (fs.lstatSync(folder).isSymbolicLink()) return null
          if (fs.existsSync(path.join(folder, 'public', 'index.php')) || fs.existsSync(path.join(folder, 'composer.json'))) type = 'php'
          else if (fs.existsSync(path.join(folder, 'package.json'))) type = 'node'
          else if (fs.existsSync(path.join(folder, 'public', 'index.html')) || fs.existsSync(path.join(folder, 'index.html'))) type = 'static'
        } catch { /* sem acesso ao conteúdo: exibir como desconhecido */ }
        let managed = false, domain = null, enabled = null
        // Metadados opcionais para projetos criados sem domínio; não autorizam operações.
        try {
          const metadata = path.join(folder, '.alsistemas.json')
          if (!fs.lstatSync(metadata).isSymbolicLink() && fs.statSync(metadata).uid === 0) {
            const info = JSON.parse(fs.readFileSync(metadata, 'utf8'))
            managed = info.managedBy === 'AL Sistemas'
          }
        } catch { /* projetos externos não precisam de metadados */ }
        // Só o helper privilegiado confirma se uma mudança é permitida.
        try {
          const config = `/etc/nginx/sites-available/als-${entry.name}.conf`
          if (!fs.lstatSync(config).isSymbolicLink()) {
            const raw = fs.readFileSync(config, 'utf8')
            if (raw.startsWith(managedPrefix) || raw.startsWith(legacyPrefix)) {
              const match = /^\s*server_name\s+([^;]+);/m.exec(raw)
              if (match) {
                domain = match[1].trim()
                const link = `/etc/nginx/sites-enabled/als-${entry.name}.conf`
                let linkTarget = null
                try { linkTarget = fs.readlinkSync(link) } catch { /* desativado */ }
                enabled = linkTarget === config
                managed = true
              }
            }
          }
        } catch { /* não há configuração gerenciada */ }
        return { name: entry.name, type, path: folder, managed, domain, enabled }
      }).filter(Boolean)
  } catch (e) { if (e.code === 'ENOENT') return []; throw e }
}


// Diagnóstico sob demanda, só unidades fixas. Não consulta logs ou executa comandos arbitrários.
export function serviceDiagnostics(exec = execFileSync) {
  const result = []
  for (const unit of allowed) {
    let state = 'unknown', substate = 'unknown', enabled = 'unknown'
    try {
      const raw = exec('/bin/systemctl', ['show', unit, '--property=ActiveState,SubState,UnitFileState', '--no-pager'],
        { timeout: 1800, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const data = Object.fromEntries(raw.trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)))
      state = data.ActiveState || 'unknown'
      substate = data.SubState || 'unknown'
      enabled = data.UnitFileState || 'unknown'
    } catch { /* sistema sem systemd ou unidade ausente */ }
    result.push({ unit, active: state, substate, enabled })
  }
  return { timestamp: new Date().toISOString(), services: result }
}
