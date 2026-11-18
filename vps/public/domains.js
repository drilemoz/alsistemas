'use strict'
let dnDomains = [], dnZone = null, dnSkip = 0, dnNext = null, dnPane = ''
let dnCatalogRequest = 0, dnPaneRequest = 0, dnRecords = [], dnVisible = 30, dnDnsComplete = false
let dnOldPointer = null, dnEditRule = null, dnTestRule = null
const dnFqdn = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const dnLocalNames = new Set(['www','painel','panel','admin','api','mail','smtp','imap','pop','autodiscover','migrar'])
const dnApi = (domain, section) => '/api/domains/' + encodeURIComponent(domain) + '/' + section
const dnWhen = (id, message, bad = false) => { const el = $(id); el.textContent = message; el.classList.toggle('bad', bad) }
const dnActive = (zone, pane) => currentAppRoute === 'domains' && dnZone?.name === zone && (!pane || dnPane === pane)
function dnButton(text, use, css = 'outline button-small') {
  const button = node('button', text, css)
  button.type = 'button'
  button.addEventListener('click', use)
  return button
}
function resetDomainsPage() {
  dnCatalogRequest++
  dnPaneRequest++
  dnDomains = []
  dnRecords = []
  dnZone = null
  dnSkip = 0
  dnNext = null
  dnPane = ''
  $('dn-selected').hidden = true
  $('dn-select').replaceChildren(new Option('Selecione um domínio', ''))
  $('dn-select').disabled = true
  $('dn-pagination').hidden = true
  $('dn-refresh').disabled = false
}
function dnDescribeNs(ns) {
  return ns?.provider === 'basic' ? 'DNS da Spaceship' : ns?.provider === 'custom' ? 'DNS personalizado' : 'DNS não informado'
}
function dnHideForms() {
  $('dn-redirect-form').hidden = true
  $('dn-probe-form').hidden = true
  dnEditRule = null
  dnTestRule = null
}
function dnSelect(name, keepPane = false) {
  const zone = dnDomains.find(item => item.name === name)
  dnZone = zone || null
  dnPaneRequest++
  $('dn-selected').hidden = !zone
  dnHideForms()
  if (!zone) return
  $('dn-select').value = name
  $('dn-name').textContent = zone.unicodeName || name
  $('dn-ns-summary').textContent = dnDescribeNs(zone.nameservers)
  $('dn-lifecycle').textContent = ({
    registered:'Registrado', expired:'Expirado', redemption:'Em recuperação', pendingDelete:'Exclusão pendente', pending:'Pendente'
  })[zone.lifecycleStatus] || 'Status não informado'
  $('dn-expiry').textContent = zone.expirationDate ? new Date(zone.expirationDate).toLocaleDateString('pt-BR', { timeZone:'UTC' }) : 'Não informado'
  $('dn-renew').textContent = zone.autoRenew === true ? 'Ativa' : zone.autoRenew === false ? 'Desativada' : 'Não informada'
  $('dn-settings-result').textContent = ''
  dnResetPointer()
  dnFillSettings()
  dnShowPane(keepPane ? dnPane : '')
}
async function openDomainsPage(skip = dnSkip, name = dnZone?.name, keepPane = true) {
  const activeRequest = ++dnCatalogRequest
  const select = $('dn-select')
  const refresh = $('dn-refresh')
  const first = dnDomains.length === 0
  refresh.disabled = true
  if (first) select.disabled = true
  $('dn-integration').hidden = true
  dnWhen('dn-list-status', 'Consultando sua conta Spaceship…')
  try {
    const data = await api('/api/domains?skip=' + skip, 'GET', undefined, {timeoutMs:12000})
    if (activeRequest !== dnCatalogRequest || currentAppRoute !== 'domains') return
    dnDomains = data.items
    dnSkip = data.skip
    dnNext = data.next
    select.replaceChildren(new Option('Selecione um domínio', ''), ...dnDomains.map(item => new Option(item.unicodeName || item.name, item.name)))
    select.disabled = !dnDomains.length
    $('dn-pagination').hidden = dnSkip === 0 && dnNext === null
    $('dn-prev').disabled = dnSkip === 0
    $('dn-next').disabled = dnNext === null
    $('dn-page-number').textContent = data.total > 0 ? `${dnSkip + 1}–${Math.min(dnSkip + 25,data.total)} de ${data.total}` : ''
    $('dn-list-status').textContent = data.total ? (data.total === 1 ? '1 domínio na conta' : data.total + ' domínios na conta') : 'Nenhum domínio retornado.'
    const selected = dnDomains.find(item => item.name === name) || (dnDomains.length === 1 ? dnDomains[0] : null)
    dnSelect(selected?.name, keepPane)
  } catch (error) {
    if (activeRequest !== dnCatalogRequest || currentAppRoute !== 'domains') return
    $('dn-integration').hidden = false
    dnWhen('dn-list-status', error.message + (first ? ' A lista precisa de domains:read.' : ' Os dados exibidos são da última consulta.'), true)
  } finally { if (activeRequest === dnCatalogRequest) refresh.disabled = false }
}
function dnShowPane(pane) {
  dnPane = pane
  dnPaneRequest++
  for (const button of document.querySelectorAll('[data-domain-pane]')) {
    const active = button.dataset.domainPane === pane
    button.setAttribute('aria-pressed', String(active))
    $('dn-pane-' + button.dataset.domainPane).hidden = !active
  }
  if (!dnZone) return
  if (pane === 'dns') void dnLoadDns()
  if (pane === 'redirect') void dnLoadRedirects()
  if (pane === 'settings') dnFillSettings()
}
$('dn-select').addEventListener('change', e => dnSelect(e.target.value))
$('dn-refresh').addEventListener('click', () => void openDomainsPage())
$('dn-prev').addEventListener('click', () => void openDomainsPage(Math.max(0,dnSkip - 25),null,false))
$('dn-next').addEventListener('click', () => { if (dnNext !== null) void openDomainsPage(dnNext,null,false) })
for (const nav of document.querySelectorAll('[data-domain-pane]')) nav.addEventListener('click', () => {
  dnHideForms()
  if (nav.dataset.domainPane === 'pointer') dnResetPointer()
  dnShowPane(nav.dataset.domainPane)
})

function dnDnsValue(record) {
  const value = record.address ?? record.cname ?? record.value ?? record.exchange ?? record.target ?? record.host
  return typeof value === 'string' ? value.slice(0, 512) : 'Valor não exibido'
}
function dnRenderDns() {
  const panel = $('dn-records')
  const rows = dnRecords.slice(0,dnVisible).map(record => {
    const row = node('div','','domain-record')
    const type = String(record.type || '?').toUpperCase()
    const emblem = node('span','','dns-record-emblem domain-record-emblem')
    emblem.append(dnsSvg(dnsIconForType(type)))
    const content = node('div')
    content.append(node('strong', type + ' · ' + String(record.name || '?'), 'break-text'),
      node('span', dnDnsValue(record), 'small muted break-text'),
      node('span', 'TTL ' + (record.ttl ?? '—') + ' s', 'small muted'))
    row.append(emblem, content)
    const name = String(record.name || '').toLowerCase()
    if (dnDnsComplete && ['A','CNAME'].includes(record.type) && record.group?.type === 'custom' && dnZone.nameservers?.provider === 'basic' &&
      name !== '@' && !name.split('.').some(part => dnLocalNames.has(part)) && dnFqdn.test(name + '.' + dnZone.name)) {
      row.append(dnButton('Trocar destino', () => {
        dnResetPointer()
        dnOldPointer = { ttl:record.ttl, value:dnDnsValue(record) }
        const fields = $('dn-pointer-form').elements
        fields.namedItem('name').value = name
        fields.namedItem('name').readOnly = true
        fields.namedItem('type').value = record.type
        fields.namedItem('type').disabled = true
        fields.namedItem('ttl').value = record.ttl
        $('dn-pointer-title').textContent = 'Trocar destino'
        $('dn-pointer-current').textContent = 'Destino atual: ' + dnOldPointer.value
        dnPointerType()
        dnShowPane('pointer')
        fields.namedItem('value').focus()
      }))
    }
    return row
  })
  panel.replaceChildren(...rows)
  $('dn-more-dns').hidden = dnVisible >= dnRecords.length
}
async function dnLoadDns() {
  const zone = dnZone.name
  const request = ++dnPaneRequest
  $('dn-records').replaceChildren()
  $('dn-more-dns').hidden = true
  dnWhen('dn-dns-status','Consultando zona na Spaceship…')
  if (dnZone.nameservers?.provider === 'custom') {
    dnWhen('dn-dns-status','O domínio usa servidores DNS personalizados. Consulte a zona no provedor ativo.')
    return
  }
  try {
    const {records} = await api(dnApi(zone,'dns'), 'GET', undefined, {timeoutMs:12000})
    if (request !== dnPaneRequest || !dnActive(zone,'dns')) return
    dnVisible = 30
    dnRecords = records.items
    dnDnsComplete = records.total === records.items.length
    dnRenderDns()
    dnWhen('dn-dns-status', records.total > records.items.length
      ? records.items.length + ' de ' + records.total + ' registros. Troca de destino requer a zona inteira.'
      : records.total ? records.total + ' registro(s) na zona Spaceship.' : 'Nenhum registro nesta zona.')
  } catch (error) { if (request === dnPaneRequest && dnActive(zone,'dns')) dnWhen('dn-dns-status',error.message,true) }
}
$('dn-more-dns').addEventListener('click', () => { dnVisible += 30; dnRenderDns() })
function dnPointerType() {
  const fields = $('dn-pointer-form').elements
  fields.namedItem('value').placeholder = fields.namedItem('type').value === 'A' ? 'IPv4, sem https://' : 'Hostname, sem https:// nem caminho'
}
function dnResetPointer() {
  const form = $('dn-pointer-form')
  form.reset()
  dnOldPointer = null
  form.elements.namedItem('name').readOnly = false
  form.elements.namedItem('type').disabled = false
  form.querySelector('[type=submit]').disabled = dnZone?.nameservers?.provider !== 'basic'
  $('dn-pointer-title').textContent = 'Apontar subdomínio'
  $('dn-pointer-current').textContent = dnZone?.nameservers?.provider !== 'basic'
    ? 'Edição não disponível. O DNS Spaceship não foi confirmado como provedor.' : (dnZone ? 'Zona: ' + dnZone.name : '')
  dnWhen('dn-pointer-result','')
  dnPointerType()
}
$('dn-pointer-form').elements.namedItem('type').addEventListener('change', dnPointerType)
$('dn-pointer-reset').addEventListener('click', dnResetPointer)
$('dn-pointer-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget, domain = dnZone?.name, fields = form.elements
  if (!domain || dnZone.nameservers?.provider !== 'basic') return
  const data = { name:fields.namedItem('name').value.trim().toLowerCase(), type:fields.namedItem('type').value,
    ttl:Number(fields.namedItem('ttl').value), value:fields.namedItem('value').value.trim(), previous:dnOldPointer }
  const label = data.previous ? 'Trocar destino' : 'Criar apontamento'
  if (!await confirmAction(`${data.type} ${data.name}.${domain}\n${data.previous?.value || 'Sem registro anterior'} → ${data.value}\nTTL: ${data.ttl} s.` +
      (data.previous && data.type === 'CNAME' ? '\nA troca pode ter uma breve interrupção.' : ''),label) || !dnActive(domain,'pointer')) return
  const submit = form.querySelector('[type=submit]')
  submit.disabled = true
  dnWhen('dn-pointer-result','Aplicando na Spaceship…')
  try {
    const result = await api(dnApi(domain,'pointer'),'POST',data,{timeoutMs:70000})
    if (!dnActive(domain,'pointer')) return
    dnResetPointer()
    dnWhen('dn-pointer-result',result.verified ? 'Novo destino conferido na Spaceship. Aguarde a propagação.' : 'Apontamento aceito. Aguarde a propagação do DNS.')
  } catch (error) { if (dnActive(domain,'pointer')) dnWhen('dn-pointer-result',error.message,true) }
  finally { if (dnActive(domain,'pointer')) submit.disabled = false }
})

async function dnLoadRedirects({ quiet = false } = {}) {
  const zone = dnZone.name, request = ++dnPaneRequest
  if (!quiet) dnWhen('dn-redirect-status','Consultando regras da VPS…')
  $('dn-redirect-list').replaceChildren()
  try {
    const rows = (await api(dnApi(zone,'redirects'),'GET',undefined,{timeoutMs:12000})).items
    if (!dnActive(zone,'redirect') || request !== dnPaneRequest) return
    for (const row of rows) {
      const card = node('div','','domain-rule')
      const title = node('div','','domain-rule-title')
      title.append(node('strong', row.host,'break-text'), node('span', row.enabled ? 'Ativa' : 'Desativada', 'pill'))
      const summary = node('p', row.destination + (row.preserve ? ' + caminho e parâmetros' : ''), 'small muted break-text')
      const actions = node('div','','domain-rule-actions')
      actions.append(dnButton('Editar', () => dnOpenRule(row)), dnButton('Testar', () => dnOpenTest(row)), dnButton('Excluir', () => void dnDeleteRule(zone,row)))
      card.append(title,summary,node('span', `${row.code} · ${row.https ? 'HTTPS configurado' : 'Somente HTTP'}`,'small muted'),actions)
      $('dn-redirect-list').append(card)
    }
    if (!quiet) dnWhen('dn-redirect-status',rows.length ? '' : 'Nenhuma regra criada para este domínio.')
  } catch (error) { if (dnActive(zone,'redirect') && request === dnPaneRequest) dnWhen('dn-redirect-status',error.message,true) }
}
function dnOpenRule(rule = null) {
  dnHideForms()
  dnEditRule = rule
  const form = $('dn-redirect-form'), f = form.elements
  form.reset()
  form.hidden = false
  $('dn-rule-title').textContent = rule ? 'Editar regra' : 'Nova regra'
  f.namedItem('source').readOnly = !!rule
  if (rule) {
    f.namedItem('source').value = rule.host.slice(0,-(dnZone.name.length + 1))
    f.namedItem('url').value = rule.destination
    f.namedItem('code').value = rule.code
    f.namedItem('preserve').checked = rule.preserve
    f.namedItem('enabled').checked = rule.enabled
    f.namedItem('https').checked = rule.https
  }
  f.namedItem(rule ? 'url' : 'source').focus()
}
function dnOpenTest(row) {
  dnHideForms()
  dnTestRule = row
  const form = $('dn-probe-form')
  form.hidden = false
  $('dn-probe-title').textContent = 'Testar ' + row.host
  $('dn-probe-result').replaceChildren()
  form.elements.namedItem('ip').focus()
}
async function dnDeleteRule(zone, row) {
  if (!await confirmAction('Excluir a regra de ' + row.host + '? O DNS e o certificado não serão removidos.','Excluir regra') || !dnActive(zone,'redirect')) return
  await dnWriteRule(zone,'DELETE',{ host:row.host, revision:row.revision })
}
async function dnWriteRule(zone, method, request) {
  dnWhen('dn-redirect-status','Validando e recarregando o Nginx…')
  try {
    await api(dnApi(zone,'redirects'),method,request,{timeoutMs:70000})
    if (!dnActive(zone,'redirect')) return
    dnHideForms()
    dnWhen('dn-redirect-status',method === 'DELETE' ? 'Regra excluída da VPS.' : 'Configuração aplicada na VPS. Teste o DNS e a resposta.')
    await dnLoadRedirects({ quiet:true })
  } catch (error) { if (dnActive(zone,'redirect')) dnWhen('dn-redirect-status',error.message,true) }
}
$('dn-new-redirect').addEventListener('click', () => dnOpenRule())
$('dn-rule-cancel').addEventListener('click',dnHideForms)
$('dn-probe-close').addEventListener('click',dnHideForms)
$('dn-redirect-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget, f = form.elements, zone = dnZone?.name
  if (!zone) return
  const host = f.namedItem('source').value.trim().toLowerCase() + '.' + zone
  const preserve = f.namedItem('preserve').checked
  let destination
  try {
    const url = new URL(f.namedItem('url').value)
    if (!['http:','https:'].includes(url.protocol) || url.port || url.username || url.password || url.hash ||
      !dnFqdn.test(url.hostname) || url.hostname === host || (preserve && url.search)) throw new Error()
    const path = preserve ? url.pathname.replace(/\/+$/,'') : url.pathname
    destination = (url.origin + path + url.search).replace(/[\$'\[\]{};\\|^]/g,ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
  } catch { dnWhen('dn-redirect-status','Use uma URL HTTP/HTTPS pública, sem porta, senha ou fragmento. Ao preservar o caminho, não inclua parâmetros no destino.',true); return }
  const revision = dnEditRule?.revision ?? null
  const rule = { destination, code:Number(f.namedItem('code').value), preserve, enabled:f.namedItem('enabled').checked, https:f.namedItem('https').checked }
  const message = `${host} → ${destination}\nHTTP ${rule.code}${preserve ? ' · preserva caminho e parâmetros' : ''}\n${rule.enabled ? 'Ativa' : 'Desativada'} · ${rule.https ? 'HTTP e HTTPS' : 'Somente HTTP'}. O DNS não muda.`
  if (!await confirmAction(message,'Aplicar regra') || !dnActive(zone,'redirect')) return
  const submit = form.querySelector('[type=submit]')
  submit.disabled = true
  try { await dnWriteRule(zone,'POST',{ host, revision, rule }) } finally { submit.disabled = false }
})
$('dn-probe-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget, zone = dnZone?.name, rule = dnTestRule
  if (!rule || !zone) return
  const output = $('dn-probe-result')
  output.replaceChildren(node('p','Verificando DNS e os protocolos…','small muted'))
  const submit = form.querySelector('[type=submit]')
  submit.disabled = true
  try {
    const result = await api(dnApi(zone,'redirect-check'),'POST',{ host:rule.host, ip:form.elements.namedItem('ip').value.trim() },{timeoutMs:10000})
    if (!dnActive(zone,'redirect') || dnTestRule !== rule) return
    output.replaceChildren()
    const append = (label, value, good) => {
      const row = node('div','','domain-test-row')
      row.append(node('strong',label), node('span',value,good ? 'small good' : 'small muted break-text'))
      output.append(row)
    }
    append('DNS IPv4', result.dns.matching ? 'Aponta para o IPv4 informado.' : result.dns.addresses.join(', ') || 'Nenhum IPv4 confirmado.',result.dns.matching)
    if (result.dns.ipv6.length || result.dns.ipv6Unknown) append('DNS IPv6', result.dns.ipv6.length ? 'Há registros AAAA. A rota IPv6 não foi testada.' : 'Não foi possível verificar se há registros AAAA.',false)
    append('HTTPS', result.https?.tlsValid ? 'Certificado válido para a origem.' : result.https ? 'Certificado/conexão HTTPS não confirmados.' : 'Não testado.',result.https?.tlsValid)
    for (const [protocol,answer] of [['Redirecionamento HTTP',result.http],['Redirecionamento HTTPS',result.https]]) {
      append(protocol, answer?.matching ? `${answer.status} · destino confere` : answer?.status ? `${answer.status} · destino ou código divergente` : answer ? 'Sem resposta.' : 'Não testado.',answer?.matching)
    }
  } catch (error) { if (dnActive(zone,'redirect') && dnTestRule === rule) output.replaceChildren(node('p',error.message,'small bad')) }
  finally { submit.disabled = false }
})

function dnFillSettings() {
  const f = $('dn-ns-form').elements
  const ns = dnZone?.nameservers
  $('dn-renew-change').disabled = typeof dnZone?.autoRenew !== 'boolean'
  f.namedItem('provider').value = ns?.provider || 'basic'
  f.namedItem('hosts').value = ns?.hosts?.join('\n') || ''
  $('dn-ns-form').querySelector('[type=submit]').disabled = !ns
  $('dn-nameservers-current').textContent = 'Atual: ' + dnDescribeNs(ns) + (ns?.hosts?.length ? ' · ' + ns.hosts.join(', ') : '')
  dnNsProvider()
}
function dnNsProvider() {
  const f = $('dn-ns-form').elements, custom = f.namedItem('provider').value === 'custom'
  $('dn-ns-hosts-label').hidden = !custom
  f.namedItem('hosts').required = custom
}
$('dn-ns-form').elements.namedItem('provider').addEventListener('change',dnNsProvider)
async function dnChangeSettings(zone, change, message) {
  if (!await confirmAction(message,'Aplicar alteração') || !dnActive(zone,'settings')) return
  dnWhen('dn-settings-result','Salvando na Spaceship…')
  try {
    const result = await api(dnApi(zone,'settings'),'POST',change,{timeoutMs:23000})
    if (!dnActive(zone,'settings')) return
    await openDomainsPage(dnSkip,zone,true)
    if (dnActive(zone,'settings')) dnWhen('dn-settings-result',result.verified
      ? 'Alteração confirmada pela Spaceship.' : 'Solicitação aceita. Confira o estado antes de repetir.')
  } catch (error) { if (dnActive(zone,'settings')) dnWhen('dn-settings-result',error.message,true) }
}
$('dn-renew-change').addEventListener('click', () => {
  if (typeof dnZone?.autoRenew !== 'boolean') return
  const previous = dnZone.autoRenew, zone = dnZone.name
  void dnChangeSettings(zone,{ action:'autorenew', previous, value:!previous }, `${previous ? 'Desativar' : 'Ativar'} a renovação automática de ${zone}?` +
    (previous ? ' O domínio fica sujeito ao vencimento se não for renovado.' : ' A Spaceship pode cobrar no próximo ciclo.'))
})
$('dn-ns-form').addEventListener('submit', event => {
  event.preventDefault()
  if (!dnZone?.nameservers) return
  const f = event.currentTarget.elements, provider = f.namedItem('provider').value, zone = dnZone.name
  const hosts = provider === 'basic' ? [] : f.namedItem('hosts').value.split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase().replace(/\.$/,''))
  if (provider === 'custom' && (hosts.length < 2 || hosts.length > 12 || new Set(hosts).size !== hosts.length || hosts.some(h=>!dnFqdn.test(h)))) {
    dnWhen('dn-settings-result','Informe de 2 a 12 hostnames válidos e distintos.',true)
    return
  }
  const previous = dnZone.nameservers, value = { provider, hosts }
  const summary = `${zone}\nAtual: ${dnDescribeNs(previous)} ${previous.hosts.join(', ')}\nNovo: ${dnDescribeNs(value)} ${hosts.join(', ')}\nEssa mudança pode afetar site e e-mail. Os registros não são copiados.`
  void dnChangeSettings(zone,{ action:'nameservers', previous, value },summary)
})
