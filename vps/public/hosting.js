'use strict'
const hpForm = $('create')
let hpZones = [], hpNext = null, hpZoneRequest = 0, hpHintRequest = 0, hpWizard = 0
let hpName = '', hpStatus = null, hpTimer = null, hpRequest = 0
let hpUploading = false
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
    if (request !== hpHintRequest || !$('project-dialog').open) return
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
    if (request !== hpZoneRequest || !$('project-dialog').open) return
    hpZones = [...new Map([...hpZones,...result.items].map(item => [item.name,item])).values()]
    hpNext = result.next
    const current = hpFields.zone.value
    hpFields.zone.replaceChildren(new Option('Selecione',''),...hpZones.map(item=>new Option(item.unicodeName || item.name,item.name)))
    hpFields.zone.value = current || (hpZones.length === 1 ? hpZones[0].name : '')
    $('hosting-domain-hints').replaceChildren(...hpZones.map(item=>new Option(item.name,item.name)))
    hpNote(hpZones.length ? 'Você poderá enviar os arquivos depois de criar o projeto.' : 'Nenhum domínio na conta. Use um endereço existente ou crie sem domínio.')
  } catch (error) {
    if (request !== hpZoneRequest || !$('project-dialog').open) return
    hpNote('Não foi possível listar a Spaceship. ' + error.message,true)
  } finally {
    if (request === hpZoneRequest && $('project-dialog').open) {
      more.disabled = false
      hpPreview()
      void hpSuggest()
    }
  }
}
function resetManagedWizard() {
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
  hpNote('Você poderá enviar os arquivos depois de criar o projeto.')
  hpPreview()
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
  if (hpFields.mode.value === 'none') return hpNote('Você poderá enviar os arquivos depois de criar o projeto.')
  if (!hpZones.length) void hpLoadZones()
  else void hpSuggest()
})
hpFields.zone.addEventListener('change',() => { hpPreview(); void hpSuggest() })
$('hosting-more-zones').addEventListener('click',() => { if (hpNext !== null) void hpLoadZones(hpNext) })

async function submitManagedHosting(form) {
  const create = $('hosting-create-button')
  if (create.disabled) return null
  const wizard = hpWizard
  const formValue = Object.fromEntries(new FormData(form))
  const { displayName, name, type, mode } = formValue
  const host = mode === 'none' ? '' : hpAddress()
  if (mode === 'subdomain' && (!host || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(formValue.subdomain.trim().toLowerCase()))) {
    hpNote('Informe um único nome de subdomínio, sem pontos.',true)
    return null
  }
  const zone = mode === 'subdomain' ? formValue.zone : ''
  const publicIp = mode === 'none' ? '' : formValue.publicIp.trim()
  const explain = mode === 'subdomain' ? '\nRegistro A na zona ' + zone + ' → ' + publicIp + ' (somente se o DNS for da Spaceship).'
    : mode === 'existing' ? '\nO DNS existente não será alterado. IPv4 esperado: ' + publicIp : ''
  create.disabled = true
  try {
    if (!await confirmAction(displayName.trim() + '\nPasta: /var/www/projetos/' + name + (host ? '\nEndereço: ' + host : '\nSem domínio') + explain,'Criar projeto') || wizard !== hpWizard || !$('project-dialog').open) return null
    hpNote('Preparando pasta e configuração do projeto…')
    const result = await api('/api/hosting/projects','POST',{displayName,name,type,mode,host,zone,publicIp},{timeoutMs:85000})
    return wizard === hpWizard && $('project-dialog').open ? result : null
  } catch (error) {
    if (wizard === hpWizard && $('project-dialog').open) hpNote(error.message,true)
    return null
  } finally { if (wizard === hpWizard) create.disabled = false }
}
function hpStage(label, state, message) {
  const row = node('div','','hosting-stage')
  const caption = node('div','','hosting-stage-caption')
  const ok = ['ok','confirmed','active'].includes(state)
  const bad = state === 'failed'
  const title = {ok:'Pronto',confirmed:'Confirmado',active:'Configurado',working:'Em andamento',failed:'Verificar',pending:'Pendente',manual:'Manual',skipped:'Não se aplica'}[state] || 'Pendente'
  caption.append(node('strong',label),node('small',title,'pill ' + (ok ? 'good' : bad ? 'bad' : 'muted')))
  row.append(caption)
  if (message) row.append(node('small',message,'muted break-text'))
  return row
}
async function hpRefresh() {
  const request = ++hpRequest
  const name = hpName
  clearTimeout(hpTimer)
  try {
    const result = await api(hpApi(name))
    if (request !== hpRequest || !$('managed-hosting-dialog').open) return
    hpStatus = result
    const {plan,dns,tls,release,working,enabled} = result
    $('hosting-site').textContent = plan?.domain || 'Sem endereço público'
    $('hosting-stages').replaceChildren(
      hpStage('Pasta','ok',plan ? '/var/www/projetos/' + plan.name : ''),
      hpStage('DNS',dns?.state,dns?.state === 'manual' ? dns.message + ' ' + plan.domain + ' → ' + plan.publicIp : dns?.message),
      hpStage('HTTPS',tls?.state,tls?.message),
      hpStage('Arquivos',release ? 'ok' : 'pending',release
        ? release.files + ' arquivos publicados · ' + new Date(release.publishedAt).toLocaleString('pt-BR')
        : 'Nenhum ZIP publicado.')
    )
    const url = $('hosting-open-site')
    url.hidden = !plan?.domain || dns?.state !== 'confirmed' || enabled === false
    if (!url.hidden) url.href = (tls?.state === 'active' ? 'https://' : 'http://') + plan.domain
    $('hosting-dns').disabled = !plan?.domain
    $('hosting-retry').disabled = !plan?.domain || !!working || enabled === false
    if (working) hpTimer = setTimeout(hpRefresh,3500)
  } catch (error) {
    if (request === hpRequest && $('managed-hosting-dialog').open)
      $('hosting-stages').replaceChildren(hpStage('Consulta indisponível','failed',error.message))
  }
}
function openManagedHosting(project) {
  hpName = project.name
  hpStatus = null
  $('managed-hosting-dialog-title').textContent = 'Publicação · ' + (project.displayName || project.name)
  $('hosting-site').textContent = project.domain || ''
  $('hosting-stages').textContent = 'Consultando publicação…'
  $('hosting-dns').disabled = $('hosting-retry').disabled = true
  $('hosting-open-site').hidden = true
  if (!$('managed-hosting-dialog').open) $('managed-hosting-dialog').showModal()
  void hpRefresh()
}
$('managed-hosting-dialog').addEventListener('close', () => { hpRequest++; clearTimeout(hpTimer) })
$('hosting-retry').addEventListener('click',async () => {
  const name = hpName
  if (hpStatus?.plan?.mode === 'subdomain' && !await confirmAction('Conferir ou recriar apenas o registro A de ' + hpStatus.plan.domain + ' e retomar HTTPS? Nenhum registro existente será substituído.','Retomar publicação')) return
  if (name !== hpName || !$('managed-hosting-dialog').open) return
  $('hosting-retry').disabled = true
  try { await api(hpApi(name,'/retry'),'POST',{}); void hpRefresh() }
  catch (error) {
    $('hosting-stages').append(hpStage('Não foi possível retomar','failed',error.message))
    $('hosting-retry').disabled = false
  }
})
$('hosting-dns').addEventListener('click',() => void openDnsResult(hpApi(hpName,'/dns'),hpStatus?.plan?.domain))
$('hosting-open-upload').addEventListener('click',() => {
  if (hpUploading) return
  $('hosting-upload').reset()
  dnWhen('hosting-upload-result','')
  $('hosting-upload-progress').hidden = true
  $('hosting-upload-submit').disabled = false
  $('managed-upload-dialog').showModal()
})
function hpUpload(name,file) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST',hpApi(name,'/upload'))
    xhr.timeout = 125000
    xhr.setRequestHeader('Content-Type','application/zip')
    xhr.setRequestHeader('X-CSRF-Token',csrf)
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) $('hosting-upload-progress').value = Math.round(100*event.loaded/event.total)
    }
    xhr.upload.onload = () => dnWhen('hosting-upload-result','Validando e publicando o ZIP na VPS…')
    xhr.onerror = () => reject(new Error('Conexão interrompida. Confira a publicação antes de enviar novamente.'))
    xhr.ontimeout = () => reject(new Error('O envio excedeu o tempo limite. Confira a publicação.'))
    xhr.onload = () => {
      let response = {}
      try { response = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && response.ok) resolve(response)
      else reject(new Error(response.error || 'Upload não concluído (HTTP ' + xhr.status + ').'))
    }
    xhr.send(file)
  })
}
$('hosting-upload').addEventListener('submit',async event => {
  event.preventDefault()
  if (hpUploading) return
  const file = event.currentTarget.elements.archive.files[0]
  if (!file || !/\.zip$/i.test(file.name) || file.size < 22 || file.size > 32*1024*1024) return dnWhen('hosting-upload-result','Selecione um ZIP válido de até 32 MiB.',true)
  const name = hpName, button = $('hosting-upload-submit')
  hpUploading = true
  button.disabled = true
  try {
    if (!await confirmAction('Publicar ' + file.name + ' em ' + name + '? Isso substitui apenas public/. A versão anterior será guardada.','Publicar ZIP')) return
    const progress = $('hosting-upload-progress')
    progress.value = 0
    progress.hidden = false
    dnWhen('hosting-upload-result','Enviando arquivo…')
    const result = await hpUpload(name,file)
    dnWhen('hosting-upload-result',result.files + ' arquivos publicados.')
    projectOverviewCache.delete(name)
    void loadProjectCatalog({force:true})
    if (hpName === name && $('managed-hosting-dialog').open) void hpRefresh()
  } catch (error) { dnWhen('hosting-upload-result',error.message,true) }
  finally {
    hpUploading = false
    button.disabled = false
  }
})
