import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { findTrusted, rememberDevice, revokeDevice, revokeAllDevices, trustedDevices, TRUST_MS } from './trusted.js'
import { updateInfo, checkRelease, validateRepo, configureRepo } from './updates.js'
import { audit, dataPath, lastAudit, readJson, writeJson } from './store.js'
import { base32, constantEquals, hashPassword, matchingTotpStep, randomToken, strongPassword, verifyPassword, verifyTotp } from './security.js'
import { monitor, projects, serviceDiagnostics } from './monitor.js'
import { dependencyInfo, validPackageId } from './dependencies.js'
import crypto from 'node:crypto'
import { spaceshipStatus, saveSpaceship, removeSpaceship, listSpaceshipDns } from './integrations.js'

const VERSION = '2.0.13'
const PORT = Number(process.env.ALS_PORT || 8181)
const HOST = '127.0.0.1' // Nunca expor Node diretamente à Internet.
const origin = process.env.ALS_ORIGIN || 'http://localhost:8181'
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const sessions = new Map()
const attempts = new Map()
const challenges = new Map()
const csrfSafe = new Set(['GET', 'HEAD'])

function json(res, status, data, headers = {}) {
  const payload = JSON.stringify(data)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(payload)
}
function fail(res, code, reason) { json(res, code, { error: reason }) }
function cookies(req) {
  const out = {}
  for (const item of (req.headers.cookie || '').split(';')) {
    const index = item.indexOf('=')
    if (index > 0) out[item.slice(0, index).trim()] = item.slice(index + 1).trim()
  }
  return out
}
function setSession(res, token) {
  const secure = origin.startsWith('https://') ? '; Secure' : ''
  res.setHeader('set-cookie', `als_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`)
}
function setTrustedCookie(res, token) {
  const secure = origin.startsWith('https://') ? '; Secure' : ''
  const existing = res.getHeader('set-cookie') || []
  const previous = Array.isArray(existing) ? existing : [existing]
  res.setHeader('set-cookie', [...previous, `als_trusted=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TRUST_MS / 1000}${secure}`])
}
function removeTrustedCookie(res) {
  const secure = origin.startsWith('https://') ? '; Secure' : ''
  res.setHeader('set-cookie', `als_trusted=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`)
}
function sessionFrom(req) {
  const token = cookies(req).als_session
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const entry = sessions.get(crypto.createHash('sha256').update(token).digest('hex'))
  if (!entry) return null
  if (entry.expires < Date.now()) { sessions.delete(entry.key); return null }
  return entry
}
function newSession(res) {
  const token = randomToken()
  const key = crypto.createHash('sha256').update(token).digest('hex')
  const csrf = randomToken()
  sessions.set(key, { key, csrf, expires: Date.now() + 8 * 3600000 })
  if (sessions.size > 30) for (const [k, v] of sessions) if (v.expires < Date.now()) sessions.delete(k)
  // Limite superior explícito: sessões em memória jamais crescem sem controle.
  while (sessions.size > 256) sessions.delete(sessions.keys().next().value)
  setSession(res, token)
  return { csrf }
}
async function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Content-Type JSON obrigatório'), { status: 415 })
  let size = 0; const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 8192) throw Object.assign(new Error('Corpo excede 8 KiB'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error()
    return value
  } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }) }
}
function limit(ip, name, max = 5) {
  const key = `${ip}:${name}`
  const old = attempts.get(key) || { count: 0, until: Date.now() + 15 * 60000 }
  if (old.until < Date.now()) { old.count = 0; old.until = Date.now() + 15 * 60000 }
  old.count += 1; attempts.set(key, old)
  if (attempts.size > 1000) attempts.clear()
  return old.count <= max
}
function clientIp(req) {
  // Usa o endereço do socket: X-Real-IP pode ser forjado por processos locais.
  return String(req.socket.remoteAddress || '').slice(0, 64)
}
function acceptedOrigin(req) {
  if (req.headers.origin !== origin) return false
  const fetchSite = req.headers['sec-fetch-site']
  return !fetchSite || fetchSite === 'same-origin'
}
function serveUi(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const paths = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/integrations.js': ['integrations.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/tutorial-instalacao.html': ['tutorial-instalacao.html', 'text/html; charset=utf-8'] }
  const asset = paths[pathname]
  if (!asset) return fail(res, 404, 'Não encontrado')
  const source = path.join(publicDir, asset[0])
  res.writeHead(200, { 'content-type': asset[1], 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
    'content-security-policy': pathname === '/tutorial-instalacao.html' ? "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" : "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' })
  fs.createReadStream(source).pipe(res)
}
function runTask(task) {
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/sudo', ['-n', '/usr/local/libexec/alsistemas-helper'], { stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: true })
    const killSubprocessGroup = () => { try { process.kill(-proc.pid, 'SIGKILL') } catch { proc.kill('SIGKILL') } }
    let output = ''; let error = ''
    const deadline = task.action === 'backup_project' ? 120000 : 45000
    const timer = setTimeout(() => { killSubprocessGroup(); reject(new Error('Tarefa excedeu limite de execução')) }, deadline)
    proc.stdout.on('data', c => { output += c; if (output.length > 8192) killSubprocessGroup() })
    proc.stderr.on('data', c => { error += c; if (error.length > 8192) killSubprocessGroup() })
    proc.on('error', err => { clearTimeout(timer); reject(err) })
    proc.on('close', code => {
      clearTimeout(timer)
      try {
        const result = JSON.parse(output)
        if (code !== 0 || !result.ok) reject(new Error(result.error || 'Erro na tarefa'))
        else resolve(result)
      } catch { reject(new Error('Falha no executor restrito: ' + error.slice(0, 100))) }
    })
    proc.stdin.end(JSON.stringify(task))
  })
}

export function createServer({ taskRunner = runTask } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'no-referrer')
    res.setHeader('x-frame-options', 'DENY')
    const ip = clientIp(req)
    try {
      const path = new URL(req.url || '/', 'http://localhost').pathname
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Método não permitido')
        return serveUi(req, res)
      }
      if (!csrfSafe.has(req.method) && !acceptedOrigin(req)) return fail(res, 403, 'Origem não autorizada')
      if (path === '/api/status' && req.method === 'GET') return json(res, 200, { version: VERSION, configured: !!readJson('admin.json'), totpRequired: true, trustedDevice: !!findTrusted(cookies(req).als_trusted) })
      if (path === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, version: VERSION })
      if (path === '/api/setup/begin' && req.method === 'POST') {
        if (readJson('admin.json')) return fail(res, 409, 'Painel já configurado')
        if (!limit(ip, 'setup', 8)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        const expected = fs.readFileSync(dataPath('bootstrap-token'), 'utf8').trim()
        if (!constantEquals(input.bootstrap, expected)) { audit('setup_rejected', { ip }); return fail(res, 401, 'Código de instalação inválido') }
        const secret = base32(crypto.randomBytes(20))
        const id = randomToken()
        challenges.set(id, { secret, expires: Date.now() + 10 * 60000 })
        return json(res, 200, { challenge: id, secret, otpUrl: `otpauth://totp/AL%20Sistemas:admin?secret=${secret}&issuer=AL%20Sistemas&algorithm=SHA1&digits=6&period=30` })
      }
      if (path === '/api/setup/finish' && req.method === 'POST') {
        if (readJson('admin.json')) return fail(res, 409, 'Painel já configurado')
        if (!limit(ip, 'finish', 8)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        const expected = fs.readFileSync(dataPath('bootstrap-token'), 'utf8').trim()
        const challenge = challenges.get(input.challenge)
        if (!constantEquals(input.bootstrap, expected) || !challenge || challenge.expires < Date.now() || !strongPassword(input.password) || !verifyTotp(challenge.secret, input.otp)) {
          audit('setup_rejected', { ip }); return fail(res, 400, 'Código, senha ou TOTP inválido')
        }
        writeJson('admin.json', { passwordHash: hashPassword(input.password), totpSecret: challenge.secret, createdAt: new Date().toISOString() })
        fs.unlinkSync(dataPath('bootstrap-token'))
        challenges.clear()
        audit('setup_complete', { success: true, ip })
        return json(res, 200, { ok: true })
      }
      if (path === '/api/login' && req.method === 'POST') {
        if (!limit(ip, 'login', 8)) return fail(res, 429, 'Acesso temporariamente limitado')
        const input = await body(req)
        const admin = readJson('admin.json')
        const trusted = findTrusted(cookies(req).als_trusted)
        const step = admin && typeof input.otp === 'string' ? matchingTotpStep(admin.totpSecret, input.otp) : null
        const totpValid = step !== null && step > (admin?.lastTotpStep ?? -1)
        if (!admin || !verifyPassword(input.password, admin.passwordHash) || (!trusted && !totpValid) || (input.otp && !totpValid)) {
          audit('login_failed', { ip }); return fail(res, 401, 'Senha ou código TOTP inválido')
        }
        if (totpValid) writeJson('admin.json', { ...admin, lastTotpStep: step })
        attempts.delete(`${ip}:login`)
        const info = newSession(res)
        if (input.trustDevice === true && totpValid) {
          const device = rememberDevice(req.headers['user-agent'])
          setTrustedCookie(res, device.token)
          audit('device_trusted', { ip, success: true })
        }
        audit('login_success', { ip, success: true })
        return json(res, 200, { ...info, trustedDevice: !!trusted || (input.trustDevice === true && totpValid) })
      }
      const sess = sessionFrom(req)
      if (!sess) return fail(res, 401, 'Autenticação necessária')
      if (!csrfSafe.has(req.method) && !constantEquals(req.headers['x-csrf-token'], sess.csrf)) return fail(res, 403, 'CSRF inválido')
      if (path === '/api/session' && req.method === 'GET') return json(res, 200, { ok: true, csrf: sess.csrf, expires: sess.expires })
      if (path === '/api/logout' && req.method === 'POST') {
        sessions.delete(sess.key); res.setHeader('set-cookie', `als_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${origin.startsWith('https://') ? '; Secure' : ''}`)
        audit('logout', { ip }); return json(res, 200, { ok: true })
      }
      if (path === '/api/security/devices' && req.method === 'GET') return json(res, 200, { devices: trustedDevices(), currentId: findTrusted(cookies(req).als_trusted)?.id || null })
      if (path === '/api/security/forget-device' && req.method === 'POST') {
        await body(req)
        revokeDevice(cookies(req).als_trusted)
        removeTrustedCookie(res)
        audit('device_revoked', { ip })
        return json(res, 200, { ok: true })
      }
      if (path === '/api/security/revoke-all' && req.method === 'POST') {
        if (!limit(ip, 'security', 8)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        const admin = readJson('admin.json')
        const step = admin ? matchingTotpStep(admin.totpSecret, input.otp) : null
        if (!admin || !verifyPassword(input.password, admin.passwordHash) || step === null || step <= (admin.lastTotpStep ?? -1)) return fail(res, 401, 'Confirmação com senha e TOTP necessária')
        writeJson('admin.json', { ...admin, lastTotpStep: step })
        revokeAllDevices()
        sessions.clear() // Revogação geral invalida também sessões em memória.
        const secure = origin.startsWith('https://') ? '; Secure' : ''
        res.setHeader('set-cookie', [
          `als_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
          `als_trusted=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`
        ])
        audit('all_devices_revoked', { ip })
        return json(res, 200, { ok: true })
      }
      if (path === '/api/integrations' && req.method === 'GET') return json(res, 200, { spaceship: spaceshipStatus() })
      if (path === '/api/integrations/spaceship' && req.method === 'POST') {
        if (!limit(ip, 'integrations', 10)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        try {
          const result = saveSpaceship(input)
          audit('integration_saved', { name: 'spaceship', ip })
          return json(res, 200, result)
        } catch (e) { return fail(res, 400, e.message) }
      }
      if (path === '/api/integrations/spaceship' && req.method === 'DELETE') {
        if (!limit(ip, 'integrations', 10)) return fail(res, 429, 'Muitas tentativas')
        const result = removeSpaceship()
        audit('integration_removed', { name: 'spaceship', ip })
        return json(res, 200, result)
      }
      if (path === '/api/integrations/spaceship/dns' && req.method === 'GET') {
        if (!limit(ip, 'integrations_dns', 20)) return fail(res, 429, 'Muitas consultas')
        try {
          const domain = new URL(req.url, 'http://localhost').searchParams.get('domain')
          return json(res, 200, { records: await listSpaceshipDns(domain) })
        } catch (e) { return fail(res, e.status || 400, e.message) }
      }
      if (path === '/api/updates' && req.method === 'GET') return json(res, 200, updateInfo(VERSION))
      if (path === '/api/updates/check' && req.method === 'POST') {
        const input = await body(req)
        if (Object.keys(input).length) return fail(res, 400, 'Parâmetros não permitidos')
        if (!limit(ip, 'update-check', 12)) return fail(res, 429, 'Muitas consultas')
        return json(res, 200, await checkRelease(VERSION))
      }
      if (path === '/api/updates/configure' && req.method === 'POST') {
        if (!limit(ip, 'update-configure', 8)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'otp,password,repo' || !validateRepo(input.repo)) return fail(res, 400, 'Repositório inválido')
        const admin = readJson('admin.json')
        const step = admin ? matchingTotpStep(admin.totpSecret, input.otp) : null
        if (!admin || !verifyPassword(input.password, admin.passwordHash) || step === null || step <= (admin.lastTotpStep ?? -1)) return fail(res, 401, 'Senha e TOTP atual obrigatórios')
        writeJson('admin.json', { ...admin, lastTotpStep: step })
        configureRepo(input.repo)
        audit('update_repo_configured', { ip })
        return json(res, 200, updateInfo(VERSION))
      }
      if (path === '/api/updates/apply' && req.method === 'POST') {
        if (!limit(ip, 'update-apply', 5)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        // A sessão já exige autenticação; a ação crítica solicita novamente a senha.
        if (Object.keys(input).sort().join(',') !== 'password') return fail(res, 400, 'Parâmetros inválidos')
        const admin = readJson('admin.json')
        if (!admin || !verifyPassword(input.password, admin.passwordHash)) return fail(res, 401, 'Senha administrativa incorreta')
        if (!updateInfo(VERSION).repo) return fail(res, 409, 'Configure o repositório autorizado no GitHub')
        const result = await taskRunner({ action: 'start_update' })
        audit('update_requested', { ip })
        return json(res, 202, result)
      }
      if (path === '/api/dependencies' && req.method === 'GET') return json(res, 200, dependencyInfo())
      if (path === '/api/dependencies/install' && req.method === 'POST') {
        if (!limit(ip, 'dependency-install', 6)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'otp,package,password' || !validPackageId(input.package)) return fail(res, 400, 'Pacote ou parâmetros não autorizados')
        const admin = readJson('admin.json')
        const step = admin ? matchingTotpStep(admin.totpSecret, input.otp) : null
        if (!admin || !verifyPassword(input.password, admin.passwordHash) || step === null || step <= (admin.lastTotpStep ?? -1)) return fail(res, 401, 'Senha e TOTP novo obrigatórios')
        writeJson('admin.json', { ...admin, lastTotpStep: step })
        try {
          const result = await taskRunner({ action: 'install_package', package: input.package })
          audit('package_install_requested', { ip, package: input.package })
          return json(res, 202, result)
        } catch (error) {
          audit('package_install_rejected', { ip, package: input.package })
          return fail(res, 422, error.message)
        }
      }
      if (path === '/api/monitor' && req.method === 'GET') return json(res, 200, monitor())
      if (path === '/api/services' && req.method === 'GET') return json(res, 200, serviceDiagnostics())
      if (path === '/api/backups' && req.method === 'GET') {
        try { return json(res, 200, await taskRunner({ action: 'list_backups' })) }
        catch (err) { return fail(res, 503, 'Inventário de backups indisponível: ' + err.message) }
      }
      if (path === '/api/projects' && req.method === 'GET') return json(res, 200, { projects: projects() })
      if (path === '/api/audit' && req.method === 'GET') return json(res, 200, { events: lastAudit() })
      if (path === '/api/tasks' && req.method === 'POST') {
        if (!limit(ip, 'task', 30)) return fail(res, 429, 'Limite de tarefas excedido')
        const input = await body(req)
        const nameOk = typeof input.name === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(input.name)
        let task
        if (input.action === 'create_project' && nameOk && ['static', 'php'].includes(input.type) && (input.domain == null || (typeof input.domain === 'string' && input.domain.length <= 253)) && Object.keys(input).every(k => ['action', 'name', 'type', 'domain'].includes(k))) {
          task = { action: 'create_project', name: input.name, type: input.type, domain: input.domain || null }
        } else if (input.action === 'set_site_state' && nameOk && typeof input.enabled === 'boolean' && Object.keys(input).every(k => ['action', 'name', 'enabled'].includes(k))) {
          task = { action: 'set_site_state', name: input.name, enabled: input.enabled }
        } else if (input.action === 'validate_nginx' && Object.keys(input).length === 1) {
          task = { action: 'validate_nginx' }
        } else if (input.action === 'backup_project' && nameOk && typeof input.passphrase === 'string' && input.passphrase.length >= 16 && input.passphrase.length <= 128 && !/[\x00-\x1f]/.test(input.passphrase) && Object.keys(input).length === 3 && Object.keys(input).every(k => ['action', 'name', 'passphrase'].includes(k))) {
          task = { action: 'backup_project', name: input.name, passphrase: input.passphrase }
        } else {
          return fail(res, 400, 'Tarefa não permitida ou parâmetros inválidos')
        }
        const taskDetails = task.action === 'set_site_state' ? { enabled: task.enabled } : {}
        audit('task_requested', { ip, action: task.action, name: task.name, ...taskDetails })
        try {
          const result = await taskRunner(task)
          audit('task_success', { ip, action: task.action, name: task.name, success: true, ...taskDetails })
          return json(res, 200, result)
        } catch (err) {
          audit('task_failed', { ip, action: task.action, name: task.name, reason: err.message, ...taskDetails })
          return fail(res, 422, err.message)
        }
      }
      return fail(res, 404, 'Rota não encontrada')
    } catch (err) {
      if (err.code === 'ENOENT') return fail(res, 503, 'Instalação incompleta: execute o instalador')
      console.error('[AL Sistemas]', err.message)
      return fail(res, err.status || 500, err.status ? err.message : 'Falha interna')
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => console.log(`AL Sistemas VPS ${VERSION} em ${HOST}:${PORT}`))
}
