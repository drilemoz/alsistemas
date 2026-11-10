'use strict'
const $ = id => document.getElementById(id)
let csrf = ''
let updateMethod = 'github'
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
async function api(url, method = 'GET', payload, { timeoutMs = 0 } = {}) {
  const response = await fetch(url, { method, credentials: 'same-origin',
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    ...(method === 'GET' ? { cache: 'no-store' } : {}), headers: {
    ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {})
  }, body: payload === undefined ? undefined : JSON.stringify(payload) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) { const error = new Error(data.error || `HTTP ${response.status}`); error.httpStatus = response.status; throw error }
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
// v2.0.20: projetos são páginas navegáveis. Nenhum dado sensível é colocado no endereço.
let knownProjects = new Map()
let currentAppRoute = 'overview'
const mainTabs = new Set(['overview', 'projects', 'services', 'backups', 'updates', 'dependencies', 'integrations', 'security', 'audit', 'help'])
const projectSections = new Set(['diagnostics', 'permissions', 'updates', 'backups', 'logs', 'progress'])
function appRouteFromUrl() {
  try { return decodeURIComponent(location.hash.replace(/^#/, '')) || 'overview' }
  catch { return 'overview' }
}
function validAppRoute(route) {
  if (mainTabs.has(route)) return true
  const found = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(aws)(?:\/([a-z]+))?)?$/.exec(route)
  return !!found && (!found[2] || (found[1] === 'iguatamaonline' && (!found[3] || projectSections.has(found[3]))))
}
function showAppRoute(route) {
  if (!validAppRoute(route)) route = 'projects'
  currentAppRoute = route
  const matched = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(aws)(?:\/([a-z]+))?)?$/.exec(route)
  const page = matched ? (!matched[2] ? 'project-detail' : matched[3] ? 'project-' + matched[3] : 'project-aws') : route
  for (const section of document.querySelectorAll('.tab-page')) section.classList.toggle('hidden', section.id !== `page-${page}`)
  const navTab = matched ? 'projects' : route
  for (const button of document.querySelectorAll('[data-tab]')) button.classList.toggle('active', button.dataset.tab === navTab)
  if ($('more-dialog').open) $('more-dialog').close()
  if (matched && page === 'project-detail') renderProjectPage(matched[1])
  if (matched && matched[1] === 'iguatamaonline') {
    if (!externalUploading && (page === 'project-aws' || page === 'project-updates' || page === 'project-progress')) void checkExternalStatus()
    if (page === 'project-diagnostics' || page === 'project-backups' || page === 'project-updates') void reloadExternalInspection()
    if (page === 'project-logs') void loadExternalReport()
  }
  if (route === 'updates') loadUpdateInfo().catch(e => notice(e.message, true))
  if (route === 'dependencies') refreshDependencies().catch(e => notice(e.message, true))
  if (route === 'integrations') refreshIntegrations().catch(e => notice(e.message, true))
  if (route === 'security') loadTrustedDevices().catch(e => notice(e.message, true))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
function navigateApp(route, { replace = false } = {}) {
  if (!validAppRoute(route)) route = 'projects'
  const url = '#' + encodeURI(route)
  if (replace) history.replaceState({ alRoute: route }, '', url)
  else if (location.hash !== url) history.pushState({ alRoute: route }, '', url)
  clearNotice()
  showAppRoute(route)
}
window.addEventListener('popstate', () => showAppRoute(appRouteFromUrl()))
window.addEventListener('hashchange', () => { if (appRouteFromUrl() !== currentAppRoute) showAppRoute(appRouteFromUrl()) })
for (const button of document.querySelectorAll('[data-project-back]')) button.addEventListener('click', () => navigateApp(button.dataset.projectBack))
for (const button of document.querySelectorAll('[data-project-route]')) button.addEventListener('click', () => navigateApp('project/iguatamaonline/aws/' + button.dataset.projectRoute))
function renderProjectPage(name) {
  const item = knownProjects.get(name)
  const techDialog = $('project-tech-dialog')
  if (!item) {
    $('project-details-title').textContent = 'Projeto não encontrado'
    $('project-detail-subtitle').textContent = 'Volte à lista e atualize os projetos.'
    $('project-summary').replaceChildren()
    $('project-detail-actions').replaceChildren()
    $('project-details-content').replaceChildren()
    $('project-tech-title').textContent = 'Ficha técnica indisponível'
    $('project-tech-description').textContent = 'Atualize a lista para consultar domínios e estrutura do projeto.'
    if (techDialog.open) techDialog.close()
    return
  }
  const technology = { php:'PHP', node:'Node.js', static:'HTML / estático' }[item.type] || 'Tecnologia não identificada'
  const managedLabel = item.managed ? 'Gerenciado pelo AL Sistemas' : 'Projeto externo · acesso restrito'
  $('project-details-title').textContent = item.name
  $('project-detail-subtitle').textContent = `${technology} · ${managedLabel}`
  $('project-tech-title').textContent = `Ficha técnica · ${item.name}`
  $('project-tech-description').textContent = 'Leitura em somente visualização para conferir domínios, diretório e limites de acesso.'
  const domains = [...new Set([...(item.domain ? [item.domain] : []), ...(Array.isArray(item.domains) ? item.domains : [])])]
  const summaryItems = [
    ['Diretório', item.path || 'Não identificado'],
    ['Tecnologia', technology],
    ['Acesso', item.managed ? 'Gerenciado' : 'Restrito'],
    ['Nginx', typeof item.enabled === 'boolean' ? (item.enabled ? 'Ativo (HTTP)' : 'Desativado') : 'Não identificado'],
  ]
  if (domains[0]) summaryItems.push(['Domínio principal', domains[0]])
  const summary = $('project-summary')
  summary.replaceChildren()
  for (const [label, value] of summaryItems) {
    const block = node('div', '', 'project-summary-field')
    block.append(node('span', label), node('strong', value))
    summary.append(block)
  }
  const content = $('project-details-content')
  content.replaceChildren()
  const overview = node('div', '', 'project-detail-field')
  overview.append(node('span', 'Resumo técnico', 'small muted'))
  overview.append(node('strong', `${item.name} · ${technology}`))
  overview.append(node('span', `${managedLabel}. Diretório atual: ${item.path || 'não identificado'}.`, 'small muted'))
  content.append(overview)
  const domainBox = node('div', '', 'project-detail-field')
  domainBox.append(node('span', 'Domínios identificados pelo Nginx', 'small muted'))
  if (!domains.length) domainBox.append(node('strong', 'Nenhum domínio identificado'))
  for (const domain of domains) {
    const link = node('a', domain)
    link.href = `https://${domain}`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    domainBox.append(link)
  }
  content.append(domainBox)
  const accessBox = node('div', '', 'project-detail-field')
  accessBox.append(node('span', 'Limites e observações', 'small muted'))
  accessBox.append(node('strong', item.managed ? 'Operações liberadas: backup e controle do site.' : 'Operações externas permanecem restritas.'))
  accessBox.append(node('span', item.name === 'iguatamaonline'
    ? 'A manutenção AWS fica separada para diagnóstico, permissões, atualizações, backups e relatórios.'
    : 'Domínios detectados não autorizam alterar provedores, DNS ou ambientes externos automaticamente.', 'small muted'))
  content.append(accessBox)
  const actions = $('project-detail-actions')
  actions.replaceChildren()
  if (item.name === 'iguatamaonline') {
    const aws = node('button', '', 'project-tool')
    aws.type = 'button'
    aws.append(node('span', '☁', 'project-tool-icon'))
    const labels = node('span')
    labels.append(node('strong', 'Manutenção na AWS'), node('small', 'Diagnóstico, permissões, atualizações, backups e relatórios'))
    aws.append(labels, node('span', '›'))
    aws.addEventListener('click', () => openExternalProject())
    actions.append(aws)
  }
  if (item.managed) {
    const backup = node('button', 'Criar backup criptografado', 'outline')
    backup.type = 'button'
    backup.addEventListener('click', () => openBackup(item.name))
    actions.append(backup)
    if (item.domain && typeof item.enabled === 'boolean') {
      const toggle = node('button', item.enabled ? 'Desativar site' : 'Ativar site', 'outline')
      toggle.type = 'button'
      toggle.addEventListener('click', async () => {
        const enabled = !item.enabled
        if (!await confirmAction(`${enabled ? 'Ativar' : 'Desativar'} o site ${item.name} (${item.domain}) no Nginx? Os arquivos serão preservados.`, enabled ? 'Ativar site' : 'Desativar site')) return
        toggle.disabled = true
        try {
          await api('/api/tasks', 'POST', { action: 'set_site_state', name: item.name, enabled })
          await refresh()
          notice(`Site ${item.name} ${enabled ? 'ativado' : 'desativado'} no Nginx.`)
        } catch (error) { notice(error.message, true); toggle.disabled = false }
      })
      actions.append(toggle)
    }
  }
}
function openProjectDetails(item) { navigateApp(`project/${item.name}`) }
let externalPoll = null
let externalLastError = ''
const externalRoot = '/api/projects/iguatamaonline'
let externalUploading = false
function maintenanceMessage(message, problem = false) {
  const view = $('external-progress-text')
  view.textContent = message
  view.classList.toggle('error', problem)
  if (problem) externalLastError = String(message).slice(0, 1000)
}
async function reloadExternalInspection() {
  const area = $('external-diagnosis')
  area.replaceChildren(node('p', 'Verificando arquivos e permissões…', 'small muted'))
  try {
    const data = await api(externalRoot + '/maintenance')
    area.replaceChildren()
    area.append(node('p', `Versão: ${data.version || 'não identificada'} · pool PHP padrão: ${data.phpDefaultPool || 'não identificado'}`, 'small muted'))
    $('external-current-version').textContent = data.version || 'Não identificada'
    for (const item of data.files || []) {
      const line = node('div', '', 'project-detail-field')
      line.append(node('strong', `${item.safePath ? '✓' : '✕'} ${item.path}`), node('span', item.safePath ?
        `${item.owner}:${item.group} · modo ${item.mode} · escrita PHP (estimativa): ${item.phpWritableEstimate === true ? 'sim' : item.phpWritableEstimate === false ? 'não' : 'indeterminada'}` :
        item.problem || 'Caminho inseguro ou inexistente', 'small muted'))
      area.append(line)
    }
    if (data.mutationAllowed === false) {
      area.append(node('p', 'Ações privilegiadas bloqueadas: ' + (data.mutationBlocker || 'revisão manual necessária.'), 'error small'))
      if (data.rootOwner) area.append(node('p', `Proprietário de produção: ${data.rootOwner}; pai: ${data.parentOwner || 'não identificado'}.`, 'small muted'))
    }
    area.append(node('p', data.note || 'O diagnóstico não concede permissões.', 'small muted'))
    area.append(node('p', data.permissionsGrantActive ? '⚠️ Escrita temporária ainda está ativa.' : 'Permissões temporárias não habilitadas.', data.permissionsGrantActive ? 'error small' : 'small muted'))
    const select = $('external-backups')
    select.replaceChildren(new Option('Escolha um backup', ''))
    for (const item of data.backups || []) select.append(new Option(`${item.id} · ${item.from || '?'} → ${item.to || '?'}`, item.id))
  } catch (error) { area.replaceChildren(node('p', error.message, 'error')) }
}
function stopExternalPolling() {
  if (externalPoll) clearInterval(externalPoll)
  externalPoll = null
}
async function checkExternalStatus() {
  try {
    const response = await api(externalRoot + '/update/status')
    const state = response.status
    if (!state) { if (!externalUploading) { $('external-project-status').textContent = 'Nenhuma atualização registrada.'; $('external-update-summary').textContent = 'Nenhuma atualização registrada.' }; return }
    if (externalUploading) return
    maintenanceMessage(`${state.stage}: ${state.message || ''}`, state.stage === 'failed')
    $('external-project-status').textContent = 'Última atualização: ' + state.stage + ' · ' + (state.message || '')
    $('external-update-summary').textContent = 'Estado: ' + state.stage + ' · ' + (state.message || '')
    $('external-progress-step').textContent = state.stage === 'failed' ? 'A atualização falhou. Consulte Histórico e relatórios.' : state.stage === 'complete' ? 'Atualização concluída.' : 'Etapa atual: ' + state.stage
    const bar = $('external-progress')
    if (typeof state.percent === 'number' && Number.isFinite(state.percent)) {
      bar.hidden = false
      bar.value = state.percent
    } else if (!['complete', 'failed'].includes(state.stage)) {
      bar.hidden = false
      bar.removeAttribute('value') // Progresso indeterminado é mais honesto que porcentagem inventada.
    }
    if (['complete', 'failed'].includes(state.stage)) {
      bar.hidden = state.stage === 'failed'

      stopExternalPolling()
      $('external-reload').classList.toggle('hidden', state.stage !== 'complete')
      await reloadExternalInspection()
    }
  } catch (error) { maintenanceMessage('Consulta de progresso indisponível: ' + error.message, true) }
}
function startExternalPolling() {
  stopExternalPolling()
  $('external-reload').classList.add('hidden')
  void checkExternalStatus()
  externalPoll = setInterval(checkExternalStatus, 1900)
}
async function openExternalProject() {
  navigateApp('project/iguatamaonline/aws')
  try {
    const status = (await api(externalRoot + '/update/status')).status
    if (status && !['complete', 'failed'].includes(status.stage)) startExternalPolling()
  } catch (error) { maintenanceMessage('Falha ao consultar operação: ' + error.message, true) }
}
let externalConfirmResolve = null
const authDialog = $('external-auth-dialog')
function closeExternalAuth() { if (authDialog.open) authDialog.close() }
function requestExternalConfirmation(label, description) {
  if (externalConfirmResolve) return Promise.reject(new Error('Já existe uma confirmação aberta.'))
  $('external-auth-title').textContent = label
  $('external-auth-description').textContent = description
  authDialog.showModal()
  return new Promise(resolve => { externalConfirmResolve = resolve })
}
$('external-auth-form').addEventListener('submit', event => {
  event.preventDefault()
  const resolve = externalConfirmResolve
  externalConfirmResolve = null
  closeExternalAuth()
  if (resolve) resolve(true)
})
authDialog.addEventListener('close', () => {
  if (externalConfirmResolve) { const resolve = externalConfirmResolve; externalConfirmResolve = null; resolve(false) }
})
$('external-auth-close').addEventListener('click', closeExternalAuth)
$('external-auth-cancel').addEventListener('click', closeExternalAuth)
function externalResult(message, error = false) {
  const section = currentAppRoute.split('/').at(-1)
  const dest = section === 'permissions' ? $('external-permission-result') : section === 'backups' ? $('external-backup-result') : section === 'updates' ? $('external-update-summary') : $('external-progress-text')
  dest.textContent = message
  dest.classList.toggle('error', error)
}
async function externalCritical(mode) {
  const backup = $('external-backups').value
  if (mode === 'restore_code' && !backup) { externalResult('Selecione um backup de código.', true); return }
  const label = mode === 'allow' ? 'Liberar escrita temporária' : mode === 'restore' ? 'Restaurar permissões originais' : mode === 'backup_code' ? 'Criar backup do código' : 'Restaurar código da produção'
  const detail = mode === 'allow' ? 'Conceder escrita ao PHP somente aos três arquivos da vistoria? Aumenta o risco até restaurar as permissões.' :
    mode === 'restore' ? 'Restaurar os proprietários, grupos e modos registrados na liberação?' :
    mode === 'backup_code' ? 'Criar cópia privada do código sem banco de dados ou uploads?' :
    `Restaurar os arquivos da produção a partir de ${backup}? Banco de dados e uploads não serão restaurados.`
  // A vistoria não altera nada. Se a árvore for insegura, não pedir código à toa.
  try {
    const inspection = await api(externalRoot + '/maintenance')
    if (inspection.mutationAllowed === false) {
      externalResult(inspection.mutationBlocker || 'A propriedade do projeto exige revisão manual antes da operação.', true)
      return
    }
  } catch (error) { externalResult('Não foi possível verificar o projeto: ' + error.message, true); return }
  if (!await requestExternalConfirmation(label, detail)) return
  try {
    externalResult('Executando operação administrativa…')
    const result = await api(externalRoot + '/maintenance', 'POST', { mode, ...(mode === 'restore_code' ? { backup } : {}) })
    externalResult(result.warning || (mode === 'restore_code' ? 'Código restaurado. Reavalie o portal.' : mode === 'backup_code' ? 'Backup de código salvo no servidor.' : 'Permissões atualizadas.'))
    await reloadExternalInspection()
  } catch (error) { externalResult(error.message, true) }
}
async function externalGithubUpdate() {
  const repo = $('external-repo').value.trim()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) { externalResult('Informe proprietário/repositório do GitHub.', true); return }
  if (!await requestExternalConfirmation('Atualizar pelo GitHub', `Instalar a última Release pública de ${repo} no IguatamaOnline, com backup automático do código?`)) return
  try {
    const started = await api(externalRoot + '/update/github', 'POST', { repo })
    maintenanceMessage('Atualização iniciada: ' + started.operationId)
    navigateApp('project/iguatamaonline/aws/progress')
    startExternalPolling()
  } catch (error) { externalResult(error.message, true) }
}
async function externalFileUpdate() {
  const selected = $('external-zip').files?.[0]
  if (!selected || !selected.name.toLowerCase().endsWith('.zip') || selected.size < 512 || selected.size > 32 * 1024 * 1024) {
    externalResult('Escolha um ZIP válido de 512 B a 32 MiB.', true); return
  }
  if (!await requestExternalConfirmation('Atualizar pelo ZIP', `Enviar ${selected.name} e instalar no IguatamaOnline? Será criado backup do código.`)) return
  const button = $('external-upload')
  button.disabled = true
  externalUploading = true
  navigateApp('project/iguatamaonline/aws/progress')
  maintenanceMessage('Enviando ZIP para a VPS…')
  try {
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', externalRoot + '/update/upload', true)
      xhr.withCredentials = true
      xhr.setRequestHeader('Content-Type', 'application/zip')
      xhr.setRequestHeader('X-CSRF-Token', csrf)
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return
        const percent = Math.floor(event.loaded / event.total * 100)
        $('external-progress').hidden = false
        $('external-progress').value = percent
        maintenanceMessage('Envio do ZIP: ' + percent + '% dos bytes')
      }
      xhr.onload = () => {
        let parsed = {}
        try { parsed = JSON.parse(xhr.responseText) } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed)
        else reject(new Error(parsed.error || `Falha HTTP ${xhr.status}`))
      }
      xhr.onerror = () => reject(new Error('Falha de rede no envio'))
      xhr.onabort = () => reject(new Error('Upload cancelado'))
      xhr.send(selected)
    })
    $('external-zip').value = ''
    syncFilePicker('external-zip', 'external-zip-name', 'Nenhum arquivo selecionado.')
    maintenanceMessage('Atualização iniciada: ' + result.operationId)
    externalUploading = false
    startExternalPolling()
  } catch (error) { maintenanceMessage(error.message, true) }
  finally {
    externalUploading = false
    syncFilePicker('external-zip', 'external-zip-name')
  }
}
$('external-inspect').addEventListener('click', reloadExternalInspection)
$('external-allow').addEventListener('click', () => externalCritical('allow'))
$('external-restore-permissions').addEventListener('click', () => externalCritical('restore'))
$('external-restore-code').addEventListener('click', () => externalCritical('restore_code'))
$('external-backup-code').addEventListener('click', () => externalCritical('backup_code'))
$('external-github').addEventListener('click', externalGithubUpdate)
$('external-upload').addEventListener('click', externalFileUpdate)
$('external-reload').addEventListener('click', () => window.location.reload())
$('external-check-progress').addEventListener('click', () => void checkExternalStatus())
$('external-refresh-version').addEventListener('click', () => void reloadExternalInspection())
$('external-preview-permissions').addEventListener('click', async () => {
  const preview = $('external-permission-preview')
  preview.textContent = 'Consultando permissões atuais…'
  try {
    const data = await api(externalRoot + '/maintenance')
    const files = (data.files || []).map(f => `${f.path}: ${f.safePath ? 'caminho validado' : 'caminho inseguro'}; escrita PHP estimada: ${f.phpWritableEstimate === true ? 'sim' : f.phpWritableEstimate === false ? 'não' : 'indeterminada'}`).join('\n')
    const ownership = data.mutationAllowed === false
      ? `\nBLOQUEADO: ${data.mutationBlocker || 'proprietário exige revisão manual'}`
      : '\nPropriedade apta à verificação de escrita.'
    preview.textContent = `Prévia apenas, nenhuma alteração aplicada.\n${files}${ownership}\nA conta do pool PHP real precisa ser confirmada antes de liberar escrita.`
  } catch (error) { preview.textContent = error.message }
})
$('external-refresh-logs').addEventListener('click', () => void loadExternalReport())
$('external-copy-report').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('external-report-text').textContent); notice('Relatório copiado.') }
  catch { notice('Cópia indisponível neste navegador.', true) }
})
$('external-download-report').addEventListener('click', () => {
  const blob = new Blob([$('external-report-text').textContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = 'IguatamaOnline-relatorio-' + new Date().toISOString().slice(0,10) + '.txt'
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
})
async function loadExternalReport() {
  const out = $('external-report-text')
  out.textContent = 'Consultando…'
  try {
    const [status, auditData] = await Promise.all([api(externalRoot + '/update/status'), api('/api/audit')])
    const s = status.status
    const events = (auditData.events || []).filter(ev => ev.name === 'iguatamaonline' || (typeof ev.action === 'string' && /project_update|project_permissions|restore_project_code|backup_external_code/.test(ev.action)))
    const lines = ['AL Sistemas · IguatamaOnline', 'Relatório consultado: ' + new Date().toLocaleString('pt-BR'), '', 'Última atualização:', s ? JSON.stringify(s, null, 2) : 'Nenhuma atualização registrada.', '', ...(externalLastError ? ['Último erro observado na interface:', externalLastError, ''] : []), 'Eventos administrativos recentes:']
    if (!events.length) lines.push('Nenhum evento relacionado ao projeto encontrado no histórico disponível.')
    for (const ev of events.slice(0, 30)) lines.push(JSON.stringify(ev))
    out.textContent = lines.join('\n')
  } catch (error) { out.textContent = 'Falha ao consultar o relatório: ' + error.message }
}

async function refresh() {
  const [m, p, a] = await Promise.all([api('/api/monitor'), api('/api/projects'), api('/api/audit')])
  renderMetrics(m)
  await updateDiagnostics()
  await updateBackups()
  $('projects').replaceChildren()
  knownProjects = new Map(p.projects.map(item => [item.name, item]))
  $('project-count').textContent = String(p.projects.length)
  for (const item of p.projects) {
    const line = node('button', '', 'project-line project-tile project-entry')
    line.type = 'button'
    line.setAttribute('aria-label', 'Abrir projeto ' + item.name)
    line.addEventListener('click', () => openProjectDetails(item))
    const emblem = node('span', '', 'project-emblem')
    emblem.append(iconGraphic(item.type === 'php' ? 'code' : item.type === 'node' ? 'server' : 'folder'))
    line.append(emblem)
    const info = node('div', '', 'project-info')
    info.append(node('strong', item.name), node('div', `${item.type} • ${item.domain || 'domínio não identificado'} • ${item.managed ? 'AL Sistemas' : item.name === 'iguatamaonline' ? 'manutenção restrita' : 'somente leitura'}`, 'small muted'))
    line.append(info)
    line.append(node('span', '›', 'project-entry-chevron'))
    $('projects').append(line)
  }
  if (!p.projects.length) $('projects').append(node('p', 'Nenhum projeto localizado em /var/www/projetos.', 'muted'))
  if (currentAppRoute.startsWith('project/')) showAppRoute(currentAppRoute)
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
    activateTab(validAppRoute(appRouteFromUrl()) ? appRouteFromUrl() : 'overview', {record:false})
    await refresh()
    await resumeUpdateIfNeeded()
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
// Nomes de arquivo não são caminhos: são dados visuais fornecidos pelo navegador.
function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) return 'tamanho desconhecido'
  if (size < 1024) return `${size} B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KiB`
  return `${(size / 1048576).toFixed(2)} MiB`
}
function validSelectedZip(file) {
  return !!file && /\.zip$/i.test(file.name) && file.size >= 512 && file.size <= 32 * 1024 * 1024
}
function syncFilePicker(inputId, textId, emptyText = 'Nenhum arquivo selecionado.') {
  const input = $(inputId)
  const label = $(textId)
  if (!input || !label) return
  const file = input.files?.[0]
  const valid = validSelectedZip(file)
  label.textContent = file ? `${file.name} · ${formatBytes(file.size)}${valid ? ' · Pronto para enviar' : ' · ZIP inválido (512 B a 32 MiB)'}` : emptyText
  label.classList.toggle('has-file', !!file && valid)
  label.classList.toggle('invalid-file', !!file && !valid)
  if (inputId === 'update-file-input' && updateMethod === 'file') $('update-submit').disabled = !valid
  if (inputId === 'external-zip') $('external-upload').disabled = !valid || externalUploading
}
for (const [buttonId, inputId] of [['update-file-trigger', 'update-file-input'], ['external-zip-trigger', 'external-zip']]) {
  const button = $(buttonId)
  const input = $(inputId)
  if (button && input) {
    button.addEventListener('click', () => input.click())
    input.addEventListener('change', () => syncFilePicker(inputId, inputId === 'update-file-input' ? 'update-file-name' : 'external-zip-name'))
    input.addEventListener('input', () => syncFilePicker(inputId, inputId === 'update-file-input' ? 'update-file-name' : 'external-zip-name'))
  }
}
// Alguns seletores de arquivos do Android restauram o foco sem emitir 'change'.
// Reconciliar os FileLists também ao voltar para a página.
function reconcileFilePickers() {
  syncFilePicker('update-file-input', 'update-file-name')
  syncFilePicker('external-zip', 'external-zip-name')
}
window.addEventListener('focus', () => setTimeout(reconcileFilePickers, 100))
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(reconcileFilePickers, 100) })
window.addEventListener('pageshow', reconcileFilePickers)
for (const id of ['project-tech-open', 'project-tech-shortcut']) {
  const button = $(id)
  if (button) button.addEventListener('click', () => $('project-tech-dialog').showModal())
}
syncFilePicker('update-file-input', 'update-file-name', 'Nenhum arquivo selecionado.')
syncFilePicker('external-zip', 'external-zip-name', 'Nenhum arquivo selecionado.')
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
    // FormData lê o valor real do input, inclusive o que o Chrome preencheu
    // sem disparar eventos de input. Nunca enviar OTP de um campo desativado.
    let sess
    try {
      sess = await api('/api/login', 'POST', {
        password: e.currentTarget.elements.namedItem('password').value,
        otp: $('login-otp').disabled ? '' : (data.otp || ''),
        trustDevice: !$('trust-device').disabled && data.trustDevice === 'yes'
      })
    } catch (error) {
      if (error.httpStatus === 401) {
        throw new Error('Senha ou código TOTP inválido. Se usou uma senha salva, confira se ela corresponde à senha atual do painel.')
      }
      throw error
    }
    csrf = sess.csrf
    e.target.reset(); shown('dashboard'); $('logout').classList.remove('hidden')
    activateTab(validAppRoute(appRouteFromUrl()) ? appRouteFromUrl() : 'overview', {record:false})
    await refresh()
    await resumeUpdateIfNeeded()
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
    const result = await api('/api/dependencies/install', 'POST', { package: packageToInstall })
    $('package-dialog').close()
    await refreshDependencies()
    notice(result.message || 'Solicitação de instalação enviada ao servidor.')
  } catch (error) { notice(error.message, true) }
  finally { submitButton.disabled = false }
})

function activateTab(tab, { record = true } = {}) {
  if (!mainTabs.has(tab) && !validAppRoute(tab)) return
  if (record) navigateApp(tab)
  else showAppRoute(tab)
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
  const trusted = !!enabled
  const otp = $('login-otp')
  const remember = $('trust-device')
  $('login-otp-row').classList.toggle('hidden', trusted)
  $('trusted-note').classList.toggle('hidden', !trusted)
  otp.required = !trusted
  // Campos ocultos continuam participando de FormData e podem ser preenchidos
  // novamente pelo navegador. Desativá-los impede enviar um TOTP antigo.
  otp.disabled = trusted
  remember.disabled = trusted
  if (trusted) { otp.value = ''; remember.checked = false }
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
    await api('/api/security/revoke-all', 'POST', {})
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
  const button = $('update-release-help')
  const content = $('update-notes-content')
  content.replaceChildren()
  $('update-readme-content').textContent = ''
  $('update-readme-link').replaceChildren()
  $('update-readme-button').classList.add('hidden')
  if (!data || data.releaseStatus !== 'published') {
    button.classList.add('hidden')
    return
  }
  button.classList.remove('hidden')
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
    $('update-readme-content').textContent = readme
    $('update-readme-button').classList.remove('hidden')
    if (data.readmeUrl && /^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/blob\/v\d+\.\d+\.\d+\/README\.md$/i.test(data.readmeUrl)) {
      const link = node('a', 'Ver README completo no GitHub')
      link.href = data.readmeUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      $('update-readme-link').append(link)
    }
  }
  if (!note && !readme && !data.changes) content.append(node('p', 'Esta Release não possui notas nem README disponível na tag.', 'small muted'))
}
$('update-release-help').addEventListener('click', () => $('update-release-dialog').showModal())
$('update-readme-button').addEventListener('click', () => {
  $('update-release-dialog').close()
  $('update-readme-dialog').showModal()
})
$('update-readme-back').addEventListener('click', () => {
  $('update-readme-dialog').close()
  $('update-release-dialog').showModal()
})
function rowInfo(container, title, value) { appendLine(container, title, value) }
async function loadUpdateInfo() {
  const data = await api('/api/updates', 'GET', undefined, { timeoutMs: 8000 })
  $('update-summary').replaceChildren()
  rowInfo($('update-summary'), 'Instalada', `v${data.installed}`)
  rowInfo($('update-summary'), 'Repositório', data.repo || 'Não configurado')
  if (data.status) rowInfo($('update-summary'), 'Última operação', `${data.status.stage}: ${data.status.message}`)
  $('update-repo').value = data.repo || 'drilemoz/alsistemas'
  document.querySelector('.repo-url').textContent = `https://github.com/${$('update-repo').value}`
  const repo = data.repo || 'drilemoz/alsistemas'
  $('github-releases-link').href = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_.-]+$/.test(repo) ? `https://github.com/${repo}/releases` : 'https://github.com/drilemoz/alsistemas/releases'
  const inProgress = updateBusy.has(data.status?.stage)
  $('apply-update').disabled = inProgress || !(lastRelease?.available && lastRelease?.assetsReady)
  $('upload-update').disabled = inProgress
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
    $('apply-update').disabled = updateBusy.has((await loadUpdateInfo()).status?.stage) || !(data.available && data.assetsReady)
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
// Atualizações: cada etapa usa o estado persistido no servidor; percentuais somente
// durante transferência de bytes, nunca uma porcentagem fictícia da instalação.
const updateSteps = [
  ['queued', 'Solicitação recebida'], ['checking', 'Consultando versão'],
  ['uploading', 'Enviando ZIP'], ['downloading', 'Baixando ZIP'],
  ['validating', 'Validando SHA-256 e pacote'], ['backup', 'Criando backup'],
  ['installing', 'Instalando'], ['verifying', 'Verificando serviço'],
  ['completed', 'Concluído']
]
const updateBusy = new Set(['queued', 'checking', 'uploading', 'downloading', 'validating', 'backup', 'installing', 'verifying', 'rolling_back'])
let updatePollingTimeout = null
let currentOperation = null
let latestUpdateReport = ''
let lastSelectedZip = null
function rememberUpdateZip(file) {
  lastSelectedZip = file ? { name: file.name, size: file.size } : null
  try {
    if (lastSelectedZip) sessionStorage.setItem('als-update-zip', JSON.stringify(lastSelectedZip))
    else sessionStorage.removeItem('als-update-zip')
  } catch { /* sessao sem armazenamento */ }
}
function progressConnection(text, issue = false) {
  const panel = $('update-progress-connection')
  panel.textContent = text
  panel.classList.toggle('connection-issue', issue)
}
function showProgressSource() {
  const info = $('update-progress-file')
  info.classList.toggle('hidden', updateMethod !== 'file' || !lastSelectedZip)
  if (updateMethod === 'file' && lastSelectedZip) info.textContent = `Arquivo enviado: ${lastSelectedZip.name} · ${formatBytes(lastSelectedZip.size)}`
}
function updateConnectionTimestamp(state) {
  const date = state?.time ? new Date(state.time) : null
  const recent = date && !Number.isNaN(date.getTime()) ? ` · último registro da etapa às ${date.toLocaleTimeString('pt-BR')}` : ''
  progressConnection(`Conectado ao painel · consulta às ${new Date().toLocaleTimeString('pt-BR')}${recent}`)
}
function composeUpdateReport(state) {
  const when = state?.time || new Date().toISOString()
  const error = String(state?.message || 'Falha sem mensagem do serviço.').slice(0, 2400)
  const status = state?.httpStatus ? `HTTP ${state.httpStatus}` : 'não informado'
  const hint = state?.httpStatus === 413
    ? 'O servidor recusou o tamanho do envio. Verifique client_max_body_size no Nginx do painel (incluindo proxy intermediário).'
    : /verificação de saúde/i.test(error)
      ? 'Verifique a versão instalada, a resposta de /api/health e os logs de alsistemas-vps e alsistemas-updater na EC2.'
      : 'Confira os logs de alsistemas-updater.service na VPS para identificar a causa.'
  const lines = [
    'AL Sistemas | Relatório de erro de atualização',
    `Data/hora (UTC): ${when}`,
    `Método: ${state?.mode === 'file' ? 'Arquivo ZIP' : state?.mode === 'github' ? 'GitHub Releases' : updateMethod}`,
    `Operação: ${state?.id || currentOperation || 'não iniciada'}`,
    `Etapa: ${state?.stage || 'desconhecida'}`,
    `Código HTTP: ${status}`,
    `Versão do painel (navegador): ${document.querySelector('footer')?.textContent?.match(/v\d+\.\d+\.\d+/)?.[0] || 'não confirmada'}`,
    `Mensagem: ${error}`,
    `Orientação: ${hint}`,
  ]
  const append = (label, value) => {
    if (value === undefined || value === null || value === '') return
    if (typeof value === 'object') lines.push(`${label}: ${JSON.stringify(value, null, 2)}`)
    else lines.push(`${label}: ${String(value)}`)
  }
  append('Versão instalada antes da tentativa', state?.installedBefore)
  append('Versão alvo informada', state?.target)
  append('Versão candidata do pacote', state?.candidateVersion)
  append('Versão instalada após tentativa', state?.installed)
  append('Arquivo/asset informado', state?.archive)
  append('Repositório configurado', state?.repo)
  append('SHA-256 informado (prefixo)', state?.sha256Prefix)
  append('Snapshot de backup', state?.backupSnapshot)
  append('Diagnóstico de saúde', state?.healthDiagnostics)
  append('Retorno do instalador', state?.installerExitCode)
  append('Saída do instalador', state?.installerStderrTail)
  append('Falhas de reversão', state?.rollbackErrors)
  append('Bytes recebidos', typeof state?.bytesReceived === 'number' ? `${state.bytesReceived}${typeof state?.bytesTotal === 'number' ? ` / ${state.bytesTotal}` : ''}` : '')
  const ignored = new Set(['time','message','mode','id','stage','httpStatus','installedBefore','target','candidateVersion','installed','archive','repo','sha256Prefix','backupSnapshot','healthDiagnostics','installerExitCode','installerStderrTail','rollbackErrors','bytesReceived','bytesTotal','percent'])
  const extras = Object.entries(state || {}).filter(([key]) => !ignored.has(key))
  if (extras.length) {
    lines.push('Outros campos recebidos:')
    for (const [key, value] of extras) append(` - ${key}`, value)
  }
  lines.push('Observação: o relatório agora tenta reunir o máximo de contexto do painel, mas ainda não substitui os logs da EC2. Remova informações privadas antes de compartilhar.')
  return lines.join('\n')
}
function openProgress() {
  if (!$('update-progress-dialog').open) $('update-progress-dialog').showModal()
  $('view-update-progress').classList.remove('hidden')
}
function showUpdateProgress(state) {
  const stage = state?.stage || 'queued'
  const label = updateSteps.find(([key]) => key === stage)?.[1] || ({failed:'Falha na atualização', up_to_date:'Nenhuma versão nova', rolling_back:'Revertendo instalação', stalled:'Progresso interrompido'})[stage] || 'Verificando…'
  $('update-progress-state').textContent = label
  $('update-progress-message').textContent = state?.message || 'Verificando a atualização no servidor.'
  showProgressSource()
  const percent = Number(state?.percent)
  const determinate = Number.isInteger(percent) && percent >= 0 && percent <= 100 && (stage === 'downloading' || stage === 'uploading' || stage === 'completed')
  $('update-progress-track').classList.toggle('indeterminate', !determinate && updateBusy.has(stage))
  $('update-progress-fill').style.width = determinate ? `${percent}%` : (updateBusy.has(stage) ? '' : '0%')
  $('update-progress-track').setAttribute('aria-valuenow', determinate ? String(percent) : '0')
  $('update-progress-percent').textContent = determinate ? (stage === 'completed' ? 'Concluído · 100%' : `Transferência: ${percent}%`) : (updateBusy.has(stage) ? 'Etapa em andamento · progresso percentual indisponível' : 'Operação finalizada')
  $('update-step-list').replaceChildren()
  const sequence = updateSteps.filter(([key]) => updateMethod === 'file' ? key !== 'downloading' && key !== 'checking' : key !== 'uploading')
  const index = sequence.findIndex(([key]) => key === stage)
  for (const [i, [key, name]] of sequence.entries()) {
    const li = node('li', `${i < index || stage === 'completed' ? '✓' : i === index ? '●' : '○'} ${name}`)
    if (i < index || stage === 'completed') li.classList.add('done')
    if (i === index && stage !== 'completed') li.classList.add('active')
    $('update-step-list').append(li)
  }
  if (stage === 'failed' || stage === 'stalled') latestUpdateReport = composeUpdateReport(state)
  else if (updateBusy.has(stage) || stage === 'completed') latestUpdateReport = ''
  $('update-report-open').classList.toggle('hidden', !(stage === 'failed' || stage === 'stalled'))
  const terminal = ['completed', 'failed', 'up_to_date', 'stalled'].includes(stage)
  $('update-progress-reload').classList.toggle('hidden', stage !== 'completed')
  $('update-progress-reload').textContent = 'Atualizar página'
  $('update-progress-close').textContent = terminal ? 'Fechar' : 'Ocultar'
  if (terminal && stage !== 'stalled') { try { sessionStorage.removeItem('als-update-id'); sessionStorage.removeItem('als-update-zip') } catch {} }
}
function clearUpdateTimer() { if (updatePollingTimeout) clearTimeout(updatePollingTimeout); updatePollingTimeout = null }
function beginUpdatePolling() {
  clearUpdateTimer()
  let errors = 0
  const poll = async () => {
    try {
      const info = await loadUpdateInfo()
      errors = 0
      updateConnectionTimestamp(info.status)
      if (info.status && (!currentOperation || info.status.id === currentOperation)) {
        updateMethod = info.status.mode || updateMethod
        showUpdateProgress(info.status)
        if (!updateBusy.has(info.status.stage)) return
      } else if (currentOperation) {
        progressConnection('Conectado, mas o serviço ainda não informou o estado desta operação.', true)
      }
    } catch (error) {
      errors++
      const authRequired = error?.httpStatus === 401
      progressConnection(authRequired
        ? 'Sessão anterior não foi recuperada. Entre novamente para retomar o acompanhamento; o ZIP não deve ser reenviado.'
        : `Conexão temporariamente indisponível (${errors} tentativa${errors === 1 ? '' : 's'}). Última etapa conhecida preservada.`, true)
      if (authRequired) {
        $('update-progress-reload').classList.remove('hidden')
        $('update-progress-reload').textContent = 'Entrar e retomar'
        return
      }
      if (errors >= 3) {
        $('update-progress-reload').classList.remove('hidden')
        $('update-progress-reload').textContent = 'Reabrir painel'
      }
      if (errors >= 45) {
        progressConnection('Sem resposta após várias tentativas. Reabra o painel ou confira o serviço na VPS. O andamento salvo poderá ser recuperado.', true)
        return
      }
    }
    updatePollingTimeout = setTimeout(poll, 3000)
  }
  updatePollingTimeout = setTimeout(poll, 1000)
}
function beginTrackedUpdate(result) {
  currentOperation = result.operationId || null
  try { if (currentOperation) sessionStorage.setItem('als-update-id', currentOperation) } catch {}
  showUpdateProgress({ stage:'queued', message:result.message || 'Solicitação recebida.' })
  progressConnection('Pedido aceito · aguardando a primeira atualização do instalador.')
  beginUpdatePolling()
}
async function resumeUpdateIfNeeded() {
  let stored = null
  try { stored = sessionStorage.getItem('als-update-id') } catch {}
  if (!stored) return
  currentOperation = stored
  try {
    const previous = JSON.parse(sessionStorage.getItem('als-update-zip') || 'null')
    if (previous && typeof previous.name === 'string' && Number.isFinite(previous.size)) lastSelectedZip = previous
  } catch { /* nenhum arquivo de atualização salvo */ }
  try {
    const info = await loadUpdateInfo()
    if (info.status?.id === stored) {
      updateMethod = info.status.mode || 'github'
      activateTab('updates')
      openProgress()
      showUpdateProgress(info.status)
      updateConnectionTimestamp(info.status)
      if (updateBusy.has(info.status.stage)) beginUpdatePolling()
    } else sessionStorage.removeItem('als-update-id')
  } catch { /* Pode exigir login depois de restart; recuperação no próximo login */ }
}
function configureUpdateDialog(method) {
  updateMethod = method
  $('update-title').textContent = method === 'file' ? 'Atualizar por arquivo ZIP' : 'Atualizar pelo GitHub'
  $('update-confirm-description').textContent = method === 'file'
    ? 'Escolha um ZIP confiável de versão superior. O servidor verificará SHA-256, estrutura e versão. Depois fará backup e reiniciará o serviço. ZIPs locais não comprovam a identidade do autor.'
    : 'O painel baixará a Release, validará o manifesto SHA-256 e o ZIP, fará backup e reiniciará o serviço.'
  $('update-file-label').classList.toggle('hidden', method !== 'file')
  $('update-file-input').required = method === 'file'
  if (method !== 'file') { $('update-file-input').value = ''; rememberUpdateZip(null) }
  syncFilePicker('update-file-input', 'update-file-name', 'Nenhum arquivo selecionado.')
  $('update-submit').disabled = method === 'file' && !validSelectedZip($('update-file-input').files?.[0])
  $('update-submit').textContent = method === 'file' ? 'Enviar e instalar' : 'Instalar'
  $('update-dialog').showModal()
}
$('apply-update').addEventListener('click', () => configureUpdateDialog('github'))
$('upload-update').addEventListener('click', () => configureUpdateDialog('file'))
$('update-cancel').addEventListener('click', () => { $('update-dialog').close(); $('update-apply-form').reset(); syncFilePicker('update-file-input', 'update-file-name', 'Nenhum arquivo selecionado.') })
$('update-progress-hide').addEventListener('click', () => $('update-progress-dialog').close())
$('update-progress-close').addEventListener('click', () => $('update-progress-dialog').close())
$('update-progress-reload').addEventListener('click', () => window.location.reload())
$('update-report-open').addEventListener('click', () => {
  if (!latestUpdateReport) return
  $('update-report-text').textContent = latestUpdateReport
  $('update-report-dialog').showModal()
})
$('update-report-copy').addEventListener('click', async () => {
  if (!latestUpdateReport) return
  try {
    await navigator.clipboard.writeText(latestUpdateReport)
    notice('Relatório copiado. Revise antes de compartilhá-lo.')
  } catch {
    const selection = window.getSelection()
    selection?.selectAllChildren($('update-report-text'))
    notice('Selecione e copie o texto do relatório manualmente.', true)
  }
})
$('update-report-download').addEventListener('click', () => {
  if (!latestUpdateReport) return
  const blob = new Blob([latestUpdateReport + '\n'], { type:'text/plain;charset=utf-8' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = `AL-Sistemas-erro-atualizacao-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
$('view-update-progress').addEventListener('click', async () => {
  openProgress()
  try {
    const info = await loadUpdateInfo()
    if (info.status) {
      updateMethod = info.status.mode || updateMethod
      currentOperation = info.status.id || null
      showUpdateProgress(info.status)
      if (updateBusy.has(info.status.stage)) beginUpdatePolling()
    } else showUpdateProgress({stage:'idle', message:'Nenhuma atualização registrada neste servidor.'})
  } catch (error) { showUpdateProgress({stage:'failed', message:error.message, httpStatus:error.httpStatus}) }
})
function sendZip(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/updates/upload')
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/zip')
    xhr.setRequestHeader('X-CSRF-Token', csrf)
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(100, Math.floor(100 * event.loaded / event.total))) }
    xhr.onload = () => {
      let result
      try { result = JSON.parse(xhr.responseText) } catch { result = {} }
      if (xhr.status >= 200 && xhr.status < 300) resolve(result)
      else { const error = new Error(result.error || `Falha no envio: HTTP ${xhr.status}`); error.httpStatus = xhr.status; reject(error) }
    }
    xhr.onerror = () => reject(new Error('Conexão perdida durante envio do arquivo'))
    xhr.ontimeout = () => reject(new Error('Tempo limite do envio excedido'))
    xhr.timeout = 120000
    xhr.send(file)
  })
}
$('update-apply-form').addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.currentTarget
  const button = $('update-submit')
  const file = $('update-file-input').files[0]
  if (updateMethod === 'file' && (!file || !/\.zip$/i.test(file.name) || file.size < 512 || file.size > 32 * 1024 * 1024)) {
    notice('Selecione um arquivo .zip válido de até 32 MiB.', true)
    return
  }
  button.disabled = true
  rememberUpdateZip(updateMethod === 'file' ? file : null)
  $('update-dialog').close()
  openProgress()
  showUpdateProgress({ stage:updateMethod === 'file' ? 'uploading' : 'queued', message:'Preparando solicitação…', percent:0 })
  progressConnection('Enviando solicitação ao servidor…')
  try {
    const result = updateMethod === 'file'
      ? await sendZip(file, percent => showUpdateProgress({ stage:'uploading', percent, message:`Enviando ${file.name} para a VPS` }))
      : await api('/api/updates/apply', 'POST', {})
    form.reset()
    syncFilePicker('update-file-input', 'update-file-name', 'Nenhum arquivo selecionado.')
    beginTrackedUpdate(result)
  } catch (error) {
    showUpdateProgress({ stage:'failed', message:error.message, mode:updateMethod, httpStatus:error.httpStatus })
  } finally { button.disabled = false }
})
