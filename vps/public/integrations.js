'use strict'
// 2.0.16: central de integrações com operações DNS controladas; sem exposição de segredos.
const spaceshipForm = $('spaceship-form')
const spaceshipDomain = $('spaceship-domain')
let spaceshipConfigured = false
let spaceshipVerified = false
let spaceshipLastQuery = null
let spaceshipDnsRecords = []
let spaceshipDnsTotal = 0
let spaceshipDnsOperation = null
let spaceshipDnsPending = null

function openIntegrationDialog(id) {
  const dialog = $(id)
  if (!dialog.open) dialog.showModal()
}
function closeIntegrationDialog(id) {
  const dialog = $(id)
  if (dialog.open) dialog.close()
}
function spaceshipHelp(open) {
  if (open) openIntegrationDialog('spaceship-help-dialog')
  else closeIntegrationDialog('spaceship-help-dialog')
}
for (const id of ['spaceship-help', 'spaceship-help-inline']) $(id).addEventListener('click', () => spaceshipHelp(true))
for (const id of ['spaceship-help-close', 'spaceship-help-done']) $(id).addEventListener('click', () => spaceshipHelp(false))
for (const [id, target] of [
  ['spaceship-manage-close', 'spaceship-manage-dialog'],
  ['spaceship-manage-cancel', 'spaceship-manage-dialog'],
  ['spaceship-dns-close', 'spaceship-dns-dialog']
]) $(id).addEventListener('click', () => closeIntegrationDialog(target))

function updateSpaceshipState() {
  const state = $('spaceship-status')
  const credentials = $('spaceship-credential-info')
  const last = $('spaceship-last-check')
  state.className = `integration-state ${spaceshipConfigured ? 'integration-connected' : 'integration-disconnected'}`
  state.textContent = spaceshipConfigured ? 'Credenciais salvas no servidor' : 'Aguardando configuração'
  credentials.textContent = spaceshipConfigured
    ? '✓ API Key e API Secret armazenadas na VPS. Não é necessário preenchê-las novamente.'
    : 'Nenhuma credencial salva. Cadastre a API Key e a API Secret abaixo.'
  credentials.className = `credential-state ${spaceshipConfigured ? 'credential-ready' : ''}`
  $('spaceship-remove').disabled = !spaceshipConfigured
  $('spaceship-open-dns').disabled = !spaceshipConfigured
  $('spaceship-manage-test').disabled = !spaceshipConfigured
  last.textContent = spaceshipVerified && spaceshipLastQuery
    ? `Última consulta nesta sessão: ${spaceshipLastQuery.domain} · ${spaceshipLastQuery.count} registro(s)`
    : spaceshipConfigured ? 'Conexão ainda não testada nesta sessão' : 'Configure para consultar registros DNS'
}
async function refreshIntegrations() {
  const status = await api('/api/integrations')
  spaceshipConfigured = !!status?.spaceship?.configured
  if (!spaceshipConfigured) { spaceshipVerified = false; spaceshipLastQuery = null; spaceshipDnsRecords = [] }
  updateSpaceshipState()
}
$('spaceship-open').addEventListener('click', async () => {
  try { await refreshIntegrations(); openIntegrationDialog('spaceship-manage-dialog') }
  catch (error) { notice(error.message, true) }
})
function openSpaceshipDns() {
  if (!spaceshipConfigured) return
  closeIntegrationDialog('spaceship-manage-dialog')
  openIntegrationDialog('spaceship-dns-dialog')
  if (spaceshipLastQuery) spaceshipDomain.value = spaceshipLastQuery.domain
  spaceshipDomain.focus()
}
$('spaceship-open-dns').addEventListener('click', openSpaceshipDns)
$('spaceship-manage-test').addEventListener('click', openSpaceshipDns)
$('spaceship-show').addEventListener('change', event => {
  for (const name of ['apiKey', 'apiSecret']) spaceshipForm.elements[name].type = event.target.checked ? 'text' : 'password'
})
function resetSpaceshipCredentialForm() {
  spaceshipForm.reset()
  for (const name of ['apiKey','apiSecret']) spaceshipForm.elements[name].type = 'password'
}
$('spaceship-manage-dialog').addEventListener('close', resetSpaceshipCredentialForm)
spaceshipForm.addEventListener('submit', async event => {
  event.preventDefault()
  const submit = spaceshipForm.querySelector('[type=submit]')
  submit.disabled = true
  try {
    await api('/api/integrations/spaceship', 'POST', {
      apiKey: spaceshipForm.elements.apiKey.value,
      apiSecret: spaceshipForm.elements.apiSecret.value
    })
    spaceshipVerified = false
    spaceshipLastQuery = null
    resetSpaceshipCredentialForm()
    await refreshIntegrations()
    $('spaceship-query-status').textContent = 'Informe um domínio para testar as novas credenciais.'
    $('spaceship-results').replaceChildren()
    $('spaceship-credential-info').textContent = '✓ Credenciais salvas. Para verificar acesso, toque em Testar DNS.'
    notice('Credenciais da Spaceship salvas no servidor.')
  } catch (error) { notice(error.message, true) }
  finally { submit.disabled = false }
})
$('spaceship-remove').addEventListener('click', async () => {
  if (!await confirmAction('Remover as credenciais da Spaceship deste servidor? Os registros DNS não serão alterados.', 'Remover')) return
  try {
    await api('/api/integrations/spaceship', 'DELETE')
    resetSpaceshipCredentialForm()
    spaceshipVerified = false
    spaceshipLastQuery = null
    $('spaceship-results').replaceChildren()
    $('spaceship-add-record').disabled = true
    $('spaceship-query-status').textContent = 'A integração foi removida.'
    await refreshIntegrations()
    closeIntegrationDialog('spaceship-manage-dialog')
    notice('Integração Spaceship removida. O DNS não foi alterado.')
  } catch (error) { notice(error.message, true) }
})

function dnsSvg(icon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#i-${icon}`)
  svg.append(use)
  return svg
}
function dnsIconForType(type) {
  return ({ A:'server', AAAA:'server', CNAME:'globe', MX:'database', TXT:'file', NS:'globe', SRV:'activity', CAA:'shield', PTR:'globe' })[type] || 'info'
}
function dnsValue(record) {
  const type = String(record.type || '').toUpperCase()
  const priorities = type === 'A' || type === 'AAAA'
    ? ['address', 'value', 'data']
    : type === 'CNAME' ? ['cname', 'value', 'target', 'data']
    : type === 'MX' ? ['exchange', 'mailServer', 'value', 'data']
    : ['value', 'data', 'address', 'cname', 'target', 'text', 'content']
  for (const key of priorities) {
    const candidate = record[key]
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate)
  }
  const ignored = new Set(['type','name','host','ttl','group','id','uuid'])
  return Object.entries(record).filter(([key]) => !ignored.has(key))
    .map(([key,value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ') || 'Valor não informado'
}
function renderDns(payload) {
  const container = $('spaceship-results')
  container.replaceChildren()
  const records = Array.isArray(payload?.items) ? payload.items : []
  spaceshipDnsRecords = records
  spaceshipDnsTotal = Number.isSafeInteger(payload?.total) ? payload.total : records.length
  $('spaceship-add-record').disabled = !spaceshipConfigured || spaceshipDnsTotal > records.length
  if (!records.length) {
    const empty = document.createElement('p')
    empty.className = 'dns-empty small muted'
    empty.textContent = 'Nenhum registro retornado nesta página. Confira o domínio e as permissões da chave.'
    container.append(empty)
    return { shown: 0, total: Number.isSafeInteger(payload?.total) ? payload.total : 0 }
  }
  const summary = document.createElement('div')
  summary.className = 'dns-summary'
  const heading = document.createElement('strong')
  heading.textContent = 'Registros encontrados'
  const count = document.createElement('span')
  count.className = 'dns-count'
  const total = Number.isSafeInteger(payload?.total) && payload.total >= 0 ? payload.total : records.length
  count.textContent = `${Math.min(records.length, 500)} de ${total}`
  summary.append(heading, count)
  container.append(summary)
  for (const record of records.slice(0, 500)) {
    if (!record || typeof record !== 'object') continue
    const type = String(record.type ?? '?').toUpperCase().slice(0, 24)
    const card = document.createElement('article')
    card.className = 'dns-record dns-record-card'
    const emblem = document.createElement('span')
    emblem.className = 'dns-record-emblem'
    emblem.append(dnsSvg(dnsIconForType(type)))
    const main = document.createElement('div')
    main.className = 'dns-record-main'
    const label = document.createElement('div')
    label.className = 'dns-record-title'
    const host = document.createElement('strong')
    host.textContent = String(record.name ?? record.host ?? '@')
    const chip = document.createElement('span')
    chip.className = 'dns-type-chip'
    chip.textContent = type
    label.append(host, chip)
    const value = document.createElement('code')
    value.className = 'dns-value'
    value.textContent = dnsValue(record)
    main.append(label, value)
    if (record.ttl !== undefined) {
      const ttl = document.createElement('span')
      ttl.className = 'small muted dns-ttl'
      ttl.textContent = `TTL: ${String(record.ttl)}s`
      main.append(ttl)
    }
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'outline icon-button dns-copy'
    copy.title = 'Copiar valor DNS'
    copy.setAttribute('aria-label', `Copiar valor do registro ${type} ${host.textContent}`)
    copy.append(dnsSvg('copy'))
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(value.textContent); copy.title = 'Copiado'; notice('Valor DNS copiado.') }
      catch { notice('Não foi possível copiar. Selecione o valor manualmente.', true) }
    })
    const isCustom = record.group?.type === 'custom'
    const editable = isCustom && ['A','CNAME','TXT'].includes(type) && dnsEditableName(String(record.name ?? '')) &&
      Number.isSafeInteger(Number(record.ttl)) && Number(record.ttl) >= 300 && Number(record.ttl) <= 86400 &&
      Object.hasOwn(record, type === 'A' ? 'address' : type === 'CNAME' ? 'cname' : 'value') &&
      spaceshipDnsTotal <= records.length
    if (editable) {
      const actions = document.createElement('div')
      actions.className = 'dns-write-actions'
      for (const [operation, title] of [['update_ttl','Editar TTL'],['delete','Excluir']]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'outline button-small' + (operation === 'delete' ? ' destructive' : '')
        button.textContent = title
        button.addEventListener('click', () => openDnsChange(operation, {
          type, name: record.name, value: record[type === 'A' ? 'address' : type === 'CNAME' ? 'cname' : 'value'], ttl: Number(record.ttl)
        }))
        actions.append(button)
      }
      main.append(actions)
    }
    card.append(emblem, main, copy)
    container.append(card)
  }
  return { shown: Math.min(records.length, 500), total }
}
$('spaceship-dns-form').addEventListener('submit', async event => {
  event.preventDefault()
  const domain = spaceshipDomain.value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    $('spaceship-query-status').textContent = 'Informe um domínio válido, como exemplo.com.'
    return
  }
  const button = $('spaceship-dns')
  button.disabled = true
  $('spaceship-query-status').textContent = 'Consultando registros na Spaceship…'
  $('spaceship-results').replaceChildren()
  try {
    const result = await api(`/api/integrations/spaceship/dns?domain=${encodeURIComponent(domain)}`)
    const { shown, total } = renderDns(result.records)
    spaceshipVerified = true
    spaceshipLastQuery = { domain, count: shown }
    updateSpaceshipState()
    $('spaceship-query-status').textContent = total > shown
      ? `Conexão autorizada. Exibindo ${shown} de ${total} registros (primeira página).`
      : `Conexão autorizada. ${shown} registro(s) retornado(s).`
    $('spaceship-query-status').className = 'dns-query-status dns-query-ok small'
  } catch (error) {
    $('spaceship-query-status').textContent = `Falha na consulta: ${error.message}`
    $('spaceship-query-status').className = 'dns-query-status dns-query-error small'
  } finally { button.disabled = !spaceshipConfigured }
})

// Somente os registros personalizados não essenciais são modificáveis nesta versão.
function dnsEditableName(name) {
  const lower = name.toLowerCase()
  return !!lower && !['@','www','painel','mail','smtp','imap','pop','autodiscover','migrar','_dmarc','_domainkey','_acme-challenge'].includes(lower) &&
    !lower.startsWith('_acme-challenge.') && !lower.endsWith('._domainkey')
}
function closeDnsChange(id) { closeIntegrationDialog(id) }
$('spaceship-change-close').addEventListener('click', () => closeDnsChange('spaceship-change-dialog'))
$('spaceship-change-cancel').addEventListener('click', () => closeDnsChange('spaceship-change-dialog'))
$('spaceship-confirm-close').addEventListener('click', () => closeDnsChange('spaceship-confirm-dialog'))
$('spaceship-confirm-cancel').addEventListener('click', () => closeDnsChange('spaceship-confirm-dialog'))
function openDnsChange(operation, original = null) {
  if (!spaceshipLastQuery || spaceshipDnsTotal > spaceshipDnsRecords.length) return
  spaceshipDnsOperation = { action: operation, previous: original ? { ...original } : undefined }
  const form = $('spaceship-change-form')
  form.reset()
  for (const key of ['type','name','value','ttl']) {
    form.elements[key].disabled = operation !== 'create' && key !== 'ttl'
    if (original) form.elements[key].value = original[key]
  }
  if (operation === 'delete') form.elements.ttl.disabled = true
  const labels = { create: 'Adicionar registro DNS', update_ttl: 'Editar TTL do registro', delete: 'Excluir registro DNS' }
  $('spaceship-change-title').textContent = labels[operation]
  $('spaceship-change-hint').textContent = operation === 'create'
    ? 'Adicione um registro novo. Os nomes críticos da hospedagem são bloqueados.'
    : operation === 'update_ttl' ? 'Edite apenas o TTL. O nome e o valor serão preservados.'
    : 'Exclusão irreversível pela API. Verifique bem o nome e o destino.'
  $('spaceship-change-preview').textContent = operation === 'delete' ? 'Revisar exclusão' : 'Revisar alteração'
  openIntegrationDialog('spaceship-change-dialog')
}
$('spaceship-add-record').addEventListener('click', () => openDnsChange('create'))
$('spaceship-change-form').addEventListener('submit', event => {
  event.preventDefault()
  const operation = spaceshipDnsOperation
  if (!operation || !spaceshipLastQuery) return
  const f = event.currentTarget.elements
  const record = { type: f.type.value, name: f.name.value.trim().toLowerCase(), value: f.value.value.trim(), ttl: Number(f.ttl.value) }
  if (!dnsEditableName(record.name)) { notice('Nome protegido. Gerencie diretamente na Spaceship.', true); return }
  if (operation.action !== 'create' &&
      (record.type !== operation.previous.type || record.name !== operation.previous.name || record.value !== operation.previous.value)) return
  if (operation.action === 'update_ttl' && record.ttl === operation.previous.ttl) { notice('Informe um TTL diferente.', true); return }
  spaceshipDnsPending = { domain: spaceshipLastQuery.domain, command: { action: operation.action, record,
    ...(operation.previous ? { previous: operation.previous } : {}) } }
  const actionName = { create: 'ADICIONAR', update_ttl: 'EDITAR TTL', delete: 'EXCLUIR' }[operation.action]
  $('spaceship-change-summary').textContent = `${actionName} DNS\nDomínio: ${spaceshipDnsPending.domain}\nTipo: ${record.type}\nNome: ${record.name}\nValor: ${record.value}\nTTL: ${record.ttl}s` +
    (operation.previous ? `\nTTL anterior: ${operation.previous.ttl}s` : '')
  $('spaceship-confirm-form').reset()
  openIntegrationDialog('spaceship-confirm-dialog')
})
$('spaceship-confirm-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (!spaceshipDnsPending) return
  const form = event.currentTarget
  const button = $('spaceship-confirm-apply')
  button.disabled = true
  try {
    const payload = { ...spaceshipDnsPending, password: form.elements.password.value }
    const result = await api('/api/integrations/spaceship/dns/change', 'POST', payload)
    closeIntegrationDialog('spaceship-confirm-dialog')
    closeIntegrationDialog('spaceship-change-dialog')
    form.reset()
    spaceshipDnsPending = null
    notice(result.message)
    // Consulta novamente o estado real, sem pressupor propagação imediata.
    $('spaceship-dns-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  } catch (error) { $('spaceship-query-status').textContent = `Alteração não confirmada: ${error.message}. Consulte antes de repetir.`; notice(error.message, true) }
  finally { button.disabled = false; form.elements.password.value = '' }
})
