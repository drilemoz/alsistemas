'use strict'
const spaceshipForm = $('spaceship-form')
const spaceshipDomain = $('spaceship-domain')
let spaceshipConfigured = false
function spaceshipHelp(open) {
  const dialog = $('spaceship-help-dialog')
  if (open && !dialog.open) dialog.showModal()
  else if (!open && dialog.open) dialog.close()
}
for (const id of ['spaceship-help', 'spaceship-help-inline']) $(id).addEventListener('click', () => spaceshipHelp(true))
for (const id of ['spaceship-help-close', 'spaceship-help-done']) $(id).addEventListener('click', () => spaceshipHelp(false))
$('spaceship-show').addEventListener('change', event => {
  for (const name of ['apiKey', 'apiSecret']) spaceshipForm.elements[name].type = event.target.checked ? 'text' : 'password'
})
async function refreshIntegrations() {
  const status = await api('/api/integrations')
  spaceshipConfigured = !!status.spaceship.configured
  $('spaceship-status').textContent = spaceshipConfigured ? '● Configurada · conexão ainda não verificada nesta sessão' : '○ Não configurada'
  $('spaceship-remove').disabled = !spaceshipConfigured
  $('spaceship-dns').disabled = !spaceshipConfigured
}
spaceshipForm.addEventListener('submit', async event => {
  event.preventDefault()
  const submit = spaceshipForm.querySelector('[type=submit]')
  submit.disabled = true
  try {
    await api('/api/integrations/spaceship', 'POST', { apiKey: spaceshipForm.elements.apiKey.value, apiSecret: spaceshipForm.elements.apiSecret.value })
    spaceshipForm.reset()
    for (const name of ['apiKey','apiSecret']) spaceshipForm.elements[name].type = 'password'
    await refreshIntegrations()
    $('spaceship-query-status').textContent = 'Credenciais salvas. Teste com um domínio para confirmar o acesso.'
    notice('Credenciais armazenadas. Faça uma consulta DNS para validar.')
  } catch (error) { notice(error.message, true) }
  finally { submit.disabled = false }
})
$('spaceship-remove').addEventListener('click', async () => {
  if (!await confirmAction('Remover as credenciais da Spaceship deste servidor?', 'Remover')) return
  try {
    await api('/api/integrations/spaceship', 'DELETE')
    await refreshIntegrations()
    $('spaceship-results').replaceChildren()
    $('spaceship-query-status').textContent = ''
    notice('Integração removida.')
  } catch (error) { notice(error.message, true) }
})
function renderDns(payload) {
  const container = $('spaceship-results')
  container.replaceChildren()
  const records = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.records) ? payload.records : []
  if (!records.length) {
    const empty = document.createElement('p')
    empty.className = 'small muted'
    empty.textContent = 'Nenhum registro retornado. Verifique o domínio e as permissões da API.'
    container.append(empty)
    return 0
  }
  for (const record of records.slice(0, 200)) {
    const card = document.createElement('div')
    card.className = 'dns-record'
    const title = document.createElement('strong')
    title.textContent = String(record.type ?? 'Registro')
    const host = document.createElement('span')
    host.textContent = String(record.name ?? record.host ?? '@')
    const detail = document.createElement('div')
    const value = document.createElement('code')
    value.textContent = typeof record.value === 'string' ? record.value : JSON.stringify(record.value ?? record.data ?? record)
    detail.append(value)
    card.append(title, host, detail)
    container.append(card)
  }
  return records.length
}
$('spaceship-dns').addEventListener('click', async () => {
  const domain = spaceshipDomain.value.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    $('spaceship-query-status').textContent = 'Informe um domínio válido, como iguatama.online.'
    return
  }
  const button = $('spaceship-dns')
  button.disabled = true
  $('spaceship-query-status').textContent = 'Consultando a Spaceship...'
  $('spaceship-results').replaceChildren()
  try {
    const result = await api(`/api/integrations/spaceship/dns?domain=${encodeURIComponent(domain)}`)
    const count = renderDns(result.records)
    $('spaceship-query-status').textContent = `Conexão autorizada. ${count} registro(s) retornado(s).`
    $('spaceship-status').textContent = '● Configurada · conexão validada nesta sessão'
  } catch (error) {
    $('spaceship-query-status').textContent = `Falha na consulta: ${error.message}`
  } finally { button.disabled = !spaceshipConfigured }
})
