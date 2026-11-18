'use strict'
const hpForm = $('create')
let hpZones = [], hpNext = null, hpZoneRequest = 0, hpHintRequest = 0, hpWizard = 0
let hpName = '', hpStatus = null, hpTimer = null, hpRequest = 0
let hpUploading = false, hpCreating = false, hpView = 'wizard', hpPublishScroll = 0
let hpPlan = null, hpFile = null, hpRelease = null, hpProject = null, hpBusyDns = false, hpRetrying = false
const hpDialog = $('project-dialog')
const hpSuggested = 'Crie o projeto e publique os arquivos nesta mesma janela.'
const hpApi = (name, section = '') => '/api/projects/' + encodeURIComponent(name) + '/hosting' + section
const hpNote = (text, bad = false) => dnWhen('task-note', text, bad)
const hpFields = hpForm.elements
const hpSlug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'').replace(/^[^a-z]+/,'').slice(0,40)
function hpAddress() {
  const mode = hpFields.mode.value
  return mode === 'subdomain' ? (hpFields.subdomain.value.trim().toLowerCase() && hpFields.zone.value
    ? hpFields.subdomain.value.trim().toLowerCase() + '.' + hpFields.zone.value : '')
    : mode === 'existing' ? hpFields.existing.value.trim().toLowerCase() : ''
}
function hpPreview() {
  const mode = hpFields.mode.value, host = hpAddress()
  $('hosting-subfields').hidden = mode !== 'subdomain'
  $('hosting-more-zones').hidden = mode !== 'subdomain' || hpNext === null
  $('hosting-existing').hidden = mode !== 'existing'
  $('hosting-ip-field').hidden = mode === 'none'
  $('hosting-ip-note').hidden = mode === 'none' || !$('hosting-ip-note').textContent
  hpFields.publicIp.required = mode !== 'none'
  hpFields.subdomain.required = hpFields.zone.required = mode === 'subdomain'
  hpFields.existing.required = mode === 'existing'
  $('hosting-preview').hidden = !host
  $('hosting-preview-host').textContent = host || ''
}
async function hpSuggest() {
  if (hpFields.mode.value === 'none') return
  const request = ++hpHintRequest
  const current = hpAddress()
  const zone = hpFields.mode.value === 'subdomain' ? hpFields.zone.value : (hpZones.find(item=>item.name === current)?.name || '')
  try {
    const hint = await api('/api/hosting/ipv4' + (zone ? '?zone=' + encodeURIComponent(zone) : ''))
    if (request !== hpHintRequest || !hpDialog.open) return
    if (hint.ip && (!hpFields.publicIp.value || hpFields.publicIp.dataset.suggestion === 'yes')) {
      hpFields.publicIp.value = hint.ip
      hpFields.publicIp.dataset.suggestion = 'yes'
      $('hosting-ip-note').textContent = hint.source === 'config' ? 'IPv4 configurado na VPS. Confirme antes de criar.'
        : 'Sugerido pelo registro A do domínio principal. Confirme se é o IPv4 fixo da VPS.'
    } else if (!hint.ip && hpFields.publicIp.dataset.suggestion === 'yes') {
      hpFields.publicIp.value = ''
      $('hosting-ip-note').textContent = ''
    }
  } catch { /* permite preencher o IP confirmado manualmente */ }
  hpPreview()
}
async function hpLoadZones(skip = 0) {
  const request = ++hpZoneRequest
  const more = $('hosting-more-zones')
  more.disabled = true
  if (!skip) hpNote('Consultando os domínios da conta Spaceship…')
  try {
    const result = await api('/api/domains?skip=' + skip, 'GET', undefined, {timeoutMs:12000})
    if (request !== hpZoneRequest || !hpDialog.open) return
    hpZones = [...new Map([...hpZones,...result.items].map(item => [item.name,item])).values()]
    hpNext = result.next
    const current = hpFields.zone.value
    hpFields.zone.replaceChildren(new Option('Selecione',''),...hpZones.map(item=>new Option(item.unicodeName || item.name,item.name)))
    hpFields.zone.value = current || (hpZones.length === 1 ? hpZones[0].name : '')
    $('hosting-domain-hints').replaceChildren(...hpZones.map(item=>new Option(item.name,item.name)))
    hpNote(hpZones.length ? hpSuggested : 'Nenhum domínio na conta. Use um endereço existente ou crie sem domínio.')
  } catch (error) {
    if (request !== hpZoneRequest || !hpDialog.open) return
    hpNote('Não foi possível listar a Spaceship. ' + error.message,true)
  } finally {
    if (request === hpZoneRequest && hpDialog.open) {
      more.disabled = false
      hpPreview()
      void hpSuggest()
    }
  }
}
function resetManagedWizard() {
  hpForm.reset()
  hpPlan = null
  hpCreating = false
  hpUploading = false
  hpWizard++
  hpZoneRequest++
  hpHintRequest++
  hpZones = []
  hpNext = null
  hpFields.zone.replaceChildren(new Option('Selecione',''))
  $('hosting-domain-hints').replaceChildren()
  delete hpFields.name.dataset.edited
  delete hpFields.subdomain.dataset.edited
  delete hpFields.publicIp.dataset.suggestion
  $('hosting-ip-note').textContent = ''
  $('hosting-create-button').disabled = false
  hpNote(hpSuggested)
  hpPreview()
  hpSetView('wizard')
}
hpFields.displayName.addEventListener('input', () => {
  const slug = hpSlug(hpFields.displayName.value)
  if (!hpFields.name.dataset.edited) hpFields.name.value = slug
  if (!hpFields.subdomain.dataset.edited) hpFields.subdomain.value = slug
  hpPreview()
})
for (const input of [hpFields.name,hpFields.subdomain]) input.addEventListener('input',() => {
  input.dataset.edited = 'yes'
  hpPreview()
})
hpFields.existing.addEventListener('input',hpPreview)
hpFields.existing.addEventListener('change',() => void hpSuggest())
hpFields.publicIp.addEventListener('input',() => {
  delete hpFields.publicIp.dataset.suggestion
  hpHintRequest++
  $('hosting-ip-note').textContent = ''
  hpPreview()
})
hpFields.mode.addEventListener('change',() => {
  hpHintRequest++
  hpPreview()
  if (hpFields.mode.value === 'none') return hpNote(hpSuggested)
  if (!hpZones.length) void hpLoadZones()
  else void hpSuggest()
})
hpFields.zone.addEventListener('change',() => { hpPreview(); void hpSuggest() })
$('hosting-more-zones').addEventListener('click',() => { if (hpNext !== null) void hpLoadZones(hpNext) })

function hpFeedback(id, title = '', style = '', detail = '') {
  const target = $(id)
  target.hidden = !title
  target.dataset.state = style
  target.replaceChildren()
  if (!title) return
  target.append(node('strong',title,'break-text'))
  if (detail) target.append(node('small',detail,'break-text'))
}
function hpSetView(view) {
  const detail = view === 'dns' || view === 'zip-help'
  hpView = view
  $('hosting-domain-details').hidden = view !== 'dns'
  $('hosting-zip-help').hidden = view !== 'zip-help'
  $('hosting-detail-back').hidden = !detail
  $(view === 'dns' ? 'hosting-domain-feedback-slot' : 'hosting-publish-feedback-slot').append($('hosting-status-feedback'))
  $('hosting-wizard').hidden = view !== 'wizard'
  if (view === 'wizard') $('hosting-more-zones').disabled = false
  $('hosting-review').hidden = view !== 'review'
  $('hosting-publish').hidden = view !== 'publish'
  $('hosting-review-back').hidden = view !== 'review'
  $('hosting-create-button').hidden = view !== 'wizard'
  $('hosting-create-confirm').hidden = view !== 'review'
  $('hosting-close').hidden = view === 'review' || detail
  $('hosting-close').textContent = view === 'publish' ? 'Fechar' : 'Cancelar'
  $('project-title').textContent = view === 'dns' ? 'DNS e HTTPS' : view === 'zip-help' ? 'Como preparar o ZIP' : view === 'publish' ? (hpProject?.displayName || hpName) : view === 'review' ? 'Revisar projeto' : 'Novo projeto'
  $('hosting-site').hidden = view !== 'publish' && view !== 'dns'
  $('hosting-scroll').scrollTop = 0
  hpControls()
  if (hpDialog.open) $('project-title').focus({preventScroll:true})
}
const hpInPublication = () => ['publish','dns','zip-help'].includes(hpView)
function hpOpenDetail(view) {
  if (hpView !== 'publish' || hpUploading) return
  hpPublishScroll = $('hosting-scroll').scrollTop
  hpSetView(view)
}
function hpBackToPublish() {
  const trigger = $(hpView === 'dns' ? 'hosting-domain-open' : 'hosting-zip-help-open')
  hpSetView('publish')
  $('hosting-scroll').scrollTop = hpPublishScroll
  if (!trigger.hidden) trigger.focus({preventScroll:true})
}
$('hosting-domain-open').addEventListener('click', () => hpOpenDetail('dns'))
$('hosting-zip-help-open').addEventListener('click', () => hpOpenDetail('zip-help'))
$('hosting-detail-back').addEventListener('click', hpBackToPublish)
function hpControls() {
  const busy = hpCreating || hpUploading
  hpDialog.querySelector('.modal-x').disabled = busy
  $('hosting-close').disabled = busy
  $('hosting-review-back').disabled = busy
  $('hosting-create-confirm').disabled = busy
  $('hosting-create-confirm').textContent = hpCreating ? 'Criando…' : 'Criar projeto'
  const submit = $('hosting-upload-submit')
  submit.hidden = hpView !== 'publish' || (!hpFile && !hpUploading)
  submit.disabled = hpUploading
  submit.textContent = hpUploading ? 'Publicando…' : 'Publicar ZIP'
  $('hosting-selection').hidden = !hpFile
  $('hosting-file').disabled = hpUploading
  $('hosting-open-upload').disabled = hpUploading
  $('hosting-clear-file').disabled = hpUploading
  $('hosting-domain-open').disabled = hpUploading
  $('hosting-zip-help-open').disabled = hpUploading
  $('hosting-open-upload').querySelector('span').textContent = hpFile ? 'Trocar ZIP' : hpRelease ? 'Publicar outro ZIP' : 'Adicionar ZIP'
  const link = $('hosting-open-site')
  const {plan,dns,tls,enabled} = hpStatus || {}
  const hasSite = hpView === 'publish' && !!hpRelease && !!plan?.domain && dns?.state === 'confirmed' && enabled !== false
  let url
  if (hasSite && dnFqdn.test(plan.domain)) {
    url = new URL((tls?.state === 'active' ? 'https://' : 'http://') + plan.domain)
    const version = Date.parse(hpRelease.publishedAt)
    if (Number.isFinite(version)) url.searchParams.set('v',String(version))
  }
  link.hidden = !url || !!hpFile || hpUploading
  if (url) link.href = url.href
  else link.removeAttribute('href')
  link.textContent = tls?.state === 'active' ? 'Ver site' : 'Ver site via HTTP'
}
hpDialog.addEventListener('cancel',event => {
  if (hpCreating || hpUploading) event.preventDefault()
  else if (hpView === 'review') { event.preventDefault(); hpSetView('wizard') }
  else if (hpView === 'dns' || hpView === 'zip-help') { event.preventDefault(); hpBackToPublish() }
})
hpDialog.addEventListener('close',() => {
  if (hpDialog.open) return
  hpWizard++
  hpRequest++
  hpZoneRequest++
  hpHintRequest++
  clearTimeout(hpTimer)
  hpFile = null
  hpPlan = null
  hpCreating = hpUploading = false
})

function hpReviewRow(label,value) {
  const row = node('div','','hosting-review-row')
  row.append(node('dt',label,'muted'),node('dd',value,'break-text'))
  return row
}
hpForm.addEventListener('submit',event => {
  event.preventDefault()
  if (hpView !== 'wizard' || !hpDialog.open) return
  const formValue = Object.fromEntries(new FormData(hpForm))
  const {displayName,name,type,mode} = formValue
  const host = mode === 'none' ? '' : hpAddress()
  if (!displayName.trim()) { hpNote('Informe um nome de exibição.',true); return }
  if (mode === 'subdomain' && (!host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(formValue.subdomain.trim().toLowerCase()))) {
    hpNote('Informe um único nome de subdomínio, sem pontos.',true)
    return
  }
  const zone = mode === 'subdomain' ? formValue.zone : ''
  const publicIp = mode === 'none' ? '' : formValue.publicIp.trim()
  hpZoneRequest++
  hpHintRequest++
  hpPlan = {displayName:displayName.trim(),name,type,mode,host,zone,publicIp}
  $('hosting-review-data').replaceChildren(
    hpReviewRow('Projeto',hpPlan.displayName),hpReviewRow('Pasta','/var/www/projetos/' + name),hpReviewRow('Tipo',type === 'php' ? 'PHP 8.3' : 'Estático'),
    hpReviewRow('Endereço',host || 'Sem domínio'),...(publicIp ? [hpReviewRow('IPv4 da VPS',publicIp)] : []))
  $('hosting-review-note').textContent = mode === 'subdomain' ? 'O painel tentará criar apenas o registro A deste subdomínio na Spaceship.'
    : mode === 'existing' ? 'O DNS existente não será alterado.' : ''
  hpFeedback('hosting-create-feedback')
  hpSetView('review')
})
$('hosting-review-back').addEventListener('click',() => {
  if (!hpCreating) { hpSetView('wizard'); hpPreview() }
})
$('hosting-create-confirm').addEventListener('click',async () => {
  if (!hpDialog.open || hpView !== 'review' || !hpPlan || hpCreating) return
  const session = hpWizard
  const plan = hpPlan
  hpCreating = true
  hpControls()
  hpFeedback('hosting-create-feedback','Preparando o projeto…','working')
  try {
    const result = await api('/api/hosting/projects','POST',plan,{timeoutMs:85000})
    if (session !== hpWizard || !hpDialog.open) return
    hpCreating = false
    navigateApp('project/' + result.name, { keepPopup:'project-dialog' })
    openManagedHosting({name:result.name,displayName:result.displayName || plan.displayName,domain:result.domain})
    void loadProjectCatalog({force:true})
  } catch (error) {
    if (session === hpWizard && hpDialog.open)
      hpFeedback('hosting-create-feedback','Não foi possível criar o projeto','failed',error.message)
  } finally {
    if (session === hpWizard && hpDialog.open) { hpCreating = false; hpControls() }
  }
})
function hpShort(state, fallback = 'Pendente') {
  return {ok:'Publicado',confirmed:'Confirmado',active:'Ativo',working:'Em andamento',failed:'Atenção',pending:'Pendente',manual:'Manual',skipped:'Não se aplica'}[state] || fallback
}
function hpSummary(label,state) {
  const tile = node('div','','hosting-status-tile')
  const ok = ['ok','active','confirmed'].includes(state)
  tile.append(node('small',label,'muted'),node('strong',hpShort(state),ok ? 'good' : state === 'failed' ? 'bad' : ''))
  return tile
}
function hpFileCount(count) {
  return count + (count === 1 ? ' arquivo publicado' : ' arquivos publicados')
}
function hpPaintStatus() {
  const {plan,dns,tls,working,enabled} = hpStatus || {}
  const domain = plan?.domain || hpProject?.domain || ''
  $('hosting-site').textContent = domain || 'Sem endereço público'
  $('hosting-stages').replaceChildren(hpSummary('Arquivos',hpRelease ? 'ok' : 'pending'),
    hpSummary('DNS',dns?.state || (!domain ? 'skipped' : undefined)),
    hpSummary('HTTPS',tls?.state || (!domain ? 'skipped' : undefined)))
  const connection = $('hosting-connection')
  connection.textContent = !domain ? 'Projeto sem domínio. Os arquivos ficam salvos na VPS.'
    : enabled === false ? 'Site desativado no Nginx.'
    : hpRelease && dns?.state !== 'confirmed' ? 'O ZIP foi publicado. O endereço ficará disponível quando o DNS for confirmado.'
    : hpRelease && tls?.state !== 'active' ? 'HTTPS ainda não está pronto. Se o endereço estiver disponível, você pode abrir por HTTP.'
    : ''
  connection.hidden = !connection.textContent
  const timestamp = Date.parse(hpRelease?.publishedAt)
  $('hosting-release-info').textContent = hpRelease ? hpFileCount(hpRelease.files) +
    (Number.isFinite(timestamp) ? ' · ' + new Date(timestamp).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '')
    : 'Nenhum ZIP publicado ainda.'
  $('hosting-domain-open').hidden = !domain
  $('hosting-domain-info').replaceChildren()
  if (domain) {
    const rows = [
      ['DNS',dns?.state === 'manual' ? dns.message + (plan?.publicIp ? ' ' + domain + ' → ' + plan.publicIp : '') : dns?.message],
      ['HTTPS',tls?.message]
    ]
    if (rows.every(row => !row[1])) $('hosting-domain-info').append(node('small','Aguardando a consulta do projeto.','muted'))
    for (const [label,message] of rows) if (message) $('hosting-domain-info').append(node('p',label + ' · ' + message,'small muted break-text'))
  }
  $('hosting-dns').disabled = !plan?.domain || hpBusyDns
  const retry = $('hosting-retry')
  retry.hidden = !!(dns?.state === 'confirmed' && tls?.state === 'active')
  retry.disabled = !plan?.domain || !!working || enabled === false || hpRetrying
  hpControls()
}
async function hpRefresh() {
  const request = ++hpRequest
  const name = hpName
  clearTimeout(hpTimer)
  try {
    const result = await api(hpApi(name))
    if (request !== hpRequest || !hpDialog.open || !hpInPublication()) return
    hpStatus = result
    if (result.release && (!hpRelease || Date.parse(result.release.publishedAt) >= Date.parse(hpRelease.publishedAt))) hpRelease = result.release
    hpFeedback('hosting-status-feedback')
    hpPaintStatus()
    if (result.working) hpTimer = setTimeout(hpRefresh,3500)
  } catch (error) {
    if (request !== hpRequest || !hpDialog.open || !hpInPublication()) return
    hpFeedback('hosting-status-feedback','Não foi possível consultar o site','failed',error.message)
    if (hpStatus?.working) hpTimer = setTimeout(hpRefresh,6500)
  }
}
function openManagedHosting(project) {
  hpWizard++
  hpRequest++
  clearTimeout(hpTimer)
  hpName = project.name
  hpProject = project
  hpStatus = null
  hpFile = null
  hpRelease = project.release || null
  hpUploading = hpBusyDns = hpRetrying = false
  $('hosting-file').value = ''
  $('hosting-file-name').textContent = ''
  $('hosting-file-note').textContent = 'Até 32 MiB.'
  $('hosting-upload-progress').hidden = true
  hpPublishScroll = 0
  $('hosting-retry-review').hidden = true
  $('hosting-dns-results').hidden = true
  $('hosting-dns-results').replaceChildren()
  hpFeedback('hosting-upload-result')
  hpFeedback('hosting-status-feedback')
  hpSetView('publish')
  hpPaintStatus()
  if (!hpDialog.open) hpDialog.showModal()
  void hpRefresh()
}
$('hosting-retry').addEventListener('click',() => {
  if (!hpStatus?.plan?.domain || hpRetrying) return
  $('hosting-retry-note').textContent = hpStatus.plan.mode === 'subdomain'
    ? 'O painel vai conferir o registro A de ' + hpStatus.plan.domain + ' e tentar o HTTPS novamente. Outros registros não mudam.'
    : 'O painel vai verificar o endereço e tentar o HTTPS novamente. Não vai alterar o DNS.'
  $('hosting-retry-review').hidden = false
  $('hosting-retry-confirm').focus()
})
$('hosting-retry-cancel').addEventListener('click',() => { $('hosting-retry-review').hidden = true; $('hosting-retry').focus() })
$('hosting-retry-confirm').addEventListener('click',async () => {
  if (hpRetrying || !hpStatus?.plan?.domain) return
  const session = hpWizard
  hpRetrying = true
  $('hosting-retry-review').hidden = true
  hpPaintStatus()
  try { await api(hpApi(hpName,'/retry'),'POST',{}); if (session === hpWizard && hpDialog.open) void hpRefresh() }
  catch (error) {
    if (session === hpWizard && hpDialog.open) hpFeedback('hosting-status-feedback','Não foi possível retomar','failed',error.message)
  } finally {
    if (session === hpWizard && hpDialog.open) { hpRetrying = false; hpPaintStatus() }
  }
})
function hpDnsRow(source, expected) {
  const row = node('div','','hosting-dns-row')
  const actual = Array.isArray(source.values) ? source.values : []
  const match = expected.length > 0 && actual.length === expected.length && expected.every(value=>actual.includes(value))
  const info = node('span')
  info.append(node('strong',source.label,'break-text'))
  if (actual.length) info.append(node('small',actual.join(' · ') + (Number.isInteger(source.ttl) ? ' · TTL ' + source.ttl + ' s' : ''),'muted break-text'))
  const label = source.state === 'answered' ? (match ? 'Confirmado' : expected.length ? 'Diferente' : 'Respondido')
    : ({not_found:'Não encontrado',empty:'Sem registro',unavailable:'Sem resposta'})[source.state] || 'Sem resposta'
  row.append(info,node('small',label,'pill ' + (match ? 'good' : 'muted')))
  return row
}
$('hosting-dns').addEventListener('click',async () => {
  if (hpBusyDns || !hpStatus?.plan?.domain) return
  const session = hpWizard
  const target = $('hosting-dns-results')
  target.hidden = false
  target.replaceChildren(node('small','Consultando DNS público…','muted'))
  hpBusyDns = true
  hpPaintStatus()
  try {
    const result = await api(hpApi(hpName,'/dns'),'GET',undefined,{timeoutMs:24000})
    if (session !== hpWizard || !hpDialog.open) return
    target.replaceChildren(node('strong','Resultado · DNS ' + result.type),
      ...result.sources.map(source=>hpDnsRow(source,result.expected || [])),
      node('small','Consulta de ' + new Date(result.checkedAt).toLocaleString('pt-BR') + '. Amostra dos resolvedores consultados.','muted'))
  } catch (error) {
    if (session === hpWizard && hpDialog.open) target.replaceChildren(node('p',error.message,'small bad break-text'))
  } finally {
    if (session === hpWizard && hpDialog.open) { hpBusyDns = false; hpPaintStatus() }
  }
})
function hpChooseFile(file) {
  if (hpUploading || !file) return
  hpFile = null
  $('hosting-upload-progress').hidden = true
  if (!/\.zip$/i.test(file.name) || file.size < 22 || file.size > 32*1024*1024) {
    $('hosting-file-note').textContent = 'Até 32 MiB.'
    hpFeedback('hosting-upload-result','Arquivo não selecionado','failed','Escolha um ZIP válido de até 32 MiB.')
    hpControls()
    return
  }
  hpFile = file
  $('hosting-file-name').textContent = file.name
  $('hosting-file-size').textContent = projectReadableSize(file.size)
  $('hosting-file-note').textContent = 'Ao publicar, os arquivos em public/ serão substituídos. A versão anterior fica guardada.'
  hpFeedback('hosting-upload-result')
  hpControls()
}
$('hosting-open-upload').addEventListener('click',() => { if (!hpUploading) $('hosting-file').click() })
$('hosting-file').addEventListener('change',event => {
  hpChooseFile(event.currentTarget.files[0])
  event.currentTarget.value = ''
})
$('hosting-clear-file').addEventListener('click',() => {
  hpFile = null
  $('hosting-file-note').textContent = 'Até 32 MiB.'
  hpFeedback('hosting-upload-result')
  hpControls()
  $('hosting-open-upload').focus()
})
function hpUpload(name,file,progress,valid) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST',hpApi(name,'/upload'))
    xhr.timeout = 125000
    xhr.setRequestHeader('Content-Type','application/zip')
    xhr.setRequestHeader('X-CSRF-Token',csrf)
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && valid() && !progress.hidden && progress.hasAttribute('value'))
        progress.value = Math.min(100,Math.round(100*event.loaded/event.total))
    }
    xhr.upload.onload = () => {
      if (!valid()) return
      progress.removeAttribute('value')
      hpFeedback('hosting-upload-result','Validando e publicando na VPS…','working')
    }
    xhr.onerror = () => reject(new Error('Conexão interrompida. Confira o status antes de reenviar.'))
    xhr.ontimeout = () => reject(new Error('O envio excedeu o tempo limite. Confira o status antes de reenviar.'))
    xhr.onload = () => {
      let response = {}
      try { response = JSON.parse(xhr.responseText) } catch { /* erro HTTP fora do painel */ }
      if (xhr.status >= 200 && xhr.status < 300 && response.ok && Number.isInteger(response.files)) resolve(response)
      else reject(new Error(response.error || 'Upload não concluído (HTTP ' + xhr.status + ').'))
    }
    xhr.send(file)
  })
}
$('hosting-upload-submit').addEventListener('click',async () => {
  if (hpUploading || !hpFile || hpView !== 'publish' || !hpDialog.open) return
  const session = hpWizard
  const name = hpName
  const file = hpFile
  const progress = $('hosting-upload-progress')
  const valid = () => session === hpWizard && hpDialog.open && hpView === 'publish'
  hpUploading = true
  hpControls()
  $('hosting-scroll').scrollTop = 0
  progress.value = 0
  progress.hidden = false
  hpFeedback('hosting-upload-result','Enviando ZIP…','working')
  try {
    const result = await hpUpload(name,file,progress,valid)
    projectOverviewCache.delete(name)
    void loadProjectCatalog({force:true})
    if (!valid()) return
    hpRelease = {files:result.files,publishedAt:result.publishedAt || new Date().toISOString()}
    hpFile = null
    $('hosting-file-note').textContent = 'Até 32 MiB. A versão anterior é guardada a cada publicação.'
    hpFeedback('hosting-upload-result','Publicação concluída','success',hpFileCount(result.files) + '.')
  } catch (error) {
    if (valid()) hpFeedback('hosting-upload-result','Não foi possível publicar','failed',error.message)
  } finally {
    if (valid()) {
      progress.hidden = true
      hpUploading = false
      hpPaintStatus()
      void hpRefresh()
    }
  }
})
