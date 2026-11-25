import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import { findTrusted, rememberDevice, revokeDevice, revokeAllDevices, trustedDevices, TRUST_MS } from './trusted.js'
import { updateInfo, checkRelease, createReleaseCache, compareVersion, validateRepo, configureRepo } from './updates.js'
import { audit, dataPath, lastAudit, readJson, writeJson } from './store.js'
import { base32, constantEquals, hashPassword, matchingTotpStep, randomToken, strongPassword, verifyPassword, verifyTotp } from './security.js'
import { projects, serviceDiagnostics } from './monitor.js'
import { projectOverview, projectActivities, probeProjectWebsite } from './project_overview.js'
import { hostOverview, hostRebootStatus, rebootPending, hostSites } from './host_dashboard.js'
import { createEc2Reader, createEbsSnapshots } from './aws_ec2.js'
import { serviceInventory, validServiceAction } from './service_inventory.js'
import { projectLogs } from './project_logs.js'
import { dependencyInfo, packageProgress, packageHistory, validPackageId } from './dependencies.js'
import crypto from 'node:crypto'
import { spaceshipStatus, saveSpaceship, removeSpaceship, listSpaceshipDns } from './integrations.js'

import { listDomains, getDomain, changeDomainSettings, changeDnsLocked, changePointer, domainHost, redirectSource, redirectDiagnostics } from './domains.js'

import { dnsDiagnostics, recordHost } from './dns_diagnostics.js'
import { hostingWorkflow, ipv4Hint, validateHosting } from './hosting.js'

const VERSION = '2.0.53'
const PORT = Number(process.env.ALS_PORT || 8181)
const HOST = '127.0.0.1' // Nunca expor Node diretamente à Internet.
const origin = process.env.ALS_ORIGIN || 'http://localhost:8181'
const panelHost = new URL(origin).hostname.toLowerCase()
const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
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
// Sessões são armazenadas apenas por hash do token, com expiração e CSRF.
// Persistir em /var/lib/alsistemas (0600) evita logout involuntário quando
 // o próprio atualizador reinicia o processo Node.js.
const SESSION_TTL_MS = 8 * 3600000
function activeSessions() {
  const saved = readJson('sessions.json')
  const entries = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  const current = Date.now()
  return Object.fromEntries(Object.entries(entries).filter(([key, value]) =>
    /^[0-9a-f]{64}$/.test(key) && value && typeof value.csrf === 'string' &&
    /^[0-9a-f]{64}$/.test(value.csrf) && Number.isSafeInteger(value.expires) && value.expires > current))
}
function sessionFrom(req) {
  const token = cookies(req).als_session
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const key = crypto.createHash('sha256').update(token).digest('hex')
  const entry = activeSessions()[key]
  return entry ? { key, csrf: entry.csrf, expires: entry.expires } : null
}
function newSession(res) {
  const token = randomToken()
  const key = crypto.createHash('sha256').update(token).digest('hex')
  const csrf = randomToken()
  const sessions = activeSessions()
  sessions[key] = { csrf, expires: Date.now() + SESSION_TTL_MS }
  const ordered = Object.entries(sessions).sort((a, b) => b[1].expires - a[1].expires).slice(0, 256)
  writeJson('sessions.json', Object.fromEntries(ordered))
  setSession(res, token)
  return { csrf }
}
function invalidateSession(key) {
  const entries = activeSessions()
  delete entries[key]
  writeJson('sessions.json', entries)
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
async function uploadZip(req, onPercent = () => {}, min = 512) {
  // Content-Length conhecido, tamanho rígido e fluxo sem carregar dezenas de MB na RAM.
  const maximum = 32 * 1024 * 1024
  const length = Number(req.headers['content-length'])
  if (!Number.isSafeInteger(length) || length < min || length > maximum)
    throw Object.assign(new Error('ZIP vazio ou acima do limite de 32 MiB'), { status: 413 })
  if (req.headers['content-type'] !== 'application/zip' && req.headers['content-type'] !== 'application/octet-stream')
    throw Object.assign(new Error('Tipo de arquivo inválido; selecione um ZIP'), { status: 415 })
  const name = `upload-${crypto.randomBytes(12).toString('hex')}.zip`
  const dest = dataPath(name)
  const output = fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 })
  let count = 0
  const digest = crypto.createHash('sha256')
  try {
    for await (const chunk of req) {
      count += chunk.length
      if (count > maximum || count > length)
        throw Object.assign(new Error('Upload excede o limite informado'), { status: 413 })
      digest.update(chunk)
      if (!output.write(chunk)) await once(output, 'drain')
    }
    if (count !== length) throw Object.assign(new Error('Upload incompleto'), { status: 400 })
    output.end()
    await finished(output)
    return { name, sha256: digest.digest('hex') }
  } catch (error) {
    output.destroy()
    throw error
  } finally {
    if (!output.writableFinished) fs.rmSync(dest, { force: true })
  }
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
  const paths = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/integrations.js': ['integrations.js', 'text/javascript; charset=utf-8'], '/domains.js': ['domains.js', 'text/javascript; charset=utf-8'], '/hosting.js': ['hosting.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/tutorial-instalacao.html': ['tutorial-instalacao.html', 'text/html; charset=utf-8'] }
  Object.assign(paths, { '/maintenance-worker.js':['maintenance-worker.js','text/javascript; charset=utf-8'], '/maintenance-offline.html':['maintenance-offline.html','text/html; charset=utf-8'], '/maintenance-offline.js':['maintenance-offline.js','text/javascript; charset=utf-8'], '/maintenance-offline.css':['maintenance-offline.css','text/css; charset=utf-8'] })
  const asset = paths[pathname]
  if (!asset) return fail(res, 404, 'Não encontrado')
  const source = path.join(publicDir, asset[0])
  res.writeHead(200, { 'content-type': asset[1], 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
    'content-security-policy': pathname === '/tutorial-instalacao.html' ? "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" : "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' })
  fs.createReadStream(source).pipe(res)
}
function runTask(task) {
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/sudo', ['-n', '/usr/local/libexec/alsistemas-helper'], { stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: true })
    const killSubprocessGroup = () => { try { process.kill(-proc.pid, 'SIGKILL') } catch { proc.kill('SIGKILL') } }
    let output = ''; let error = ''
    const deadline = task.action === 'enable_project_tls' ? 130000 : task.action.endsWith('_domain_redirect') ? 60000 : task.action === 'backup_project' ? 120000 : ['restore_project_code', 'backup_external_code'].includes(task.action) ? 120000 : 45000
    const timer = setTimeout(() => { killSubprocessGroup(); reject(new Error('Tarefa excedeu limite de execução')) }, deadline)
    proc.stdout.on('data', c => { output += c; if (output.length > (task.action === 'project_file_explorer' ? 262144 : task.action === 'list_domain_redirects' ? 98304 : task.action === 'other_project_permissions' ? 65536 : 8192)) killSubprocessGroup() })
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

const snapshotMessages={
  cli_missing:'Instale a AWS CLI v2 no servidor.',
  role_missing:'A instância não tem um perfil IAM disponível.',
  access_denied:'O perfil IAM não tem permissão para a operação de snapshot.',
  no_root:'Não foi possível identificar um único disco raiz EBS conectado.',
  metadata_unavailable:'Não foi possível identificar a instância da AWS.',
  pending:'Já existe um snapshot em andamento para o disco raiz.',
  busy:'Já existe uma solicitação recente. Consulte a lista antes de tentar novamente.',
  unconfirmed:'A AWS não confirmou a criação. Confira a lista de snapshots antes de tentar novamente.',
  unavailable:'Não foi possível consultar os snapshots na AWS agora.'
}
export function createServer({ taskRunner = runTask, spaceshipOptions, diagnosticOptions,
  hostingCatalog = () => projects(undefined,{withDomains:false}), retryDelay,
  hostStatus = hostRebootStatus, hostMonitor = hostOverview, siteHealth = hostSites, releaseLookup = checkRelease,
  ec2Reader = createEc2Reader(), ebsSnapshots = createEbsSnapshots({readEc2:ec2Reader}) } = {}) {
  const releaseCache = createReleaseCache({load:releaseLookup})
  let rebootRequesting = false, activeTransfers = 0, activeTasks = 0
  const executeTask = taskRunner
  taskRunner = async task => {
    if (task.action !== 'schedule_host_reboot' && (rebootRequesting || rebootPending(hostStatus())))
      throw new Error('Há um reinício solicitado. Aguarde a VPS voltar.')
    if (task.action !== 'schedule_host_reboot') activeTasks++
    try { return await executeTask(task) }
    finally { if (task.action !== 'schedule_host_reboot') activeTasks-- }
  }
  const hostingProvider = { ...spaceshipOptions, panelHost }
  const hosting = hostingWorkflow({runner:taskRunner, provider:hostingProvider, diagnosticOptions, catalog:hostingCatalog, note:audit, retryDelay})
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
        // Um dispositivo confiável dispensa TOTP neste login. Ignorar um eventual
        // código antigo preenchido pelo gerenciador de senhas ou enviado por um
        // navegador com cache, sem reduzir a exigência de senha correta.
        const step = !trusted && admin && typeof input.otp === 'string' ? matchingTotpStep(admin.totpSecret, input.otp) : null
        const totpValid = step !== null && step > (admin?.lastTotpStep ?? -1)
        if (!admin || !verifyPassword(input.password, admin.passwordHash) || (!trusted && !totpValid)) {
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
        invalidateSession(sess.key); res.setHeader('set-cookie', `als_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${origin.startsWith('https://') ? '; Secure' : ''}`)
        audit('logout', { ip }); return json(res, 200, { ok: true })
      }
      if (path === '/api/host/ec2' && req.method === 'GET') {
        if (new URL(req.url,'http://localhost').search) return fail(res,400,'A consulta usa somente a instância local.')
        if (!limit(ip,'ec2-status',60)) return fail(res,429,'Aguarde antes de atualizar a consulta da AWS.')
        return json(res,200,await ec2Reader())
      }
      if (path === '/api/host/reboot' && req.method === 'GET') return json(res,200,hostStatus())
      if (path === '/api/host/reboot' && req.method === 'POST') {
        if (!limit(ip,'host-reboot',5)) return fail(res,429,'Muitas tentativas de reinício.')
        const input=await body(req)
        if (Object.keys(input).length!==1 || input.confirm!=='REINICIAR') return fail(res,400,'Digite REINICIAR para confirmar.')
        const baseline = hostStatus()
        if (!baseline.canCheckBoot) return fail(res,503,'Identificador de boot indisponível.')
        if (rebootRequesting || rebootPending(baseline)) return fail(res,409,'Já existe um reinício solicitado.')
        if (activeTransfers || activeTasks) return fail(res,409,'Aguarde os envios e tarefas administrativas em andamento.')
        rebootRequesting=true
        try {
          await taskRunner({action:'schedule_host_reboot'})
          audit('host_reboot_requested',{ip,success:true})
          const state=hostStatus()
          return json(res,202,rebootPending(state)?state:{state:'scheduled',canCheckBoot:true})
        } catch(error) {
          audit('host_reboot_rejected',{ip,reason:error.message,success:false})
          return fail(res,409,error.message)
        } finally {rebootRequesting=false}
      }
      if (!csrfSafe.has(req.method) && (rebootRequesting || rebootPending(hostStatus())))
        return fail(res,409,'Há um reinício solicitado. Aguarde a VPS voltar antes de fazer alterações.')
      if (path === '/api/host/ec2/snapshots' && ['GET','POST'].includes(req.method)) {
        if (new URL(req.url,'http://localhost').search) return fail(res,400,'A operação usa somente o disco raiz local.')
        const create=req.method==='POST'
        if (!limit(ip,create?'ec2-snapshot-create':'ec2-snapshot-list',create?8:90))
          return fail(res,429,'Muitas solicitações de snapshot. Aguarde antes de tentar novamente.')
        if (!create) {
          const result=await ebsSnapshots.list()
          return json(res,200,result.state==='ok'?result:{...result,error:snapshotMessages[result.state]||snapshotMessages.unavailable})
        }
        const input=await body(req)
        if (Object.keys(input).length!==1 || input.confirm!=='CRIAR_SNAPSHOT') return fail(res,400,'Confirme a criação do snapshot.')
        if (rebootRequesting || rebootPending(hostStatus()) || activeTransfers || activeTasks)
          return fail(res,409,'Aguarde a transferência, reinício ou tarefa administrativa em andamento.')
        activeTasks++
        try {
          const result=await ebsSnapshots.create()
          if(result.state==='accepted'){
            audit('ec2_snapshot_requested',{ip,snapshotId:result.snapshot.id,success:true})
            return json(res,202,result)
          }
          audit('ec2_snapshot_rejected',{ip,result:result.state,success:false})
          const status=['busy','pending','no_root'].includes(result.state)?409:result.state==='access_denied'?403:503
          return json(res,status,{state:result.state,error:snapshotMessages[result.state]||snapshotMessages.unavailable})
        } finally {activeTasks--}
      }
      if (req.method==='POST' && (path==='/api/updates/upload' || path==='/api/projects/iguatamaonline/update/upload' ||
          /^\/api\/projects\/[a-z][a-z0-9-]{1,39}\/hosting\/upload$/.test(path))) {
        activeTransfers++
        let released=false
        const release=()=>{ if (!released) {released=true;activeTransfers--} }
        res.once('finish',release);res.once('close',release)
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
        if (Object.keys(input).length !== 0) return fail(res, 400, 'Parâmetros inesperados')
        // A sessão autenticada + origem + CSRF autorizam a revogação.
        revokeAllDevices()
        writeJson('sessions.json', {}) // Revogação geral invalida também sessões persistidas.
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
      if (path === '/api/integrations/spaceship/dns/change' && req.method === 'POST') {
        if (!limit(ip, 'integrations_dns_write', 8)) return fail(res, 429, 'Muitas operações DNS. Tente novamente mais tarde.')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'command,domain') return fail(res, 400, 'Parâmetros inválidos')
        // Edição de DNS requer sessão válida, mesma origem e CSRF, sem senha repetida.
        try {
          const result = await changeDnsLocked(input.domain, input.command)
          audit('dns_write_accepted', { ip, provider: 'spaceship', action: result.action, domain: result.domain, type: result.type, name: result.name, success: true })
          return json(res, 200, result)
        } catch (error) {
          audit('dns_write_failed', { ip, provider: 'spaceship', success: false })
          return fail(res, error.status || 400, error.message)
        }
      }
      if (path === '/api/domains' && req.method === 'GET') {
        if (!limit(ip, 'domains_list', 25)) return fail(res, 429, 'Muitas consultas de domínios.')
        const query = new URL(req.url, 'http://localhost').searchParams
        if ([...query.keys()].some(key => key !== 'skip') || query.getAll('skip').length > 1 ||
            (query.has('skip') && !/^\d{1,5}$/.test(query.get('skip')))) return fail(res, 400, 'Página inválida.')
        return json(res, 200, await listDomains(Number(query.get('skip') ?? 0), spaceshipOptions))
      }
      const domainRoute = /^\/api\/domains\/([a-z0-9.-]{4,253})\/(dns|diagnose|settings|pointer|redirects|redirect-check)$/.exec(path)
      if (domainRoute) {
        const zone = domainHost(domainRoute[1])
        const resource = domainRoute[2]
        const allowed = { dns:['GET'], diagnose:['GET'], settings:['POST'], pointer:['POST'], redirects:['GET','POST','DELETE'], 'redirect-check':['POST'] }
        if (!allowed[resource].includes(req.method)) return fail(res, 405, 'Método não permitido.')
        if (!limit(ip, 'domains_' + resource + '_' + req.method, req.method === 'GET' ? 30 : 8))
          return fail(res, 429, 'Muitas operações de domínio.')
        const provider = { ...spaceshipOptions, panelHost }
        const listed = { action:'list_domain_redirects', zone }
        if (req.method === 'GET') {
          if (resource === 'diagnose') {
            const query = new URL(req.url,origin).searchParams
            if ([...query.keys()].some(key => !['type','name','mode'].includes(key)) || [...query.keys()].some(key=>query.getAll(key).length !== 1))
              return fail(res,400,'Consulta DNS inválida.')
            await getDomain(zone,provider)
            const servers = query.get('mode') === 'servers'
            const host = servers ? zone : recordHost(zone,query.get('name') || '@')
            const type = servers ? 'NS' : query.get('type') || 'A'
            return json(res,200,await dnsDiagnostics(zone,{host,type,mode:servers ? 'servers' : 'record'},diagnosticOptions))
          }
          if (resource === 'dns') return json(res, 200, { records:await listSpaceshipDns(zone, provider) })
          try { return json(res, 200, await taskRunner(listed)) } catch (error) { return fail(res, 422, error.message) }
        }
        const input = await body(req)
        if (resource === 'pointer' || resource === 'settings') {
          const result = resource === 'pointer' ? await changePointer(zone, input, provider) : await changeDomainSettings(zone, input, provider)
          audit('domain_change', { ip, name:zone, action:resource === 'pointer' ? 'apontamento' : input.action, success:true })
          return json(res, 200, result)
        }
        if (resource === 'redirect-check') {
          if (Object.keys(input).sort().join(',') !== 'host,ip') return fail(res, 400, 'Parâmetros do diagnóstico inválidos.')
          const {host} = redirectSource(zone, input.host, panelHost)
          let rules
          try { rules = await taskRunner(listed) } catch (error) { return fail(res, 422, error.message) }
          const rule = rules.items.find(item => item.host === host)
          if (!rule) return fail(res, 404, 'Redirecionamento não encontrado no painel.')
          return json(res, 200, await redirectDiagnostics(rule, input.ip))
        }
        const saving = req.method === 'POST'
        if (Object.keys(input).sort().join(',') !== (saving ? 'host,revision,rule' : 'host,revision') ||
            (input.revision !== null && (typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision))))
          return fail(res, 400, 'Campos do redirecionamento inválidos.')
        const {host} = redirectSource(zone, input.host, panelHost)
        const task = { action:saving ? 'save_domain_redirect' : 'delete_domain_redirect', zone, host, revision:input.revision }
        if (saving) {
          const rule = input.rule
          if (!rule || typeof rule !== 'object' || Object.keys(rule).sort().join(',') !== 'code,destination,enabled,https,preserve' ||
              typeof rule.destination !== 'string' || rule.destination.length > 1100 || ![301,302].includes(rule.code) ||
              ['enabled','https','preserve'].some(key => typeof rule[key] !== 'boolean'))
            return fail(res, 400, 'Configuração de redirecionamento inválida.')
          if (input.revision === null || rule.enabled) await getDomain(zone, provider)
          task.rule = rule
        }
        try {
          const result = await taskRunner(task)
          audit('domain_redirect_change', { ip, name:host, action:saving ? 'salvar' : 'excluir', success:true })
          return json(res, 200, result)
        } catch (error) {
          audit('domain_redirect_change', { ip, name:host, action:saving ? 'salvar' : 'excluir', success:false })
          return fail(res, 422, error.message)
        }
      }
      if (path === '/api/updates' && req.method === 'GET') return json(res, 200, updateInfo(VERSION))
      if (path === '/api/updates/availability' && req.method === 'GET') {
        if (!limit(ip, 'update-availability', 180)) return fail(res, 429, 'Muitas consultas')
        return json(res, 200, await releaseCache.read(VERSION,updateInfo(VERSION).repo))
      }
      if (path === '/api/updates/check' && req.method === 'POST') {
        const input = await body(req)
        if (Object.keys(input).length) return fail(res, 400, 'Parâmetros não permitidos')
        if (!limit(ip, 'update-check', 12)) return fail(res, 429, 'Muitas consultas')
        return json(res, 200, await releaseCache.read(VERSION,updateInfo(VERSION).repo,{force:true}))
      }
      if (path === '/api/updates/configure' && req.method === 'POST') {
        if (!limit(ip, 'update-configure', 8)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'repo' || !validateRepo(input.repo)) return fail(res, 400, 'Repositório inválido')
        configureRepo(input.repo)
        releaseCache.invalidate()
        audit('update_repo_configured', { ip })
        return json(res, 200, updateInfo(VERSION))
      }
      if (path === '/api/updates/apply' && req.method === 'POST') {
        if (!limit(ip, 'update-apply', 5)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        // Sessão válida e token CSRF já foram verificados acima.
        // Para atualizar o núcleo, não exigir novamente a senha do login.
        const keys=Object.keys(input)
        if (keys.length && (keys.join(',') !== 'version' || typeof input.version !== 'string' || compareVersion(input.version,VERSION)!==1))
          return fail(res, 400, 'Versão de atualização inválida.')
        const repo=updateInfo(VERSION).repo
        if (!repo) return fail(res, 409, 'Configure o repositório autorizado no GitHub')
        if (['queued', 'checking', 'downloading', 'validating', 'backup', 'installing', 'verifying', 'rolling_back'].includes(updateInfo(VERSION).status?.stage))
          return fail(res, 409, 'Atualização já está em andamento')
        try {
          if (input.version) {
            const release=await releaseCache.read(VERSION,repo)
            if (release.checkError || !release.assetsReady || release.latest!==input.version || updateInfo(VERSION).repo!==repo)
              return fail(res,409,'A versão disponível mudou ou não pôde ser verificada. Confira a Release novamente.')
          }
          const result = await taskRunner({ action: 'start_update', ...(input.version ? {version:input.version,repo} : {}) })
          audit('update_requested', { ip })
          return json(res, 202, result)
        } catch (error) {
          // Mostra o motivo real do executor restrito em vez de mascarar como "Falha interna".
          if (error.code === 'ENOENT') throw error
          audit('update_failed', { ip, reason: error.message })
          return fail(res, error.status || 422, error.message)
        }
      }
      if (path === '/api/updates/upload' && req.method === 'POST') {
        if (!limit(ip, 'update-upload', 5)) return fail(res, 429, 'Muitas tentativas de envio')
        // Upload requer sessão autenticada + mesma origem + CSRF,
        // sem credenciais repetidas em cabeçalhos HTTP.
        const active = updateInfo(VERSION).status?.stage
        if (['queued', 'checking', 'downloading', 'validating', 'backup', 'installing', 'verifying', 'rolling_back'].includes(active))
          return fail(res, 409, 'Atualização já está em andamento')
        let saved
        try {
          saved = await uploadZip(req)
          const result = await taskRunner({ action: 'start_update', upload: saved.name, sha256: saved.sha256 })
          audit('update_requested', { ip })
          return json(res, 202, result)
        } catch (error) {
          if (error.code === 'ENOENT') throw error
          audit('update_failed', { ip, reason: error.message })
          return fail(res, error.status || 422, error.message)
        } finally {
          if (saved) fs.rmSync(dataPath(saved.name), { force: true })
        }
      }
      if (path === '/api/dependencies' && req.method === 'GET') return json(res, 200, dependencyInfo())
      if (path === '/api/dependencies/status' && req.method === 'GET') return json(res,200,{status:packageProgress()})
      if (path === '/api/dependencies/history' && req.method === 'GET') {
        const query = new URL(req.url,origin).searchParams
        if ([...query.keys()].some(name=>name!=='job') || query.getAll('job').length>1 || (query.has('job') && !/^[a-f0-9]{24}$/.test(query.get('job'))))
          return fail(res,400,'Identificador de histórico inválido.')
        const job = query.get('job')
        const result = packageHistory(job)
        if (job && !result) return fail(res,404,'Operação não encontrada no histórico.')
        return json(res,200,job?{record:result}:{history:result})
      }
      if (path === '/api/dependencies/cancel' && req.method === 'POST') {
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'job' || typeof input.job !== 'string' || !/^[a-f0-9]{24}$/.test(input.job)) return fail(res,400,'Operação inválida')
        if (!limit(ip,'dependency-cancel',10)) return fail(res,429,'Muitas tentativas')
        try { return json(res,202,await taskRunner({action:'cancel_package',job:input.job})) }
        catch(error) { return fail(res,409,error.message) }
      }
      if (['/api/dependencies/install','/api/dependencies/remove'].includes(path) && req.method === 'POST') {
        const operation = path.endsWith('/remove') ? 'remove' : 'install'
        if (!limit(ip, 'dependency-install', 6)) return fail(res, 429, 'Muitas tentativas')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'package' || !validPackageId(input.package)) return fail(res, 400, 'Pacote ou parâmetros não autorizados')
        try {
          const result = await taskRunner({ action: operation === 'remove' ? 'remove_package' : 'install_package', package: input.package })
          audit('package_' + operation + '_requested', { ip, package: input.package })
          return json(res, 202, result)
        } catch (error) {
          audit('package_' + operation + '_rejected', { ip, package: input.package })
          return fail(res, 422, error.message)
        }
      }
      if (path === '/api/monitor' && req.method === 'GET') {
        const sample = await hostMonitor({transfers:activeTransfers})
        if (activeTasks>0 && sample.maintenance) sample.maintenance.busy.push('Tarefa administrativa em andamento')
        return json(res,200,sample)
      }
      if (path === '/api/host/sites' && req.method === 'GET') {
        if (!limit(ip,'host-sites',45)) return fail(res,429,'Muitas consultas de sites.')
        return json(res,200,await siteHealth())
      }
      if (path === '/api/services' && req.method === 'GET') return json(res, 200, serviceDiagnostics())
      if (path === '/api/services/inventory' && req.method === 'GET') {
        if (!limit(ip,'services-inventory',120)) return fail(res,429,'Muitas consultas')
        return json(res,200,serviceInventory())
      }
      if (path === '/api/services/action' && req.method === 'POST') {
        if (!limit(ip,'services-control',24)) return fail(res,429,'Muitas operações')
        const input=await body(req)
        if (Object.keys(input).sort().join(',') !== 'operation,unit' || !validServiceAction(input.unit,input.operation))
          return fail(res,400,'Serviço ou ação não permitida.')
        try {
          const result=await taskRunner({action:'control_service',unit:input.unit,operation:input.operation})
          audit('service_action',{ip,name:input.unit,action:input.operation,success:true})
          return json(res,202,result)
        } catch (error) { return fail(res,422,error.message) }
      }
      if (path === '/api/backups' && req.method === 'GET') {
        try { return json(res, 200, await taskRunner({ action: 'list_backups' })) }
        catch (err) { return fail(res, 503, 'Inventário de backups indisponível: ' + err.message) }
      }
      const projectBackupRoute = /^\/api\/projects\/([a-z][a-z0-9-]{1,39})\/backups(?:\/(verify))?$/.exec(path)
      if (projectBackupRoute) {
        const [, name, operation] = projectBackupRoute
        if (name.includes('--') || ['iguatama-teste', 'alsistemas', 'iguatamaonline'].includes(name) ||
            !projects(undefined, { withDomains: false }).some(item => item.name === name && item.backupEligible))
          return fail(res, 404, 'Backup de projeto não autorizado')
        if (!operation && req.method === 'GET') {
          if (!limit(ip, 'backup-list-project', 30)) return fail(res, 429, 'Muitas consultas de backup')
          try { return json(res, 200, await taskRunner({ action: 'list_backups', name })) }
          catch (error) { return fail(res, 503, 'Inventário de backups indisponível') }
        }
        if (operation !== 'verify' || req.method !== 'POST') return fail(res, 405, 'Método não permitido')
        if (!limit(ip, 'backup-verify', 12)) return fail(res, 429, 'Muitas verificações de backup')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'archive' || typeof input.archive !== 'string' ||
            !new RegExp('^' + name + '-\\d{8}T\\d{6}Z-[a-f0-9]{8}\\.tar\\.gpg$').test(input.archive))
          return fail(res, 400, 'Nome de backup inválido')
        try {
          const result = await taskRunner({ action: 'verify_backup', name, archive: input.archive })
          audit('project_backup_verified', { ip, name, integrity: result.integrity })
          return json(res, 200, result)
        } catch (error) { return fail(res, 422, error.message) }
      }
      // Diagnóstico e histórico por projeto: consulta autenticada e somente leitura.
      // Não fornece terminal, não lê .env e não confunde configuração HTTPS com teste público.
      const projectInfoRoute = /^\/api\/projects\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/(overview|activity|probe|logs)$/.exec(path)
      if (projectInfoRoute) {
        if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')
        const [, name, section] = projectInfoRoute
        if (!limit(ip, section === 'probe' ? 'project-probe' : 'project-insights', section === 'probe' ? 12 : 90)) return fail(res, 429, 'Muitas consultas')
        try {
          if (section === 'overview') return json(res, 200, await projectOverview(name))
          if (section === 'logs') return json(res, 200, projectLogs(name))
          if (section === 'probe') return json(res, 200, await probeProjectWebsite(name))
          // Não expor IPs, motivos de erro ou eventos de outros projetos.
          const result = projectActivities(name, lastAudit(250), readJson('project-update-status.json'))
          return json(res, 200, result)
        } catch (error) { return fail(res, error.status || 503, error.status ? error.message : 'Diagnóstico indisponível') }
      }
      // Explorador com modos UNIX: somente dentro do projeto e sem seguir links.
      const explorerRoute = /^\/api\/projects\/([a-z][a-z0-9-]{1,39})\/files(?:\/(mode))?$/.exec(path)
      if (explorerRoute && ['GET', 'POST'].includes(req.method)) {
        const [, name, section] = explorerRoute
        if (['iguatama-teste', 'alsistemas'].includes(name) || name.includes('--'))
          return fail(res, 404, 'Projeto não autorizado')
        if (!limit(ip, 'file-explorer', req.method === 'POST' ? 18 : 180)) return fail(res, 429, 'Muitas consultas')
        let task
        if (req.method === 'GET' && !section) {
          const params = new URL(req.url, 'http://localhost').searchParams
          if ([...params.keys()].some(key => !['dir', 'offset'].includes(key))) return fail(res, 400, 'Parâmetros inesperados')
          const directory = params.get('dir') || ''
          const offset = Number(params.get('offset') || '0')
          if (directory.length > 512 || !Number.isSafeInteger(offset) || offset < 0 || offset > 4000)
            return fail(res, 400, 'Caminho ou página inválida')
          task = { action: 'project_file_explorer', name, mode: 'browse', directory, offset }
        } else if (req.method === 'POST' && section === 'mode') {
          const input = await body(req)
          if (Object.keys(input).sort().join(',') !== 'expectedMode,inode,newMode,path' ||
              typeof input.path !== 'string' || input.path.length > 512 ||
              typeof input.inode !== 'string' || !/^[0-9]{1,24}$/.test(input.inode) ||
              !Number.isInteger(input.expectedMode) || input.expectedMode < 0 || input.expectedMode > 511 ||
              !Number.isInteger(input.newMode) || input.newMode < 0 || input.newMode > 511)
            return fail(res, 400, 'Informações de permissão inválidas')
          task = { action: 'project_file_explorer', name, mode: 'chmod', path: input.path,
                   newMode: input.newMode, expectedMode: input.expectedMode, inode: input.inode }
        } else return fail(res, 405, 'Método não permitido')
        try {
          const result = await taskRunner(task)
          if (task.mode === 'chmod') audit('project_file_mode_changed', { ip, name, path: task.path,
            previousMode: task.expectedMode.toString(8), mode: task.newMode.toString(8) })
          return json(res, 200, result)
        } catch (error) {
          if (task.mode === 'chmod') audit('project_file_mode_failed', { ip, name, path: task.path })
          return fail(res, 422, error.message)
        }
      }
      // Gerenciador de arquivos do projeto: leitura e configuração por helper privilegiado.
      // Nunca aceita caminhos absolutos ou operações fora de /var/www/projetos.
      const generalPermission = /^\/api\/projects\/([a-z][a-z0-9-]{1,39})\/permissions(?:\/(catalog|profile))?$/.exec(path)
      if (generalPermission && ['GET', 'POST'].includes(req.method)) {
        const [, name, section] = generalPermission
        if (['iguatama-teste', 'alsistemas'].includes(name) || name.includes('--'))
          return fail(res, 404, 'Projeto não disponível para esta operação')
        if (!limit(ip, 'other-project-permissions', req.method === 'POST' ? 16 : 40)) return fail(res, 429, 'Muitas consultas')
        let task
        if (req.method === 'GET') {
          if (section === 'profile') return fail(res, 405, 'Método não permitido')
          task = { action: 'other_project_permissions', name, mode: section === 'catalog' ? 'discover' : 'inspect' }
        } else if (section === 'profile') {
          const input = await body(req)
          if (Object.keys(input).sort().join(',') !== 'files,phpUser' || !Array.isArray(input.files) ||
              !input.files.length || input.files.length > 12 ||
              !input.files.every(p => typeof p === 'string' && p.length <= 180) ||
              typeof input.phpUser !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(input.phpUser))
            return fail(res, 400, 'Escolha arquivos válidos e um usuário PHP.')
          task = { action: 'other_project_permissions', name, mode: 'configure', files: input.files, phpUser: input.phpUser }
        } else if (!section) {
          const input = await body(req)
          if (Object.keys(input).sort().join(',') !== 'mode' || !['allow', 'restore'].includes(input.mode))
            return fail(res, 400, 'Parâmetros não permitidos')
          task = { action: 'other_project_permissions', name, mode: input.mode }
        } else return fail(res, 405, 'Método não permitido')
        try {
          const result = await taskRunner(task)
          if (req.method === 'POST') audit('project_permissions', { ip, name, mode: task.mode, fileCount: task.files?.length })
          return json(res, 200, result)
        } catch (error) {
          if (req.method === 'POST') audit('project_permissions_failed', { ip, name, mode: task.mode })
          return fail(res, 422, error.message)
        }
      }
      // Manutenção de projeto externo: escopo fixo, nunca aceita caminhos do navegador.
      if (path === '/api/projects/iguatamaonline/maintenance' && req.method === 'GET') {
        if (!limit(ip, 'external-inspect', 24)) return fail(res, 429, 'Limite de inspeções excedido')
        try { return json(res, 200, await taskRunner({ action: 'inspect_external_project', name: 'iguatamaonline' })) }
        catch (error) { return fail(res, 422, error.message) }
      }
      if (path === '/api/projects/iguatamaonline/update/status' && req.method === 'GET') {
        const result = readJson('project-update-status.json')
        return json(res, 200, { status: result && result.project === 'iguatamaonline' ? result : null })
      }
      if (path === '/api/projects/iguatamaonline/maintenance' && req.method === 'POST') {
        if (!limit(ip, 'external-repair', 8)) return fail(res, 429, 'Muitas solicitações de manutenção')
        const input = await body(req)
        if (!['allow', 'restore', 'restore_code', 'backup_code'].includes(input.mode) ||
            Object.keys(input).sort().join(',') !== (input.mode === 'restore_code' ? 'backup,mode' : 'mode') ||
            (input.mode === 'restore_code' && (typeof input.backup !== 'string' || !/^code-\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(input.backup))))
          return fail(res, 400, 'Parâmetros de manutenção inválidos')
        const task = input.mode === 'restore_code'
          ? { action: 'restore_project_code', name: 'iguatamaonline', backup: input.backup }
          : input.mode === 'backup_code'
            ? { action: 'backup_external_code', name: 'iguatamaonline' }
            : { action: 'project_permissions', name: 'iguatamaonline', mode: input.mode }
        audit('task_requested', { ip, action: task.action, name: task.name })
        try {
          const result = await taskRunner(task)
          audit('task_success', { ip, action: task.action, name: task.name })
          return json(res, 200, result)
        } catch (error) {
          audit('task_failed', { ip, action: task.action, name: task.name, reason: error.message })
          return fail(res, 422, error.message)
        }
      }
      if (path === '/api/projects/iguatamaonline/update/github' && req.method === 'POST') {
        if (!limit(ip, 'external-github', 5)) return fail(res, 429, 'Limite de atualizações excedido')
        const input = await body(req)
        if (Object.keys(input).sort().join(',') !== 'repo' || !validateRepo(input.repo))
          return fail(res, 400, 'Repositório ou parâmetros inválidos')
        try {
          const result = await taskRunner({ action: 'start_project_update', name: 'iguatamaonline', mode: 'github', repo: input.repo })
          audit('task_requested', { ip, action: 'start_project_update', name: 'iguatamaonline' })
          return json(res, 202, result)
        } catch (error) { return fail(res, 422, error.message) }
      }
      if (path === '/api/projects/iguatamaonline/update/upload' && req.method === 'POST') {
        if (!limit(ip, 'external-upload', 5)) return fail(res, 429, 'Limite de uploads excedido')
        // Upload também depende da sessão, origem e CSRF verificados acima.
        let saved
        try {
          saved = await uploadZip(req)
          const result = await taskRunner({ action: 'start_project_update', name: 'iguatamaonline', mode: 'file', upload: saved.name, sha256: saved.sha256 })
          audit('task_requested', { ip, action: 'start_project_update', name: 'iguatamaonline' })
          return json(res, 202, result)
        } finally { if (saved) fs.rmSync(dataPath(saved.name), { force: true }) }
      }
      if (path === '/api/hosting/ipv4' && req.method === 'GET') {
        if (!limit(ip,'hosting-ipv4',30)) return fail(res,429,'Muitas consultas de IPv4.')
        const zone = new URL(req.url,origin).searchParams.get('zone')
        return json(res,200,await ipv4Hint(zone,hostingProvider))
      }
      if (path === '/api/hosting/projects' && req.method === 'POST') {
        if (!limit(ip,'hosting-create',10)) return fail(res,429,'Muitas solicitações de criação.')
        const plan = validateHosting(await body(req),panelHost)
        return json(res,201,await hosting.create(plan,ip))
      }
      const managedHostingRoute = /^\/api\/projects\/([a-z][a-z0-9-]{1,39})\/hosting(?:\/(dns|retry|upload))?$/.exec(path)
      if (managedHostingRoute) {
        const [,name,operation] = managedHostingRoute
        if (name.includes('--') || !hosting.eligible(name)) return fail(res,404,'Projeto não disponível para publicação.')
        if (!operation && req.method === 'GET') return json(res,200,hosting.status(name))
        if (operation === 'dns' && req.method === 'GET') {
          if (!limit(ip,'hosting-dns',20)) return fail(res,429,'Muitas consultas DNS.')
          return json(res,200,await hosting.test(name))
        }
        if (operation === 'retry' && req.method === 'POST') {
          if (!limit(ip,'hosting-retry',12)) return fail(res,429,'Muitas tentativas de publicação.')
          if (Object.keys(await body(req)).length) return fail(res,400,'Parâmetros inválidos.')
          return json(res,202,hosting.retry(name))
        }
        if (operation === 'upload' && req.method === 'POST') {
          if (!limit(ip,'hosting-upload',12)) return fail(res,429,'Muitos envios de ZIP.')
          let saved
          try {
            saved = await uploadZip(req,undefined,22)
            const result = await taskRunner({action:'publish_project_zip',name,upload:saved.name,sha256:saved.sha256})
            audit('project_files_published',{name,ip,success:true})
            return json(res,200,result)
          } catch (error) {
            audit('project_files_published',{name,ip,success:false})
            return fail(res,error.status || 422,error.message)
          } finally { if (saved) fs.rmSync(dataPath(saved.name),{force:true}) }
        }
        return fail(res,405,'Método não permitido.')
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
