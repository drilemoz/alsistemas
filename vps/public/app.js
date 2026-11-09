'use strict'
const $ = id => document.getElementById(id)
let csrf = ''
let bootstrap = ''
let challenge = ''
const shown = name => { for (const id of ['setup', 'login', 'dashboard']) $(id).classList.toggle('hidden', id !== name) }
function notice(text, error = false) {
  $('message').textContent = text
  $('message').className = 'message' + (error ? ' error' : '')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function clearNotice() { $('message').classList.add('hidden') }
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
    appendLine($('services'), name, status, status === 'active' ? 'good' : 'bad')
    appendLine($('overview-services'), name, status === 'active' ? 'Ativo' : status, status === 'active' ? 'good' : 'bad')
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
  $('audit').replaceChildren()
  for (const item of a.events) {
    const detail = item.enabled === undefined ? (item.name || item.reason || '') : `${item.name || ''} • ${item.enabled === 'true' ? 'ativar' : 'desativar'}`
    const friendly = { login_success: 'Login realizado', login_failed: 'Login recusado', setup_complete: 'Configuração concluída', device_trusted: 'Dispositivo confiável', device_revoked: 'Dispositivo revogado', all_devices_revoked: 'Sessões e dispositivos revogados', task_success: 'Tarefa concluída', task_failed: 'Tarefa recusada', update_requested: 'Atualização solicitada', update_repo_configured: 'Repositório configurado', package_install_requested: 'Instalação de pacote solicitada', package_install_rejected: 'Instalação de pacote recusada', logout: 'Saída da conta' }
    appendLine($('audit'), `${new Date(item.time).toLocaleString('pt-BR')} • ${friendly[item.event] || item.event}`, detail)
  }
  if (!a.events.length) $('audit').append(node('p', 'Sem eventos registrados.', 'muted'))
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
      appendLine($('services'), item.unit, label, item.active === 'active' ? 'good' : 'bad')
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
    label.append(node('strong', pkg.label), node('div', pkg.installed ? `Instalado • ${pkg.version}` : 'Não instalado', 'small muted'))
    line.append(label)
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
    const line = node('div', '', 'line')
    line.append(node('div', `${device.label}${device.id === result.currentId ? ' • Este dispositivo' : ''}`),
      node('div', `Até ${new Date(device.expires).toLocaleDateString('pt-BR')}`, 'muted small'))
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
function rowInfo(container, title, value) { appendLine(container, title, value) }
async function loadUpdateInfo() {
  const data = await api('/api/updates')
  $('update-summary').replaceChildren()
  rowInfo($('update-summary'), 'Instalada', `v${data.installed}`)
  rowInfo($('update-summary'), 'Repositório', data.repo || 'Não configurado')
  rowInfo($('update-summary'), 'Assinatura Ed25519', data.signingReady ? 'Chave pública cadastrada' : 'Chave pública ausente')
  if (data.status) rowInfo($('update-summary'), 'Última operação', `${data.status.stage}: ${data.status.message}`)
  $('update-repo').value = data.repo || 'drilemoz/alsistemas'
  document.querySelector('.repo-url').textContent = `https://github.com/${$('update-repo').value}`
  const inProgress = ['checking', 'downloading', 'validating', 'installing', 'rolling_back'].includes(data.status?.stage)
  $('apply-update').disabled = inProgress || !(lastRelease?.available && lastRelease?.assetsReady && data.signingReady)
  return data
}
$('check-update').addEventListener('click', async () => {
  $('check-update').disabled = true
  try {
    const data = await api('/api/updates/check', 'POST', {})
    lastRelease = data
    await loadUpdateInfo()
    if (data.latest) rowInfo($('update-summary'), 'Última Release', `v${data.latest}`)
    rowInfo($('update-summary'), 'Verificação', data.message)
    $('apply-update').disabled = !(data.available && data.assetsReady && data.signingReady)
  } catch (e) { notice(e.message, true) }
  finally { $('check-update').disabled = false }
})
$('update-repo-form').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    await api('/api/updates/configure', 'POST', data)
    lastRelease = null
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
    if (!await confirmAction('Instalar atualização assinada? O serviço poderá reiniciar e sua sessão cairá. Uma cópia da versão anterior será criada.', 'Confirmar instalação')) return
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
