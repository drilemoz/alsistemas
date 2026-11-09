'use strict'
const $ = id => document.getElementById(id)
let csrf = ''
let bootstrap = ''
let challenge = ''
let noticeTimeout = null
let auditEvents = []
let auditFilter = 'all'
const shown = name => { for (const id of ['setup', 'login', 'dashboard']) $(id).classList.toggle('hidden', id !== name) }
function notice(text, error = false) {
  if (noticeTimeout) clearTimeout(noticeTimeout)
  $('message').textContent = text
  $('message').className = 'message' + (error ? ' error' : '')
  // Feedback transitório: não permanece em todas as abas após a ação.
  if (!error) noticeTimeout = setTimeout(clearNotice, 7000)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function clearNotice() {
  if (noticeTimeout) clearTimeout(noticeTimeout)
  noticeTimeout = null
  $('message').classList.add('hidden')
}
function confirmAction(detail, label) {
  return new Promise(resolve => {
    const dialog = $('confirm-dialog')
    $('confirm-detail').textContent = detail
    $('confirm-accept').textContent = label
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
    dialog.showModal()
  })
}
async function api(url, method = 'GET', payload) {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: {
    ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {})
  }, body: payload === undefined ? undefined : JSON.stringify(payload) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}
function node(tag, text, className = '') {
  const elem = document.createElement(tag)
  elem.textContent = text
  if (className) elem.className = className
  return elem
}
function appendLine(where, left, right, rightClass = '') {
  const row = node('div', '', 'line')
  row.append(node('div', left), node('div', right, rightClass))
  where.append(row)
}
const serviceVisuals = {
  nginx: { icon: 'globe', label: 'Nginx', description: 'Servidor web' },
  'php8.3-fpm': { icon: 'code', label: 'PHP 8.3-FPM', description: 'Processamento PHP' },
  mariadb: { icon: 'database', label: 'MariaDB', description: 'Banco de dados' },
  'alsistemas-vps': { icon: 'server', label: 'AL Sistemas VPS', description: 'Painel administrativo' }
}
function serviceCard(container, name, state, extra = '') {
  const service = serviceVisuals[name] || { icon: 'server', label: name, description: 'Serviço do sistema' }
  const active = state === 'active'
  const card = node('div', '', 'service-card')
  const glyph = node('span', '', 'service-icon')
  glyph.append(iconGraphic(service.icon))
  const body = node('div', '', 'service-main')
  body.append(node('strong', service.label), node('span', service.description + (extra ? ` · ${extra}` : ''), 'small muted'))
  card.append(glyph, body, node('span', active ? 'Ativo' : (state === 'inactive/unknown' ? 'Indisponível' : state), active ? 'status-chip status-ok' : 'status-chip status-issue'))
  container.append(card)
}
const bytes = n => n >= 1073741824 ? `${(n/1073741824).toFixed(1)} GiB` : `${(n/1048576).toFixed(0)} MiB`
function iconGraphic(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#i-${name}`)
  svg.append(use)
  return svg
}
function metric(title, value, icon) {
  const card = node('div', '', 'stat')
  const label = node('div', '', 'stat-label')
  label.append(iconGraphic(icon), node('span', title))
  card.append(label, node('strong', value))
  $('metrics').append(card)
}
function renderMetrics(m) {
  $('metrics').replaceChildren()
  metric('Host', m.hostname, 'server')
  metric('CPU', `${m.cpuCount} vCPU | carga ${m.loadAverage[0].toFixed(2)}`, 'cpu')
  metric('RAM disponível', `${bytes(m.ram.available)} / ${bytes(m.ram.total)}`, 'memory')
  metric('Swap livre', `${bytes(m.swap.free)} / ${bytes(m.swap.total)}`, 'updates')
  metric('Disco livre', `${bytes(m.disk.free)} / ${bytes(m.disk.total)}`, 'disk')
  metric('Uptime', `${Math.floor(m.uptimeSeconds/86400)}d ${Math.floor(m.uptimeSeconds%86400/3600)}h`, 'clock')
  $('services').replaceChildren()
  $('overview-services').replaceChildren()
  for (const [name, status] of Object.entries(m.services)) {
    serviceCard($('services'), name, status)
    serviceCard($('overview-services'), name, status)
  }
}
async function refresh() {
  const [m, p, a] = await Promise.all([api('/api/monitor'), api('/api/projects'), api('/api/audit')])
  renderMetrics(m)
  await updateDiagnostics()
  await updateBackups()
  $('projects').replaceChildren()
  $('project-count').textContent = String(p.projects.length)
  for (const item of p.projects) {
    const line = node('div', '', 'project-line')
    const info = node('div', '', 'project-info')
    info.append(node('strong', item.name), node('div', `${item.type} • ${item.domain || 'sem domínio'} • ${item.managed ? 'AL Sistemas' : 'somente leitura'}`, 'small muted'))
    line.append(info)
    if (item.managed && item.domain && typeof item.enabled === 'boolean') {
      const actions = node('div', '', 'project-actions')
      const state = node('span', item.enabled ? 'Ativo (HTTP)' : 'Desativado', item.enabled ? 'good small' : 'muted small')
      const action = node('button', item.enabled ? 'Desativar' : 'Ativar', 'outline')
      action.type = 'button'
      action.addEventListener('click', async () => {
        const enabled = !item.enabled
        if (!await confirmAction(`${enabled ? 'Ativar' : 'Desativar'} o site ${item.name} (${item.domain}) no Nginx? A pasta e os arquivos do projeto serão preservados.`, enabled ? 'Ativar site' : 'Desativar site')) return
        action.disabled = true
        try {
          const result = await api('/api/tasks', 'POST', { action: 'set_site_state', name: item.name, enabled })
          await refresh()
          notice(result.unchanged ? 'O site já estava nesse estado.' : `Site ${item.name} ${enabled ? 'ativado' : 'desativado'} no Nginx.`)
        } catch (error) { notice(error.message, true); action.disabled = false }
      })
      actions.append(state, action)
      line.append(actions)
    }
    if (item.managed) {
      const backup = node('button', 'Backup criptografado', 'outline')
      backup.type = 'button'
      backup.addEventListener('click', () => openBackup(item.name))
      line.append(backup)
    }
    $('projects').append(line)
  }
  if (!p.projects.length) $('projects').append(node('p', 'Nenhum projeto localizado em /var/www/projetos.', 'muted'))
  auditEvents = Array.isArray(a.events) ? a.events : []
  renderAudit()

}
const auditLabels = {
  login_success: ['Login realizado', 'login', 'access', 'ok'],
  login_failed: ['Login recusado', 'alert', 'access', 'issue'],
  setup_complete: ['Configuração concluída', 'success', 'system', 'ok'],
  setup_rejected: ['Configuração recusada', 'alert', 'access', 'issue'],
  device_trusted: ['Dispositivo confiável', 'mobile', 'access', 'ok'],
  device_revoked: ['Dispositivo revogado', 'lock', 'access', 'neutral'],
  all_devices_revoked: ['Dispositivos revogados', 'lock', 'access', 'issue'],
  task_requested: ['Tarefa solicitada', 'terminal', 'system', 'neutral'],
  task_success: ['Tarefa concluída', 'success', 'system', 'ok'],
  task_failed: ['Falha na tarefa', 'alert', 'system', 'issue'],
  update_requested: ['Atualização solicitada', 'updates', 'system', 'neutral'],
  update_repo_configured: ['Repositório configurado', 'gear', 'system', 'neutral'],
  package_install_requested: ['Instalação solicitada', 'package', 'system', 'neutral'],
  package_install_rejected: ['Instalação recusada', 'alert', 'system', 'issue'],
  integration_saved: ['Integração salva', 'key', 'system', 'ok'],
  integration_removed: ['Integração removida', 'key', 'system', 'neutral'],
  logout: ['Saída da conta', 'logout', 'access', 'neutral']
}
function auditDetail(item) {
  const field = value => typeof value === 'string' && !['undefined', 'null', '[object Object]'].includes(value.trim().toLowerCase()) ? value.trim() : ''
  const name = field(item.name)
  const action = field(item.action)
  const reason = field(item.reason)
  if (item.enabled === 'true' || item.enabled === 'false') return [name, item.enabled === 'true' ? 'ativar' : 'desativar'].filter(Boolean).join(' · ')
  return [name, action, reason].filter(Boolean).join(' · ')
}
function renderAudit() {
  $('audit').replaceChildren()
  for (const item of auditEvents) {
    const [title, icon, group, variant] = auditLabels[item.event] || [String(item.event || 'Evento do sistema').replaceAll('_', ' '), 'info', 'system', 'neutral']
    if (auditFilter !== 'all' && auditFilter !== group) continue
    const card = node('div', '', 'audit-item')
    const badge = node('span', '', `audit-icon audit-${variant}`)
    badge.append(iconGraphic(icon))
    const body = node('div', '', 'audit-content')
    const time = new Date(item.time)
    body.append(node('strong', title), node('span', Number.isNaN(time.getTime()) ? 'Horário indisponível' : time.toLocaleString('pt-BR'), 'small muted'))
    const detail = auditDetail(item)
    if (detail) body.append(node('span', detail, 'small audit-detail'))
    card.append(badge, body)
    $('audit').append(card)
  }
  if (!$('audit').children.length) $('audit').append(node('p', 'Nenhum evento para este filtro.', 'muted'))
}
for (const button of document.querySelectorAll('[data-audit-filter]')) {
  button.addEventListener('click', () => {
    auditFilter = button.dataset.auditFilter
    for (const item of document.querySelectorAll('[data-audit-filter]')) item.classList.toggle('active', item === button)
    renderAudit()
  })
}

async function bootstrapPage() {
  const status = await api('/api/status')
  $('version').textContent = 'v' + status.version
  $('footer-version').textContent = 'v' + status.version
  if (!status.configured) return shown('setup')
  setTrustedLogin(status.trustedDevice)
  try {
    const sess = await api('/api/session')
    csrf = sess.csrf
    shown('dashboard'); $('logout').classList.remove('hidden')
    activateTab('overview')
    await refresh()
  } catch { shown('login') }
}
async function submit(form, fn) {
  const button = form.querySelector('button[type=submit]')
  button.disabled = true
  clearNotice()
  try { await fn(Object.fromEntries(new FormData(form))) }
  catch (error) { notice(error.message, true) }
  finally { button.disabled = false }
}
function changeTheme(value) {
  if (!['system', 'light', 'dark'].includes(value)) value = 'system'
  document.documentElement.dataset.theme = value
  try { localStorage.setItem('als-theme', value) } catch { /* Navegador sem armazenamento disponível */ }
  for (const button of document.querySelectorAll('[data-theme-choice]')) {
    const chosen = button.dataset.themeChoice === value
    button.classList.toggle('selected', chosen)
    button.setAttribute('aria-pressed', String(chosen))
  }
}
let initialTheme = 'system'
try { initialTheme = localStorage.getItem('als-theme') || 'system' } catch { /* Tema do sistema */ }
changeTheme(initialTheme)
$('theme-open').addEventListener('click', () => $('theme-dialog').showModal())
for (const button of document.querySelectorAll('[data-theme-choice]')) {
  button.addEventListener('click', () => { changeTheme(button.dataset.themeChoice); $('theme-dialog').close() })
}
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => $(button.dataset.close).close())
}
$('setup-begin').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    bootstrap = data.bootstrap
    const step = await api('/api/setup/begin', 'POST', { bootstrap })
    challenge = step.challenge
    $('otp-secret').textContent = step.secret
    $('setup-begin').classList.add('hidden')
    $('setup-step2').classList.remove('hidden')
    notice('Configure o autenticador com a chave e confirme o primeiro código TOTP.')
  })
})
$('copy-secret').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('otp-secret').textContent); notice('Chave copiada.') } catch { notice('Cópia indisponível neste navegador.', true) } })
$('setup-finish').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    await api('/api/setup/finish', 'POST', { bootstrap, challenge, password: data.password, otp: data.otp })
    $('otp-secret').textContent = ''; bootstrap = ''; challenge = ''
    shown('login'); notice('Painel configurado. Entre com a senha e o código TOTP.')
  })
})
$('login-form').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    const sess = await api('/api/login', 'POST', { password: data.password, otp: data.otp || '', trustDevice: data.trustDevice === 'yes' })
    csrf = sess.csrf
    e.target.reset(); shown('dashboard'); $('logout').classList.remove('hidden')
    activateTab('overview')
    await refresh()
  })
})
$('create').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    if (!await confirmAction(`Criar o novo projeto "${data.name}"? Nenhum projeto existente será substituído.`, 'Criar projeto')) return
    const result = await api('/api/tasks', 'POST', { action: 'create_project', ...data })
    e.target.reset()
    $('project-dialog').close()
    notice(`Projeto ${result.name} criado em ${result.path}. ${result.nginxConfigured ? 'Nginx configurado, HTTP somente. Falta HTTPS.' : 'Nenhum domínio foi publicado.'}`)
    await refresh()
  })
})
$('refresh').addEventListener('click', () => { clearNotice(); refresh().catch(e => notice(e.message, true)) })
$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', 'POST'); csrf = ''; shown('login'); $('logout').classList.add('hidden'); setTrustedLogin((await api('/api/status')).trustedDevice) }
  catch (e) { notice(e.message, true) }
})
bootstrapPage().catch(e => notice(`Não foi possível carregar o painel: ${e.message}`, true))


let backupName = ''
function openBackup(name) {
  backupName = name
  $('backup-description').textContent = `Criar cópia criptografada da pasta public/ de ${name}. A operação não modifica os arquivos do site.`
  $('backup-form').reset()
  $('backup-dialog').showModal()
}
async function updateBackups() {
  $('backups').replaceChildren()
  try {
    const data = await api('/api/backups')
    $('backup-count').textContent = String(data.backups.length)
    for (const item of data.backups) {
      const wrapper = node('div', '', 'backup-item')
      wrapper.append(node('strong', `${item.name} • ${bytes(item.bytes)}`), node('div', `${item.files} arquivos • ${new Date(item.createdAt).toLocaleString('pt-BR')} • criptografado`, 'small muted'))
      wrapper.append(node('div', item.archive, 'small break-text'))
      const copy = node('button', 'Copiar SHA-256', 'outline')
      copy.type = 'button'
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(item.sha256); notice('SHA-256 do backup copiado.') }
        catch { notice('Não foi possível copiar neste navegador.', true) }
      })
      wrapper.append(copy)
      $('backups').append(wrapper)
    }
    if (!data.backups.length) $('backups').append(node('p', 'Nenhum backup registrado. A cópia permanece somente na VPS até transferência externa.', 'small muted'))
  } catch (e) {
    $('backup-count').textContent = 'indisponível'
    $('backups').append(node('p', `Inventário não disponível: ${e.message}`, 'small muted'))
  }
}
async function updateDiagnostics() {
  try {
    const details = await api('/api/services')
    $('services').replaceChildren()
    for (const item of details.services) {
      const label = `${item.active} / ${item.substate} • ${item.enabled}`
      serviceCard($('services'), item.unit, item.active, `${item.substate} · ${item.enabled}`)
    }
  } catch { /* painel ainda pode exibir os estados básicos vindos de /api/monitor */ }
}
$('nginx-test').addEventListener('click', async () => {
  $('nginx-test').disabled = true
  $('nginx-diagnostic').textContent = 'Executando nginx -t…'
  try {
    const value = await api('/api/tasks', 'POST', { action: 'validate_nginx' })
    $('nginx-diagnostic').textContent = value.diagnostic
    $('nginx-diagnostic').className = value.valid ? 'small good' : 'small bad'
  } catch (e) {
    $('nginx-diagnostic').textContent = e.message
    $('nginx-diagnostic').className = 'small bad'
  } finally { $('nginx-test').disabled = false }
})
$('backup-cancel').addEventListener('click', () => {
  $('backup-form').reset(); $('backup-dialog').close()
})
$('backup-form').addEventListener('submit', async e => {
  e.preventDefault()
  const passphrase = $('backup-secret').value
  $('backup-save').disabled = true
  $('backup-cancel').disabled = true
  $('backup-save').textContent = 'Criptografando…'
  try {
    const result = await api('/api/tasks', 'POST', { action: 'backup_project', name: backupName, passphrase })
    $('backup-form').reset()
    $('backup-dialog').close()
    await updateBackups()
    notice(`Backup criptografado criado: ${result.backup.archive}. Guarde a frase secreta e copie o arquivo para fora da VPS.`)
  } catch (e) { notice(e.message, true) }
  finally {
    $('backup-save').disabled = false
    $('backup-cancel').disabled = false
    $('backup-save').textContent = 'Criar backup'
    $('backup-secret').value = ''
  }
})


// Navegação por módulos: troca somente a visualização, sem carregar dados em intervalos.
let packageToInstall = null
async function refreshDependencies() {
  const info = await api('/api/dependencies')
  $('package-list').replaceChildren()
  const state = info.status
  $('package-status').textContent = state ? `${state.package || ''}: ${state.message || state.stage || ''}` : 'Nenhuma instalação iniciada pelo painel.'
  for (const pkg of info.packages) {
    const line = node('div', '', 'package-line')
    const label = node('div', '', 'package-info')
    const helps = { 'php-curl': 'Requisições HTTP a serviços externos', 'php-mbstring': 'Strings e acentuação UTF-8', 'php-xml': 'Leitura e criação de XML', 'php-mysql': 'Conexão do PHP ao MariaDB', 'php-zip': 'Arquivos compactados ZIP', 'php-gd': 'Processamento de imagens', 'php-intl': 'Internacionalização e idiomas', composer: 'Dependências de projetos PHP' }
    const iconWrap = node('span', '', 'package-icon')
    iconWrap.append(iconGraphic(pkg.id === 'composer' ? 'package' : pkg.id === 'php-mysql' ? 'database' : pkg.id === 'php-curl' ? 'globe' : 'code'))
    label.append(node('strong', pkg.label), node('div', helps[pkg.id] || 'Pacote do ambiente', 'small muted'), node('div', pkg.installed ? `Instalado · ${pkg.version}` : 'Não instalado', pkg.installed ? 'small good' : 'small muted'))
    line.append(iconWrap, label)
    const b = node('button', pkg.installed ? 'Instalado' : 'Instalar', 'outline button-small')
    b.disabled = !!pkg.installed || state?.stage === 'installing'
    b.addEventListener('click', () => {
      packageToInstall = pkg.id
      $('package-description').textContent = `Instalar ${pkg.label} via APT na VPS? A operação pode instalar dependências adicionais do sistema.`
      $('package-form').reset()
      $('package-dialog').showModal()
    })
    line.append(b)
    $('package-list').append(line)
  }
}
$('reload-packages').addEventListener('click', () => refreshDependencies().catch(e => notice(e.message, true)))
$('package-form').addEventListener('submit', async e => {
  e.preventDefault()
  const submitButton = e.currentTarget.querySelector('button[type=submit]')
  submitButton.disabled = true
  try {
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await api('/api/dependencies/install', 'POST', { package: packageToInstall, ...values })
    $('package-dialog').close()
    await refreshDependencies()
    notice(result.message || 'Solicitação de instalação enviada ao servidor.')
  } catch (error) { notice(error.message, true) }
  finally { submitButton.disabled = false }
})

function activateTab(tab) {
  clearNotice()
  if (!['overview', 'projects', 'services', 'backups', 'updates', 'dependencies', 'integrations', 'security', 'audit', 'help'].includes(tab)) return
  for (const page of document.querySelectorAll('.tab-page')) page.classList.toggle('hidden', page.id !== `page-${tab}`)
  for (const button of document.querySelectorAll('[data-tab]')) button.classList.toggle('active', button.dataset.tab === tab)
  if ($('more-dialog').open) $('more-dialog').close()
  if (tab === 'updates') loadUpdateInfo().catch(e => notice(e.message, true))
  if (tab === 'dependencies') refreshDependencies().catch(e => notice(e.message, true))
  if (tab === 'integrations') refreshIntegrations().catch(e => notice(e.message, true))
  if (tab === 'security') loadTrustedDevices().catch(e => notice(e.message, true))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
for (const nav of document.querySelectorAll('[data-tab]')) nav.addEventListener('click', () => activateTab(nav.dataset.tab))
$('more-nav').addEventListener('click', () => $('more-dialog').showModal())
$('more-close').addEventListener('click', () => $('more-dialog').close())
$('new-project').addEventListener('click', () => {
  $('create').reset()
  $('project-dialog').showModal()
  $('create').elements.name.focus()
})
$('repo-settings').addEventListener('click', async () => {
  try {
    await loadUpdateInfo()
    $('repo-dialog').showModal()
    $('update-repo').focus()
  } catch (e) { notice(e.message, true) }
})
$('update-repo').addEventListener('input', () => {
  const repo = $('update-repo').value.trim()
  document.querySelector('.repo-url').textContent = /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}` : 'Informe proprietário/repositório'
})

function setTrustedLogin(enabled) {
  $('login-otp-row').classList.toggle('hidden', !!enabled)
  $('trusted-note').classList.toggle('hidden', !enabled)
  $('login-otp').required = !enabled
  if (enabled) { $('login-otp').value = ''; $('trust-device').checked = false }
}
for (const button of document.querySelectorAll('.password-toggle')) button.addEventListener('click', () => {
  const input = $(button.dataset.target)
  const showing = input.type === 'password'
  input.type = showing ? 'text' : 'password'
  button.textContent = showing ? 'Ocultar' : 'Mostrar'
  button.setAttribute('aria-label', showing ? 'Ocultar senha' : 'Mostrar senha')
})

async function loadTrustedDevices() {
  const result = await api('/api/security/devices')
  $('trusted-devices').replaceChildren()
  for (const device of result.devices) {
    const ua = String(device.label || '')
    const browser = /Firefox/i.test(ua) ? 'Firefox' : /Edg\//i.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Chrome/i.test(ua) ? 'Chrome' : 'Navegador'
    const system = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Sistema não identificado'
    const current = device.id === result.currentId
    const line = node('div', '', 'trusted-card')
    const glyph = node('span', '', 'service-icon')
    glyph.append(iconGraphic(/Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'monitor'))
    const main = node('div', '', 'trusted-main')
    main.append(node('strong', `${browser} · ${system}`), node('span', `Confiança até ${new Date(device.expires).toLocaleDateString('pt-BR')}`, 'small muted'))
    const detail = node('details', '', 'trusted-raw')
    detail.append(node('summary', 'Detalhes do navegador'), node('p', ua || 'Não informado', 'small muted break-text'))
    main.append(detail)
    line.append(glyph, main)
    if (current) line.append(node('span', 'Este dispositivo', 'status-chip status-ok'))
    $('trusted-devices').append(line)
  }
  if (!result.devices.length) $('trusted-devices').append(node('p', 'Nenhum dispositivo confiável cadastrado.', 'muted small'))
  $('forget-device').disabled = !result.currentId
}
$('forget-device').addEventListener('click', async () => {
  if (!await confirmAction('Esquecer este dispositivo? Na próxima entrada, senha e TOTP serão obrigatórios.', 'Esquecer')) return
  try { await api('/api/security/forget-device', 'POST', {}); await loadTrustedDevices(); notice('Confiança deste dispositivo revogada.') }
  catch (e) { notice(e.message, true) }
})
$('revoke-devices').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    if (!await confirmAction('Revogar o acesso confiável de todos os dispositivos?', 'Revogar todos')) return
    await api('/api/security/revoke-all', 'POST', data)
    e.target.reset()
    csrf = ''
    shown('login')
    $('logout').classList.add('hidden')
    setTrustedLogin(false)
    notice('Todos os dispositivos e sessões foram revogados. Entre novamente com senha e TOTP.')
  })
})

let lastRelease = null
function showReleaseNotes(data) {
  const wrapper = $('update-notes')
  const content = $('update-notes-content')
  content.replaceChildren()
  if (!data || data.releaseStatus !== 'published') {
    wrapper.classList.add('hidden')
    return
  }
  wrapper.classList.remove('hidden')
  const note = String(data.releaseNotes || '').trim()
  const readme = String(data.readme || '').trim()
  if (note) {
    const block = node('div', '', 'release-block')
    block.append(node('h4', 'Notas da Release'), node('p', note, 'release-text'))
    content.append(block)
  }
  if (data.changes) {
    const block = node('div', '', 'release-block')
    block.append(node('h4', 'Alterações do CHANGELOG'), node('p', String(data.changes).slice(0, 2500), 'release-text'))
    content.append(block)
  }
  if (readme) {
    const details = node('details', '', 'release-block')
    details.append(node('summary', 'Ler README.md desta versão'), node('pre', readme, 'release-text'))
    if (data.readmeUrl && /^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/blob\/v\d+\.\d+\.\d+\/README\.md$/i.test(data.readmeUrl)) {
      const link = node('a', 'Ver README completo no GitHub')
      link.href = data.readmeUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      details.append(link)
    }
    content.append(details)
  }
  if (!note && !readme && !data.changes) content.append(node('p', 'Esta Release não possui notas nem README disponível na tag.', 'small muted'))
}
function rowInfo(container, title, value) { appendLine(container, title, value) }
async function loadUpdateInfo() {
  const data = await api('/api/updates')
  $('update-summary').replaceChildren()
  rowInfo($('update-summary'), 'Instalada', `v${data.installed}`)
  rowInfo($('update-summary'), 'Repositório', data.repo || 'Não configurado')
  if (data.status) rowInfo($('update-summary'), 'Última operação', `${data.status.stage}: ${data.status.message}`)
  $('update-repo').value = data.repo || 'drilemoz/alsistemas'
  document.querySelector('.repo-url').textContent = `https://github.com/${$('update-repo').value}`
  const repo = data.repo || 'drilemoz/alsistemas'
  $('github-releases-link').href = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_.-]+$/.test(repo) ? `https://github.com/${repo}/releases` : 'https://github.com/drilemoz/alsistemas/releases'
  const inProgress = ['checking', 'downloading', 'validating', 'installing', 'rolling_back'].includes(data.status?.stage)
  $('apply-update').disabled = inProgress || !(lastRelease?.available && lastRelease?.assetsReady)
  return data
}
$('check-update').addEventListener('click', async () => {
  $('check-update').disabled = true
  try {
    const data = await api('/api/updates/check', 'POST', {})
    lastRelease = data
    showReleaseNotes(data)
    await loadUpdateInfo()
    if (data.latest) rowInfo($('update-summary'), 'Última Release', `v${data.latest}`)
    rowInfo($('update-summary'), 'Verificação', data.message)
    $('apply-update').disabled = !(data.available && data.assetsReady)
  } catch (e) { lastRelease = null; showReleaseNotes(null); notice(e.message, true) }
  finally { $('check-update').disabled = false }
})
$('update-repo-form').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    await api('/api/updates/configure', 'POST', data)
    lastRelease = null
    showReleaseNotes(null)
    e.target.reset()
    $('repo-dialog').close()
    await loadUpdateInfo()
    notice('Repositório de atualizações configurado. Próximo passo: verificar a Release.')
  })
})
$('apply-update').addEventListener('click', () => $('update-dialog').showModal())
$('update-cancel').addEventListener('click', () => $('update-dialog').close())
$('update-apply-form').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    if (!await confirmAction('Instalar atualização do GitHub? O serviço poderá reiniciar e sua sessão cairá. Uma cópia da versão anterior será criada.', 'Confirmar instalação')) return
    const result = await api('/api/updates/apply', 'POST', data)
    e.target.reset()
    $('update-dialog').close()
    notice(result.message || 'Serviço de atualização iniciado. Consulte o estado no painel após a reinicialização.')
    await loadUpdateInfo()
    beginUpdatePolling()
  })
})

// Polling temporário só durante uma atualização solicitada pelo usuário.
let updatePollingTimeout = null
function beginUpdatePolling() {
  if (updatePollingTimeout) clearTimeout(updatePollingTimeout)
  let attempts = 0
  const poll = async () => {
    attempts++
    try {
      const state = await loadUpdateInfo()
      if (['completed', 'failed', 'up_to_date'].includes(state.status?.stage)) {
        notice(state.status.message, state.status.stage === 'failed')
        return
      }
    } catch (error) {
      if (error.message.includes('Autenticação')) {
        csrf = ''
        shown('login')
        $('logout').classList.add('hidden')
        notice('O serviço pode ter reiniciado após a atualização. Entre novamente para verificar a versão.')
        return
      }
    }
    if (attempts < 100) updatePollingTimeout = setTimeout(poll, 4000)
  }
  updatePollingTimeout = setTimeout(poll, 2500)
}
