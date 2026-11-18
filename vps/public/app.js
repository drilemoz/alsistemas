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
  const dialog = $('confirm-dialog')
  if (dialog.open) return Promise.resolve(false)
  $('confirm-detail').textContent = detail
  $('confirm-accept').textContent = label
  // Só a submissão do botão explícito aprova. Fechar encerra como cancelado.
  dialog.returnValue = ''
  return new Promise(resolve => {
    const form = dialog.querySelector('form')
    const finish = approved => {
      form.removeEventListener('submit', submitChoice)
      dialog.removeEventListener('close', closed)
      resolve(approved)
    }
    const closed = () => finish(false)
    const submitChoice = event => {
      event.preventDefault()
      const approved = event.submitter === $('confirm-accept')
      finish(approved)
      dialog.close()
    }
    form.addEventListener('submit', submitChoice)
    dialog.addEventListener('close', closed, { once: true })
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
function metric(title, value, icon, usage=null, foot='') {
  const card = node('div', '', 'stat host-metric')
  const label = node('div', '', 'stat-label')
  label.append(iconGraphic(icon), node('span', title))
  card.append(label, node('strong', value))
  if (Number.isFinite(usage)) {
    const bar=node('progress','','host-meter')
    bar.max=100;bar.value=Math.max(0,Math.min(100,usage))
    bar.setAttribute('aria-label',title+' utilizado')
    if (usage>=90) bar.classList.add('high')
    card.append(bar)
  } else card.append(node('span','','host-meter-placeholder'))
  if (foot) card.append(node('small',foot,'muted break-text'))
  $('metrics').append(card)
}
const hostPercent = (available,total) => Number.isFinite(available) && Number.isFinite(total) && total>0 ? Math.round(100*(total-available)/total) : null
const hostShortDate = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : 'Indisponível'
const hostTimeOnly = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Não informado'
let hostSample=null, hostSiteSample=null, hostReboot=null, hostRequest=0, hostPoll, hostPollId=0, hostSending=false
const hostUptime = value => {
  if (!Number.isFinite(value) || value < 0) return null
  const parts = [Math.floor(value/86400), Math.floor(value%86400/3600), Math.floor(value%3600/60)]
  return parts.map((n,i)=>n ? n+['d','h','min'][i] : '').filter(Boolean).join(' ') || 'menos de 1 min'
}
const hostBytePair = (available,total) => Number.isFinite(available) && Number.isFinite(total)
  ? bytes(available)+' / '+bytes(total) : 'Indisponível'
function renderMetrics(m) {
  hostSample=m
  const {ram,disk,swap}=m
  const uptime=hostUptime(m.uptimeSeconds)
  $('metrics').replaceChildren()
  $('overview-host').textContent=m.hostname||'VM Linux'
  $('overview-uptime').textContent=uptime?'Ligada há '+uptime:'Tempo ligado indisponível'
  $('overview-sample-time').textContent='Leitura local · '+hostTimeOnly(m.timestamp)
  metric('CPU',Number.isFinite(m.cpuPercent)?m.cpuPercent+'%':'Sem amostra','cpu',m.cpuPercent,Number.isFinite(m.cpuCount)?m.cpuCount+' vCPU':'')
  metric(ram.source==='free'?'RAM livre':'RAM disponível',hostBytePair(ram.available,ram.total),'memory',hostPercent(ram.available,ram.total))
  metric('Disco livre',hostBytePair(disk.free,disk.total),'disk',hostPercent(disk.free,disk.total))
  metric('Swap livre',swap.total===0?'Sem swap':hostBytePair(swap.free,swap.total),'updates',hostPercent(swap.free,swap.total))
  const details=[]
  const put=(key,value)=>{
    const item=node('div','','host-system-row')
    item.append(node('span',key,'small muted'),node('strong',String(value),'small break-text'))
    details.push(item)
  }
  put('Host',m.hostname||'Indisponível')
  if(m.system?.kernel) put('Kernel Linux',m.system.kernel)
  if(m.bootedAt) put('Último boot',hostShortDate(m.bootedAt))
  put('Em execução',uptime||'Indisponível')
  if(Array.isArray(m.loadAverage)) put('Carga média · 1 / 5 / 15 min',m.loadAverage.map(value=>Number(value).toFixed(2)).join(' / '))
  if(m.system?.interfacesAvailable===false) put('Rede','Interfaces indisponíveis nesta leitura')
  else for(const item of m.system?.interfaces||[]) put(item.name+' · '+item.family,item.address)
  $('overview-details-status').hidden=true
  $('overview-system-info').replaceChildren(...details)
  $('overview-services').replaceChildren()
  for (const [name,status] of Object.entries(m.services||{})) serviceCard($('overview-services'),name,status)
  renderHostAlerts()
}
function renderHostAlerts() {
  if(!hostSample) return
  const m=hostSample, alerts=[]
  if(m.ram.source!=='free' && m.ram.total>0 && Number.isFinite(m.ram.available) && m.ram.available/m.ram.total<.12) alerts.push('Pouca RAM disponível')
  if(m.disk.total>0 && Number.isFinite(m.disk.free) && m.disk.free/m.disk.total<.1) alerts.push('Pouco espaço disponível no disco')
  if(m.system?.rebootRequired) alerts.push('O Linux sinalizou reinício pendente')
  const inactive=Object.entries(m.services||{}).filter(([name,state])=>state!=='active' &&
    (name==='nginx' || name==='alsistemas-vps' || !['inactive/unknown','unknown'].includes(state)))
  if(inactive.length) alerts.push('Verificar '+inactive.map(([name])=>serviceVisuals[name]?.label||name).join(', '))
  for(const task of m.maintenance?.busy||[]) alerts.push(task+' em andamento')
  for(const site of hostSiteSample?.sites||[]) {
    if((site.https && !site.https.certificate?.valid) || (site.https?.status>=500 || !site.https && site.http && (!site.http.status || site.http.status>=500)))
      alerts.push('Verificar '+site.name)
    else if(site.https?.certificate?.expiresAt && Date.parse(site.https.certificate.expiresAt)-Date.now()<14*86400000)
      alerts.push('Certificado perto do vencimento em '+site.name)
  }
  const banner=$('overview-alerts')
  banner.hidden=!alerts.length
  banner.classList.toggle('needs-attention',!!alerts.length)
  if (!alerts.length) {
    banner.replaceChildren(node('strong',hostSiteSample?'Sem alertas nas verificações locais':'Sem alertas do servidor'))
    return
  }
  const list=node('ul')
  for (const message of alerts.slice(0,7)) list.append(node('li',message,'break-text'))
  banner.replaceChildren(node('strong','Pontos de atenção'),list)
}
function hostProbeLabel(probe) {
  if (!probe?.status) return 'Sem resposta'
  if(probe.status===405) return '405 · HEAD recusado'
  if(probe.status>=300 && probe.status<400) return probe.status+' · Redireciona'
  return String(probe.status)
}
function renderHostSites(data) {
  hostSiteSample=data
  const out=$('overview-sites')
  const checked=data.sites.length
  const local='Teste local · '+hostTimeOnly(data.checkedAt)
  $('overview-sites-meta').textContent=checked ? local+(data.total>checked?' · '+checked+' de '+data.total:'') : 'Nenhum site detectado no Nginx.'
  $('overview-sites-dialog-meta').textContent=checked ? local+'. Não verifica DNS público ou acesso pela internet.' : 'Nenhum site com configuração local identificada.'
  const counts={responding:0,restricted:0,attention:0}
  for (const site of data.sites) {
    const best=site.https||site.http
    if (!best?.status || (site.https && !best.certificate?.valid) || best.status>=500) counts.attention++
    else if ([401,403].includes(best.status)) counts.restricted++
    else if (best.status>=200 && best.status<400) counts.responding++
    else counts.attention++
  }
  $('overview-site-counts').replaceChildren(
    ...(counts.responding ? [node('span',counts.responding+' com resposta 2xx/3xx','pill good')] : []),
    ...(counts.restricted ? [node('span',counts.restricted+' com acesso restrito','pill muted')] : []),
    ...(counts.attention ? [node('span',counts.attention+' para verificar','pill bad')] : []))
  out.replaceChildren(...data.sites.map(site=>{
    const row=node('article','','host-site')
    const main=node('div','','host-site-main')
    main.append(node('strong',site.name,'break-text'))
    const badges=node('div','','host-site-badges')
    for(const [label,value] of [['HTTP',site.http],['HTTPS',site.https]]) if(value) {
      const secure=label==='HTTPS'
      const good=value.status>=200 && value.status<400 && (!secure || value.certificate?.valid)
      const warning=!!value.status && secure && !value.certificate?.valid
      badges.append(node('span',label+' · '+hostProbeLabel(value)+(warning?' · TLS inválido':''),'pill '+(good?'good':warning||!value.status||value.status>=500?'bad':'muted')))
    }
    main.append(badges)
    const certificate=site.https?.certificate
    if(certificate?.expiresAt) main.append(node('small','Certificado vence em '+hostShortDate(certificate.expiresAt),'muted break-text'))
    else if(site.https) main.append(node('small','Certificado não verificado.','muted'))
    row.append(main)
    const route='project/'+site.project+'/runtime-logs'
    if(validAppRoute(route)) {
      const logs=node('button','Logs','outline button-small')
      logs.type='button';logs.setAttribute('aria-label','Logs de '+site.name)
      logs.addEventListener('click',()=>navigateApp(route));row.append(logs)
    }
    return row
  }))
  renderHostAlerts()
}
let ec2Request=0
const ec2Lifecycle={pending:'Iniciando',running:'Em execução','shutting-down':'Encerrando',terminated:'Encerrada',stopping:'Parando',stopped:'Parada'}
const ec2Health={ok:'Normal',impaired:'Falha detectada',initializing:'Inicializando','insufficient-data':'Dados insuficientes','not-applicable':'Não aplicável'}
async function loadHostEc2() {
  if (!csrf) return
  const request=++ec2Request, session=csrf
  const button=$('host-ec2-refresh'), status=$('host-ec2-status'), fields=$('host-ec2-fields')
  button.disabled=true
  status.textContent='Consultando a instância local…'
  fields.replaceChildren()
  const current=()=>request===ec2Request&&session===csrf
  try {
    const data=await api('/api/host/ec2','GET',undefined,{timeoutMs:14000})
    if(!current())return
    if(data.state!=='metadata_ok'||!data.identity) {
      status.textContent='Identidade EC2 indisponível. Verifique se esta VPS está na EC2 com IMDSv2 acessível.'
      return
    }
    const {identity,checks}=data
    const row=(label,value)=>{
      const item=node('div','','host-system-row')
      item.append(node('dt',label,'small muted'),node('dd',value || 'Indisponível','small break-text'))
      fields.append(item)
    }
    row('Tipo',identity.instanceType)
    row('Região',identity.region)
    row('Zona',identity.zone)
    row('ID da instância',identity.instanceId)
    row('IPv4 privado',identity.privateIp)
    row('IPv4 público',identity.publicIp || (identity.publicIpState==='not_assigned'?'Não atribuído':null))
    if(identity.launchedAt)row('Lançamento da instância',hostShortDate(identity.launchedAt))
    if(checks?.state==='ok') {
      row('Estado na AWS',ec2Lifecycle[checks.instanceState])
      row('Verificação do sistema',ec2Health[checks.system])
      row('Verificação da instância',ec2Health[checks.instance])
      if(checks.ebs)row('Verificação EBS',ec2Health[checks.ebs])
    }
    const note={cli_missing:'Metadados carregados. Para o status na AWS, instale a AWS CLI v2 e associe um perfil IAM de leitura.',
      role_missing:'Metadados carregados. Para o status na AWS, associe um perfil IAM de leitura à instância.',
      access_denied:'Metadados carregados. O perfil IAM não tem acesso à verificação de status.',
      not_reported:'Metadados carregados. A AWS ainda não retornou verificações desta instância.',
      unavailable:'Metadados carregados. O status na API da AWS está indisponível.'
    }[checks?.state]
    status.textContent=(note||'Dados da AWS carregados.')+' Consulta · '+hostShortDate(data.checkedAt)
  } catch(error) {
    if(current())status.textContent=error.httpStatus===401?'Entre novamente para consultar a AWS.':'Não foi possível consultar a AWS agora.'
  } finally {
    if(current())button.disabled=false
  }
}
$('host-ec2-refresh').addEventListener('click',()=>void loadHostEc2())
const hostRebootKey='als-host-reboot-v1'
const hostRebootDismissKey='als-host-reboot-dismiss-v1'
const hostRebootWindow=240_000
let hostTrack=null, hostRecheck=null, hostCountdownTimer
const hostAwaiting=state=>['sending','scheduled','dispatching','reconnecting'].includes(state)
function storedHostTrack() {
  try {
    const row=JSON.parse(localStorage.getItem(hostRebootKey)||'null')
    return row && Number.isFinite(row.deadline) && Date.now()<row.deadline+86400_000 &&
      (row.target===null || Number.isFinite(row.target)) && (row.requestedAt===null || Number.isFinite(Date.parse(row.requestedAt))) ? row : null
  } catch { return null }
}
function saveHostTrack(track) {
  hostTrack=track
  try {
    if (track) {
      const json=JSON.stringify(track)
      if(localStorage.getItem(hostRebootKey)!==json) localStorage.setItem(hostRebootKey,json)
    } else localStorage.removeItem(hostRebootKey)
  } catch {}
}
function hostNoticeDismissed(state) {
  try { return !!state?.requestedAt && localStorage.getItem(hostRebootDismissKey)===state.requestedAt } catch { return false }
}
function paintRebootClock() {
  const clock=$('host-reboot-countdown')
  const remaining=hostTrack?.target ? Math.max(0,Math.ceil((hostTrack.target-Date.now())/1000)) : 0
  clock.hidden=hostReboot?.state!=='scheduled'||remaining===0
  if (!clock.hidden) clock.textContent='00:'+String(Math.min(59,remaining)).padStart(2,'0')
  else if (hostReboot?.state==='scheduled' && hostTrack?.target) paintHostReboot({...hostReboot,state:'dispatching'})
}
function paintHostReboot(state) {
  hostReboot=state
  const phase=state?.state
  const pending=hostAwaiting(phase)
  const busy=hostSample?.maintenance?.busy||[]
  const banner=$('overview-reboot-status'), note=$('host-reboot-note')
  const visible=!!phase && phase!=='idle' && (pending||!hostNoticeDismissed(state))
  banner.hidden=!visible
  banner.classList.toggle('needs-attention',['blocked','unconfirmed','offline','auth'].includes(phase))
  if (visible) {
    const title={sending:'Confirmando o pedido',scheduled:'Reinício previsto em',dispatching:'Aguardando a VPS voltar',
      reconnecting:'Aguardando a VPS voltar',rebooted:'Novo boot confirmado',blocked:'Reinício não executado',
      unconfirmed:'Reinício não confirmado',offline:'Ainda sem resposta da VPS',auth:'Entre para confirmar o reinício'}[phase]
    const copy=state.message||({sending:'Ainda não foi possível confirmar o agendamento.',
      scheduled:'O painel e os sites podem ficar indisponíveis.',
      dispatching:'Verificando automaticamente. A última leitura foi mantida.',
      reconnecting:'Sem conexão no momento. Tentando confirmar o novo boot…',
      rebooted:'O identificador mudou e a VPS respondeu.',
      unconfirmed:'O painel respondeu, mas não confirmou um novo boot.',
      offline:'Confira o console da AWS ou o SSH. O pedido não será reenviado.'})[phase]||''
    if ($('host-reboot-label').textContent!==title) $('host-reboot-label').textContent=title||'Status do reinício'
    if ($('host-reboot-copy').textContent!==copy) $('host-reboot-copy').textContent=copy
  }
  const details=$('host-reboot-details')
  details.hidden=!visible||!['blocked','unconfirmed','offline','auth'].includes(phase)
  if (details.hidden) details.open=false
  else {
    const when=state.requestedAt||hostTrack?.requestedAt
    const at=when?'Pedido registrado em '+hostShortDate(when)+'. ':''
    $('host-reboot-details-copy').textContent=at+'Só um novo boot comprova que a VPS reiniciou. Nenhum pedido é reenviado automaticamente.'
  }
  $('host-reboot-recheck').hidden=!['unconfirmed','offline','reconnecting','auth'].includes(phase)
  $('host-reboot-dismiss').hidden=!visible||!['rebooted','blocked'].includes(phase)
  $('host-reboot-open').disabled=hostSending||pending||!state?.canCheckBoot||busy.length>0||phase==='offline'||phase==='auth'
  note.textContent=pending?'Há um reinício em acompanhamento.':busy.length?'Aguarde as tarefas em andamento.':
    !state?.canCheckBoot?'Não foi possível verificar o boot do Linux.':'O painel e os sites ficam indisponíveis durante o reinício.'
  clearTimeout(hostCountdownTimer)
  if(visible && phase==='scheduled' && hostTrack?.target) {
    paintRebootClock()
    if(!clockSettled())hostCountdownTimer=setTimeout(tickHostReboot,250)
  } else $('host-reboot-countdown').hidden=true
}
function clockSettled() {return hostReboot?.state!=='scheduled'||!hostTrack?.target}
function tickHostReboot() {
  paintRebootClock()
  if(!clockSettled())hostCountdownTimer=setTimeout(tickHostReboot,250)
}
function receiveHostReboot(state, {poll=false}={}) {
  if (!state || typeof state.state!=='string') return
  const {state:phase,requestedAt}=state
  if (hostTrack && (phase==='idle' || (hostTrack.prior && requestedAt===hostTrack.prior))) {
    if(!poll) return
    if(!hostTrack.requestedAt && Date.now()-hostTrack.sentAt<25_000) return
    paintHostReboot({...state,state:'unconfirmed',message:'O servidor não encontrou o registro deste pedido.'})
    saveHostTrack(null)
    return
  }
  if (hostTrack?.requestedAt && requestedAt && Date.parse(requestedAt)<Date.parse(hostTrack.requestedAt)) return
  if (['scheduled','dispatching'].includes(phase)) {
    if (requestedAt && hostTrack?.requestedAt!==requestedAt && Number.isFinite(Date.parse(requestedAt))) {
      const now=Date.now(), server=Date.parse(state.serverTime)
      const delta=Number.isFinite(server)?server-Date.now():0
      const scheduled=Date.parse(state.scheduledFor)-delta
      const deadline=Date.parse(state.deadlineAt)-delta
      saveHostTrack({requestedAt, sentAt:hostTrack?.sentAt||now,
        target:Number.isFinite(scheduled)?Math.min(now+8000,scheduled):null,
        deadline:Number.isFinite(deadline)?Math.min(now+hostRebootWindow,deadline):now+hostRebootWindow})
    }
    if(!hostTrack)saveHostTrack({requestedAt:null,sentAt:Date.now(),target:null,deadline:Date.now()+hostRebootWindow})
    const canCount=phase==='scheduled' && hostTrack.target>Date.now()
    paintHostReboot({...state,state:canCount?'scheduled':phase==='scheduled'&&!hostTrack.target?'sending':'dispatching'})
    followHostReboot()
    return
  }
  if(!poll && hostTrack && ['reconnecting','offline','auth'].includes(hostReboot?.state) && requestedAt!==hostTrack.requestedAt) return
  if(hostTrack && ['rebooted','blocked','unconfirmed'].includes(phase)) saveHostTrack(null)
  paintHostReboot(state)
}
function followHostReboot(immediate=false) {
  if (!csrf || hostRecheck) return hostRecheck
  if(hostPoll && !immediate)return
  clearTimeout(hostPoll)
  const session=csrf, id=hostPollId
  const current=()=>session===csrf&&id===hostPollId
  async function check() {
    hostPoll=null
    if(!current())return
    $('host-reboot-recheck').disabled=true
    const work=api('/api/host/reboot','GET',undefined,{timeoutMs:4500})
    hostRecheck=work
    try {
      const next=await work
      if(!current())return
      receiveHostReboot(next,{poll:true})
      if(!hostTrack && next.state==='rebooted' && currentAppRoute==='overview') void loadDashboardOverview()
    } catch(error) {
      if(!current())return
      const ended=Date.now()>=(hostTrack?.deadline||0)
      if(error.httpStatus===401) paintHostReboot({state:'auth',message:'Sua sessão expirou. Reabra o painel e entre para retomar o acompanhamento.'})
      else if(ended)paintHostReboot({state:'offline'})
      else paintHostReboot({state:'reconnecting'})
    } finally {
      if(hostRecheck===work)hostRecheck=null
      if(current()){
        $('host-reboot-recheck').disabled=false
        if(hostTrack && hostAwaiting(hostReboot?.state) && Date.now()<hostTrack.deadline) followHostReboot()
      }
    }
  }
  if(immediate)return check()
  hostPoll=setTimeout(check,3200)
}
function resumeHostReboot() {
  hostTrack=storedHostTrack()
  if(hostTrack){
    const phase=Date.now()>=hostTrack.deadline?'offline':hostTrack.target>Date.now()?'scheduled':hostTrack.requestedAt?'dispatching':'sending'
    paintHostReboot({state:phase,requestedAt:hostTrack.requestedAt})
    void followHostReboot(true)
  } else if(currentAppRoute!=='overview') void followHostReboot(true)
}
$('host-reboot-recheck').addEventListener('click',()=>{
  if(hostReboot?.state==='auth')location.reload()
  else void followHostReboot(true)
})
$('host-reboot-dismiss').addEventListener('click',()=>{
  try { if(hostReboot?.requestedAt)localStorage.setItem(hostRebootDismissKey,hostReboot.requestedAt) } catch {}
  $('overview-reboot-status').hidden=true
})
window.addEventListener('storage',event=>{if(csrf&&event.key===hostRebootKey&&!hostSending)resumeHostReboot()})
window.addEventListener('online',()=>{if(csrf&&hostTrack)void followHostReboot(true)})
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&csrf&&hostTrack)void followHostReboot(true)})
// v2.0.20: projetos são páginas navegáveis. Nenhum dado sensível é colocado no endereço.
let knownProjects = new Map()
let projectCatalogLoaded = false
let projectCatalogError = ''
let projectCatalogRequest = null
let projectCatalogSession = 0
let projectTechRequest = 0
const projectOverviewCache = new Map()
const projectOverviewTtlMs = 30_000
const projectNumber = new Intl.NumberFormat('pt-BR')
let currentAppRoute = 'overview'
const mainTabs = new Set(['overview', 'projects', 'services', 'backups', 'updates', 'dependencies', 'integrations', 'domains', 'security', 'audit', 'help'])
const projectSections = new Set(['diagnostics', 'permissions', 'updates', 'backups', 'logs', 'progress'])
function appRouteFromUrl() {
  try { return decodeURIComponent(location.hash.replace(/^#/, '')) || 'overview' }
  catch { return 'overview' }
}
function validAppRoute(route) {
  if (mainTabs.has(route)) return true
  if (/^project\/(?!iguatama-teste(?:\/|$)|alsistemas(?:\/|$))(?![^/]*--)[a-z][a-z0-9-]{1,39}\/permissions$/.test(route)) return true
  if (/^project\/(?!iguatama-teste(?:\/|$)|alsistemas(?:\/|$))[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/(?:insights|activity|runtime-logs|backup-center)$/.test(route)) return true
  const found = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(aws)(?:\/([a-z]+))?)?$/.exec(route)
  return !!found && (!found[2] || (found[1] === 'iguatamaonline' && (!found[3] || projectSections.has(found[3]))))
}
function showAppRoute(route, { keepPopup = null } = {}) {
  if (!validAppRoute(route)) route = 'projects'
  if (currentAppRoute !== route) {
    for (const id of ['confirm-dialog', 'external-auth-dialog', 'project-tech-dialog']) {
      if ($(id).open) $(id).close()
    }
    closePanelPopups(keepPopup)
  }
  currentAppRoute = route
  const genericPermissions = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/permissions$/.exec(route)
  const genericInformation = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/(insights|activity|runtime-logs|backup-center)$/.exec(route)
  const matched = genericPermissions || genericInformation || /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(aws)(?:\/([a-z]+))?)?$/.exec(route)
  const page = genericPermissions ? 'project-permissions-general' : genericInformation ? 'project-' + genericInformation[2] : matched ? (!matched[2] ? 'project-detail' : matched[3] ? 'project-' + matched[3] : 'project-aws') : route
  for (const section of document.querySelectorAll('.tab-page')) section.classList.toggle('hidden', section.id !== `page-${page}`)
  const navTab = matched ? 'projects' : route
  if (page === 'overview') void loadDashboardOverview()
  if (page === 'services') void updateDiagnostics()
  if (page === 'backups') void updateBackups()
  if (page === 'audit') void loadAuditPage()
  if (page === 'projects' || page === 'project-detail') void loadProjectCatalog()
  for (const button of document.querySelectorAll('.side-nav [data-tab], .bottom-nav [data-tab], .more-links [data-tab]')) {
    const active = button.dataset.tab === navTab
    button.classList.toggle('active', active)
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  $('more-nav').classList.toggle('active', !!document.querySelector('.more-links [aria-current="page"]'))
  if ($('more-dialog').open) $('more-dialog').close()
  if (matched && page === 'project-detail') renderProjectPage(matched[1])
  if (genericPermissions) void loadGeneralPermissions(genericPermissions[1])
  if (genericInformation && genericInformation[2] === 'insights') void loadProjectInsights(genericInformation[1])
  if (genericInformation && genericInformation[2] === 'activity') void loadProjectActivity(genericInformation[1])
  if (genericInformation && genericInformation[2] === 'runtime-logs') void loadProjectRuntimeLogs(genericInformation[1])
  if (genericInformation && genericInformation[2] === 'backup-center') void loadProjectBackupCenter(genericInformation[1])
  if (matched && matched[1] === 'iguatamaonline') {
    if (!externalUploading && (page === 'project-aws' || page === 'project-updates' || page === 'project-progress')) void checkExternalStatus({ follow: true })
    if (page === 'project-diagnostics' || page === 'project-backups' || page === 'project-updates') void reloadExternalInspection()
    if (page === 'project-logs') void loadExternalReport()
  }
  if (route === 'updates') {
    void loadUpdateInfo().catch(e => notice(e.message, true))
    void refreshRelease()
  }
  paintRelease()
  if (route === 'dependencies') void refreshDependencies()
  if (route === 'domains') void openDomainsPage()
  if (route === 'integrations') refreshIntegrations().catch(e => notice(e.message, true))
  if (route === 'security') loadTrustedDevices().catch(e => notice(e.message, true))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
function navigateApp(route, { replace = false, keepPopup = null } = {}) {
  if (!validAppRoute(route)) route = 'projects'
  const url = '#' + encodeURI(route)
  if (replace) history.replaceState({ alRoute: route }, '', url)
  else if (location.hash !== url) history.pushState({ alRoute: route, fromRoute: currentAppRoute }, '', url)
  clearNotice()
  showAppRoute(route, { keepPopup })
}
window.addEventListener('popstate', () => showAppRoute(appRouteFromUrl()))
window.addEventListener('hashchange', () => { if (appRouteFromUrl() !== currentAppRoute) showAppRoute(appRouteFromUrl()) })
function projectBack(fallback, allowed = [fallback]) {
  if (allowed.includes(history.state?.fromRoute)) history.back()
  else navigateApp(fallback)
}
for (const button of document.querySelectorAll('[data-project-back]')) {
  button.addEventListener('click', () => {
    const fallback = button.dataset.projectBack
    const igu = 'project/iguatamaonline'
    projectBack(fallback, fallback === igu + '/aws' ? [igu, igu + '/aws', igu + '/insights', igu + '/activity', igu + '/backup-center'] : [fallback])
  })
}
for (const button of document.querySelectorAll('[data-project-route]')) button.addEventListener('click', () => navigateApp(button.dataset.projectRoute === 'permissions' ? 'project/iguatamaonline/permissions' : 'project/iguatamaonline/aws/' + button.dataset.projectRoute))
function projectTechnology(type) {
  return { php: 'PHP', node: 'Node.js', static: 'HTML / estático' }[type] || 'Não identificada'
}
function projectAccess(item) {
  if (item.protected) return 'Protegido'
  if (item.managed) return 'Gerenciado'
  return item.capabilities?.files || item.capabilities?.updates ? 'Acesso limitado' : 'Somente leitura'
}
function projectNginx(sites, managedState) {
  if (sites.some(site => site.enabled)) return 'Configuração habilitada'
  if (sites.length || managedState === false) return 'Configuração desabilitada'
  if (managedState === true) return 'Configuração habilitada'
  return 'Não identificado'
}
function projectTool(title, icon, path, detail = '') {
  const button = node('button', '', 'project-tool')
  button.type = 'button'
  const badge = node('span', '', 'project-tool-icon')
  badge.append(iconGraphic(icon))
  const label = node('span')
  label.append(node('strong', title))
  if (detail) label.append(node('small', detail))
  const arrow = node('span', '›')
  arrow.setAttribute('aria-hidden', 'true')
  button.append(badge, label, arrow)
  button.addEventListener('click', () => typeof path === 'function' ? path() : navigateApp(path))
  return button
}
function renderProjectPage(name) {
  const item = knownProjects.get(name)
  const actions = $('project-detail-actions')
  const status = $('project-detail-status')
  actions.replaceChildren()
  $('project-tech-open').disabled = !item
  $('project-detail-retry').hidden = !!item || !projectCatalogError
  $('project-management-panel').hidden = true
  $('project-detail-subtitle').textContent = ''
  status.hidden = false
  if (!item) {
    $('project-details-title').textContent = name
    status.textContent = projectCatalogError ? 'Não foi possível carregar o projeto. Tente novamente.'
      : projectCatalogLoaded ? 'Projeto não encontrado.' : 'Carregando projeto…'
    return
  }
  $('project-details-title').textContent = item.displayName || item.name
  $('project-detail-subtitle').textContent = [item.domain, projectAccess(item)].filter(Boolean).join(' · ')
  if (item.protected) {
    status.textContent = 'Projeto protegido. As ferramentas administrativas não estão disponíveis aqui.'
    return
  }
  status.hidden = true
  const route = 'project/' + item.name
  const capabilities = item.capabilities || {}
  if (capabilities.files) actions.append(projectTool('Arquivos', 'folder', route + '/permissions'))
  if (capabilities.hosting) {
    const publish = projectTool('Publicação e domínio','globe',() => openManagedHosting(item),'Enviar ZIP, testar DNS e acompanhar HTTPS')
    actions.append(publish)
  }
  if (capabilities.updates) actions.append(projectTool('Atualizar site', 'updates', route + '/aws/updates', 'ZIP ou GitHub'))
  if (capabilities.diagnostics) actions.append(
    projectTool('Diagnóstico', 'activity', route + '/insights'),
    projectTool('Logs e erros', 'list', route + '/runtime-logs'),
    projectTool('Histórico', 'file', route + '/activity'),
  )
  if (capabilities.backups) actions.append(projectTool('Backups', 'backup',
    capabilities.updates ? route + '/aws/backups' : route + '/backup-center',
    capabilities.updates ? 'Código de produção' : 'Pasta public/',
  ))
  if (capabilities.siteState) {
    const label = item.enabled ? 'Desativar site' : 'Ativar site'
    const toggle = node('button', label, 'outline project-site-toggle')
    toggle.type = 'button'
    toggle.addEventListener('click', async () => {
      const enabled = !item.enabled
      if (!await confirmAction(`${label} ${item.name} no Nginx? Os arquivos serão preservados.`, label)) return
      toggle.disabled = true
      try {
        await api('/api/tasks', 'POST', { action: 'set_site_state', name: item.name, enabled })
        projectOverviewCache.delete(item.name)
        await loadProjectCatalog({ force: true })
        notice(`Site ${item.name} ${enabled ? 'ativado' : 'desativado'} no Nginx.`)
      } catch (error) { notice(error.message, true) }
      finally { toggle.disabled = false }
    })
    actions.append(toggle)
  }
  $('project-management-panel').hidden = !actions.childElementCount
}

// Diagnóstico local de cada projeto. A API informa quando o valor é parcial ou não verificado.
function projectReadableSize(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Indisponível'
  if (value < 1024) return value + ' B'
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)) - 1)
  const precision = index === 0 ? 0 : 1
  return (value / (1024 ** (index + 1))).toLocaleString('pt-BR', { minimumFractionDigits: precision, maximumFractionDigits: precision }) + ' ' + units[index]
}
function projectInfoField(label, value, note = '') {
  const field = node('div', '', 'project-insight-card')
  field.append(node('span', label, 'small muted'), node('strong', String(value ?? 'Indisponível')))
  if (note) field.append(node('small', note, 'small muted'))
  return field
}
function getProjectOverview(name, { force = false } = {}) {
  const cached = projectOverviewCache.get(name)
  if (cached?.pending || (!force && cached && cached.expires > Date.now())) return cached.promise
  const entry = { pending: true, expires: 0 }
  entry.promise = api(`/api/projects/${encodeURIComponent(name)}/overview`, 'GET', undefined, { timeoutMs: 15_000 })
    .then(info => { entry.pending = false; entry.expires = Date.now() + projectOverviewTtlMs; return info }, error => {
      if (projectOverviewCache.get(name) === entry) projectOverviewCache.delete(name)
      throw error
    })
  projectOverviewCache.delete(name)
  projectOverviewCache.set(name, entry)
  if (projectOverviewCache.size > 40) projectOverviewCache.delete(projectOverviewCache.keys().next().value)
  return entry.promise
}
function projectSheetSection(title) {
  const section = node('section', '', 'project-tech-section')
  section.append(node('h3', title))
  return section
}
function renderProjectSheet(item, info) {
  const content = $('project-details-content')
  const sites = info?.sites?.map(site => ({ ...site, enabled: site.nginxEnabled, https: site.httpsConfigured, http: site.httpConfigured })) || item.sites || []
  const summary = projectSheetSection('Configuração')
  const facts = node('div', '', 'project-tech-facts')
  facts.append(
    projectInfoField('Tecnologia', projectTechnology(item.type), info?.php?.version ? 'PHP CLI ' + info.php.version : ''),
    projectInfoField('Acesso', projectAccess(item)),
    projectInfoField('Versão instalada', info ? info.version || 'Não identificada' : '—'),
    projectInfoField('Nginx', projectNginx(sites, info?.nginx?.enabled ?? item.enabled), 'Configuração local'),
  )
  summary.append(facts)
  const domainBox = projectSheetSection('Domínios')
  if (!sites.length) domainBox.append(node('p', 'Nenhum domínio identificado na configuração local.', 'small muted'))
  for (const site of sites) {
    const row = node('div', '', 'project-tech-site')
    const labels = node('div')
    const protocol = site.https ? 'HTTPS' : site.http ? 'HTTP' : 'Protocolo não identificado'
    labels.append(node('strong', site.name), node('small', protocol + (site.enabled ? '' : ' · Desabilitado'), 'small muted'))
    row.append(labels)
    if (site.enabled && site.url === (site.https ? 'https://' : 'http://') + site.name && (site.https || site.http)) {
      const open = node('a', 'Abrir', 'button-link outline button-small')
      open.href = site.url
      open.target = '_blank'
      open.rel = 'noopener noreferrer'
      open.setAttribute('aria-label', 'Abrir ' + site.name)
      row.append(open)
    }
    domainBox.append(row)
  }
  if (sites.length) domainBox.append(node('p', 'A configuração não confirma acesso público nem validade do certificado.', 'small muted'))
  const storage = projectSheetSection('Arquivos e armazenamento')
  const dir = node('div', '', 'project-tech-directory')
  dir.append(node('code', item.path || 'Diretório não identificado', 'break-text'))
  if (item.path) {
    const copy = node('button', 'Copiar', 'outline button-small')
    copy.type = 'button'
    copy.setAttribute('aria-label', 'Copiar caminho do projeto')
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(item.path); copy.textContent = 'Copiado' }
      catch { copy.textContent = 'Não copiado' }
    })
    dir.append(copy)
  }
  storage.append(dir)
  if (info?.storage) {
    const counts = node('div', '', 'project-tech-facts')
    counts.append(
      projectInfoField('Arquivos observados', projectNumber.format(info.storage.files)),
      projectInfoField('Tamanho observado', projectReadableSize(info.storage.bytes)),
    )
    storage.append(counts)
    storage.append(node('p', info.storage.incomplete
      ? 'Leitura parcial. Não representa o total do projeto.'
      : 'Tamanho dos arquivos observados. Pastas e itens protegidos podem ficar fora da contagem.', 'small muted'))
  }
  content.replaceChildren(summary, domainBox, storage)
}
async function openProjectSheet() {
  const name = currentAppRoute.split('/')[1]
  const item = knownProjects.get(name)
  const dialog = $('project-tech-dialog')
  if (!item || dialog.open || currentAppRoute !== 'project/' + name) return
  const request = ++projectTechRequest
  const allowed = item.capabilities?.diagnostics === true && !item.protected
  const status = $('project-tech-status')
  $('project-tech-title').textContent = name
  $('project-tech-diagnostics').hidden = !allowed
  status.textContent = allowed ? 'Carregando versão e armazenamento…' : 'Medição indisponível para este projeto protegido.'
  renderProjectSheet(item)
  dialog.showModal()
  if (!allowed) return
  try {
    const info = await getProjectOverview(name)
    if (request !== projectTechRequest || !dialog.open || currentAppRoute !== 'project/' + name) return
    renderProjectSheet(item, info)
    status.textContent = info.checkedAt ? 'Consultado em ' + new Date(info.checkedAt).toLocaleString('pt-BR') : ''
  } catch {
    if (request === projectTechRequest && dialog.open) status.textContent = 'Não foi possível consultar a versão e o armazenamento. Feche e abra novamente para tentar.'
  }
}
let projectInsightsRequest = 0
function insightRow(label, value) {
  const row = node('div', '', 'insight-data-row')
  row.append(node('dt', label), node('dd', String(value ?? 'Indisponível')))
  return row
}
async function loadProjectInsights(name, { force = false } = {}) {
  const request = ++projectInsightsRequest
  const route = 'project/' + name + '/insights'
  const active = () => currentAppRoute === route && request === projectInsightsRequest
  $('project-insights-aws').hidden = name !== 'iguatamaonline'
  $('project-insights-title').textContent = 'Diagnóstico · ' + name
  $('project-insights-back').textContent = '‹ ' + name
  $('project-insights-status').textContent = 'Consultando…'
  $('project-insights-reload').disabled = true
  $('project-insights-technical').disabled = true
  $('project-insights-domains').disabled = true
  $('project-probe-output').textContent = 'Pronto para testar.'
  $('project-insights-grid').replaceChildren()
  $('project-insights-sites').replaceChildren()
  $('project-insights-details').replaceChildren()
  try {
    const info = await getProjectOverview(name, { force })
    if (!active()) return
    const size = projectReadableSize(info.storage?.bytes)
    const nginx = projectNginx((info.sites || []).map(site => ({ enabled: site.nginxEnabled })), info.nginx?.enabled)
    const storage = projectInfoField('Espaço observado', size)
    if (info.storage?.incomplete) storage.append(node('span','Leitura parcial','pill insight-partial'))
    $('project-insights-grid').replaceChildren(
      projectInfoField('Versão', info.version || 'Não identificada'),
      projectInfoField('Tecnologia', projectTechnology(info.type)),
      storage,
      projectInfoField('Nginx', nginx)
    )
    const count = value => Number.isFinite(value) ? projectNumber.format(value) : 'Indisponível'
    const entries = [
      ['Arquivos observados', count(info.storage?.files)],
      ['Pastas observadas', count(info.storage?.directories)],
      ['Disco livre na VPS', projectReadableSize(info.diskFreeBytes)],
      ['PHP CLI', info.php?.version || (info.type === 'php' ? 'Indisponível' : 'Não se aplica')],
      ['Composer', info.composer?.present ? info.composer.dependencies + ' dependência(s)' : 'Não identificado'],
      ['MariaDB na VPS', info.database?.mariadbService || 'Não identificado'],
    ]
    $('project-insights-details').replaceChildren(...entries.map(([label,value]) => insightRow(label,value)))
    const sites = $('project-insights-sites')
    if (!info.sites?.length) sites.append(node('p','Nenhum domínio vinculado foi identificado no Nginx.','small muted'))
    for (const site of info.sites || []) {
      const row = node('div','','insight-site-row')
      const content = node('div')
      content.append(node('strong',site.name), node('span',site.httpsConfigured ? 'HTTPS configurado' : site.httpConfigured ? 'HTTP configurado' : 'Protocolo não identificado','small muted'))
      row.append(content, node('span',site.nginxEnabled ? 'Habilitado' : 'Não confirmado','pill'))
      sites.append(row)
    }
    const date = new Date(info.checkedAt)
    $('project-insights-status').textContent = Number.isFinite(date.getTime()) ? 'Consulta de ' + date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'Consulta local'
    $('project-insights-technical').disabled = false
    $('project-insights-domains').disabled = false
  } catch (error) {
    if (active()) $('project-insights-status').textContent = 'Falha no diagnóstico: ' + error.message
  } finally { if (active()) $('project-insights-reload').disabled = false }
}
$('project-insights-aws').addEventListener('click', () => void reloadExternalInspection())
let projectActivityReport = ''
async function loadProjectActivity(name) {
  $('project-activity-aws').hidden = name !== 'iguatamaonline'
  $('project-activity-title').textContent = 'Histórico · ' + name
  $('project-activity-back').textContent = '‹ ' + name
  $('project-activity-status').textContent = 'Consultando auditoria…'
  $('project-activity-events').replaceChildren()
  projectActivityReport = ''
  const route = `project/${name}/activity`
  try {
    const data = await api(`/api/projects/${encodeURIComponent(name)}/activity`)
    if (currentAppRoute !== route) return
    const events = $('project-activity-events')
    if (!data.events?.length) events.append(node('p', 'Nenhuma operação registrada para este projeto.', 'small muted'))
    for (const event of data.events || []) {
      const title = event.action ? `${event.event} · ${event.action}` : event.event
      const time = event.time ? new Date(event.time).toLocaleString('pt-BR') : 'Horário não disponível'
      const row = node('div', '', 'project-activity-event')
      row.append(node('strong', title || 'Evento'), node('span', time, 'small muted'))
      events.append(row)
    }
    if (data.lastProjectUpdate) {
      events.prepend(projectInfoField('Última atualização de código', data.lastProjectUpdate.stage || 'Não identificada', data.lastProjectUpdate.message || ''))
    }
    $('project-activity-status').textContent = `${data.events?.length || 0} evento(s) disponível(is) · somente histórico administrativo.`
    projectActivityReport = ['AL Sistemas · Histórico do projeto ' + name, 'Gerado: ' + new Date().toISOString(), data.note || '', '', ...(data.lastProjectUpdate ? [JSON.stringify(data.lastProjectUpdate, null, 2), ''] : []), ...((data.events || []).map(ev => JSON.stringify(ev)))].join('\n')
  } catch (error) {
    if (currentAppRoute === route) $('project-activity-status').textContent = 'Falha ao consultar histórico: ' + error.message
  }
}
for (const id of ['project-insights-back', 'project-activity-back']) {
  $(id).addEventListener('click', () => {
    const path = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/(?:insights|activity|runtime-logs|backup-center)$/.exec(currentAppRoute)
    if (path) projectBack(`project/${path[1]}`)
  })
}
$('project-probe-run').addEventListener('click', async () => {
  const found = /^project\/([^/]+)\/insights$/.exec(currentAppRoute)
  if (!found) return
  const name = found[1]
  const button = $('project-probe-run')
  button.disabled = true
  $('project-probe-output').textContent = 'Testando Nginx local…'
  try {
    const data = await api(`/api/projects/${encodeURIComponent(name)}/probe`)
    if (currentAppRoute !== `project/${name}/insights`) return
    $('project-probe-output').textContent = data.checked
      ? `Resposta HTTP ${data.statusCode} · ${data.elapsedMs} ms · ${data.site}. Medição local; acesso público não verificado.`
      : 'Teste indisponível: ' + (data.note || data.errorCode || 'sem resposta')
  } catch (error) { if (currentAppRoute === `project/${name}/insights`) $('project-probe-output').textContent = 'Erro no teste: ' + error.message }
  finally { button.disabled = false }
})
$('project-insights-reload').addEventListener('click', () => {
  const found = /^project\/([^/]+)\/insights$/.exec(currentAppRoute)
  if (found) void loadProjectInsights(found[1], { force: true })
})
$('project-activity-reload').addEventListener('click', () => {
  const found = /^project\/([^/]+)\/activity$/.exec(currentAppRoute)
  if (found) void loadProjectActivity(found[1])
})
$('project-activity-copy').addEventListener('click', async () => {
  if (!projectActivityReport) { notice('Relatório ainda indisponível.', true); return }
  try { await navigator.clipboard.writeText(projectActivityReport); notice('Relatório copiado.') }
  catch { notice('Cópia indisponível no navegador.', true) }
})
$('project-activity-download').addEventListener('click', () => {
  if (!projectActivityReport) { notice('Relatório ainda indisponível.', true); return }
  const name = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/activity$/.exec(currentAppRoute)?.[1] || 'projeto'
  const url = URL.createObjectURL(new Blob([projectActivityReport + '\n'], {type:'text/plain;charset=utf-8'}))
  const link = document.createElement('a')
  link.href = url
  link.download = `AL-Sistemas-${name}-historico.txt`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

// v2.0.34 — logs de escopo local. Filtragem apenas de dados recebidos da API autenticada.
let projectRuntimeLogData = null
let projectRuntimeReport = ''
function projectRuntimeLineLevel(line) {
  return /\b(?:error|fatal|critical|exception|panic)\b/i.test(line) ? 'error' : /\b(?:warn|warning|notice)\b/i.test(line) ? 'warning' : 'info'
}
function projectRuntimeEntries(data) {
  return (data?.sources || []).flatMap(source => (source.lines || []).map(line => ({ origin:source.label, line })))
}
function renderProjectRuntimeLogs() {
  const content = $('project-runtime-logs-content')
  const query = $('project-runtime-logs-search').value.trim().toLocaleLowerCase('pt-BR')
  const chosen = $('project-runtime-logs-source').value
  const level = $('project-runtime-logs-level').value
  const accepts = line => (level === 'all' || projectRuntimeLineLevel(line) === level) && (!query || line.toLocaleLowerCase('pt-BR').includes(query))
  content.replaceChildren()
  if (!projectRuntimeLogData) return
  for (const source of projectRuntimeLogData.sources || []) {
    if (chosen !== 'all' && source.label !== chosen) continue
    const lines = (source.lines || []).filter(accepts)
    if (!lines.length && source.available) continue
    const group = node('section', '', 'project-log-group')
    group.append(node('strong', source.label), node('span', source.available ? `${lines.length} linha(s) exibida(s)${source.truncated ? ' · trecho final' : ''}` : source.reason || 'Indisponível', 'small muted'))
    for (const line of lines) group.append(node('div', line, 'project-log-line'))
    content.append(group)
  }
  if (!content.childElementCount) content.append(node('p', query ? 'Nenhum registro corresponde à pesquisa.' : 'Nenhum log isolado legível foi encontrado.', 'small muted'))
  const entries = projectRuntimeEntries(projectRuntimeLogData).filter(entry => (chosen === 'all' || entry.origin === chosen) && accepts(entry.line))
  projectRuntimeReport = [
    'AL Sistemas · Logs locais do projeto ' + projectRuntimeLogData.name,
    'Consulta: ' + projectRuntimeLogData.checkedAt,
    'Atenção: revise possíveis dados sensíveis antes de compartilhar.',
    '', ...entries.map(entry => `[${entry.origin}] ${entry.line}`),
  ].join('\n')
  $('project-runtime-logs-status').textContent = `${entries.length} linha(s) · ${(projectRuntimeLogData.sources || []).length} arquivo(s) identificado(s) · ${projectRuntimeLogData.note}`
}
async function loadProjectRuntimeLogs(name) {
  const route = `project/${name}/runtime-logs`
  $('project-runtime-logs-title').textContent = 'Logs e erros · ' + name
  $('project-runtime-logs-status').textContent = 'Consultando registros locais…'
  $('project-runtime-logs-content').replaceChildren()
  $('project-runtime-logs-source').replaceChildren(new Option('Todas as origens', 'all'))
  projectRuntimeLogData = null
  projectRuntimeReport = ''
  try {
    const data = await api(`/api/projects/${encodeURIComponent(name)}/logs`)
    if (currentAppRoute !== route) return
    projectRuntimeLogData = data
    for (const source of data.sources || []) $('project-runtime-logs-source').append(new Option(source.label, source.label))
    renderProjectRuntimeLogs()
  } catch (error) {
    if (currentAppRoute === route) $('project-runtime-logs-status').textContent = 'Falha ao consultar logs: ' + error.message
  }
}
$('project-runtime-logs-back').addEventListener('click', () => {
  const found = /^project\/([^/]+)\/runtime-logs$/.exec(currentAppRoute)
  if (found) projectBack(`project/${found[1]}`)
})
$('project-runtime-logs-reload').addEventListener('click', () => {
  const found = /^project\/([^/]+)\/runtime-logs$/.exec(currentAppRoute)
  if (found) void loadProjectRuntimeLogs(found[1])
})
for (const id of ['project-runtime-logs-source', 'project-runtime-logs-level', 'project-runtime-logs-search']) {
  $(id).addEventListener(id.endsWith('search') ? 'input' : 'change', renderProjectRuntimeLogs)
}
$('project-runtime-logs-copy').addEventListener('click', async () => {
  if (!projectRuntimeReport) return notice('Relatório ainda indisponível.', true)
  try { await navigator.clipboard.writeText(projectRuntimeReport); notice('Trechos copiados. Revise antes de compartilhar.') }
  catch { notice('Não foi possível copiar os registros.', true) }
})
$('project-runtime-logs-download').addEventListener('click', () => {
  if (!projectRuntimeReport) return notice('Relatório ainda indisponível.', true)
  const name = /^project\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/runtime-logs$/.exec(currentAppRoute)?.[1] || 'projeto'
  const url = URL.createObjectURL(new Blob([projectRuntimeReport + '\n'], { type:'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `AL-Sistemas-${name}-logs.txt`
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

function openProjectDetails(item) { navigateApp(`project/${item.name}`) }
// 2.0.31 — navegador de arquivos scoped, sem operações fora de projetos.
let explorerProject = ''
let explorerDir = ''
let explorerOffset = 0
let explorerEntries = []
let explorerRequest = 0
let explorerCurrentItem = null
let explorerHasActiveGrant = false
let explorerGrantKnown = false
let explorerModeBusy = false
let explorerModeSession = 0
function explorerModeText(value) { return value.toString(8).padStart(3, '0') }
function explorerNewMode() {
  return [...document.querySelectorAll('#explorer-mode-table input[data-bit]:checked')]
    .reduce((bits, check) => bits | Number(check.dataset.bit), 0)
}
function explorerModeReason(item) {
  if (item.editable) {
    if (generalBusy) return 'Uma operação de escrita temporária está em andamento.'
    if (!explorerGrantKnown) return 'A escrita temporária do projeto ainda não foi confirmada. Atualize a pasta antes de alterar permissões.'
    if (explorerHasActiveGrant) return 'Há escrita temporária ativa. Restaure-a em Informações → Escrita temporária antes de editar permissões individuais.'
    return ''
  }
  const messages = {
    protected: 'Este caminho é protegido pelo painel. Isso inclui arquivos ocultos, credenciais e algumas pastas do sistema.',
    symbolic_link: 'Links simbólicos não podem ser alterados por aqui.',
    special: 'Este tipo de item não aceita alteração de permissões pelo painel.',
    owner: 'O proprietário não é o dono da pasta do projeto nem root, por isso a edição foi bloqueada.',
    public_write: 'O item já permite escrita pública. Por segurança, o painel não altera esse tipo de item.',
    hard_links: 'O arquivo tem outros nomes ligados ao mesmo conteúdo. A edição poderia afetar outros caminhos.',
    special_mode: 'O item usa bits especiais de permissão. Esta tela só altera os modos comuns de leitura, escrita e execução.',
  }
  return messages[item.modeBlockedReason] || (item.protected ? messages.protected : item.kind === 'link' ? messages.symbolic_link : 'Este item é somente leitura na vistoria do servidor.')
}
function explorerUpdateModeControls() {
  const value = explorerNewMode()
  const item = explorerCurrentItem
  const isDir = item?.kind === 'directory'
  const blocked = !item?.editable || !explorerGrantKnown || explorerHasActiveGrant || generalBusy
  $('explorer-mode-new').textContent = explorerModeText(value)
  for (const check of document.querySelectorAll('#explorer-mode-table input[data-bit]')) {
    const bit = Number(check.dataset.bit)
    check.disabled = blocked || explorerModeBusy || bit === 2 || (isDir && ((bit === 16 && !check.checked) || ((bit === 256 || bit === 64) && check.checked)))
  }
  const valid = !(value & 0o002) && (!isDir || (!(value & 0o020) && (value & 0o500) === 0o500))
  $('explorer-mode-save').disabled = blocked || explorerModeBusy || !valid || value === parseInt(item?.mode, 8)
  if (item) {
    const details = [explorerModeReason(item)]
    if (!blocked) {
      details.push('Escrita para outros não é permitida.')
      if (isDir) details.push('Em pastas, o dono precisa manter leitura e entrada, e o grupo não pode ter escrita.')
    }
    if (isDir && !item.enterable && item.navigationBlockedReason === 'shared_write') details.push('Esta pasta não pode ser aberta enquanto permitir escrita para grupo ou outros.')
    $('explorer-mode-warning').textContent = details.filter(Boolean).join(' ')
  }
}
function explorerSetChecked(item) {
  const mode = parseInt(item.mode, 8)
  $('explorer-mode-current').textContent = item.mode
  for (const check of document.querySelectorAll('#explorer-mode-table input[data-bit]')) {
    check.checked = Boolean(mode & Number(check.dataset.bit))
  }
  explorerUpdateModeControls()
}
function explorerOpenMode(item) {
  explorerCurrentItem = item
  explorerModeBusy = false
  explorerModeSession++
  $('explorer-mode-title').textContent = item.name
  $('explorer-mode-meta').textContent = `${item.path} · ${item.owner}:${item.group} · ${item.kind === 'directory' ? 'pasta' : item.kind === 'file' ? 'arquivo' : 'link ou item especial'}`
  $('explorer-mode-inline').textContent = ''
  explorerSetChecked(item)
  $('explorer-mode-dialog').showModal()
  if (!explorerGrantKnown) void refreshGeneralPermissions(explorerProject)
}
function explorerModeFeedback(message, error = false) {
  const inline = $('explorer-mode-inline')
  inline.textContent = message
  inline.className = error ? 'small bad' : 'small good'
  $('explorer-mode-result-title').textContent = error ? 'Não foi possível aplicar' : 'Permissões atualizadas'
  $('explorer-mode-result-message').textContent = message
  $('explorer-mode-result-dialog').showModal()
}
function explorerRenderEntries() {
  const search = $('explorer-search').value.trim().toLocaleLowerCase('pt-BR')
  const container = $('explorer-items')
  container.replaceChildren()
  const matching = explorerEntries.filter(item => !search || item.name.toLocaleLowerCase('pt-BR').includes(search))
  if (!matching.length) container.append(node('p', search ? 'Nenhum item encontrado nesta pasta.' : 'Esta pasta está vazia.', 'explorer-empty small muted'))
  for (const item of matching) {
    const row = node('div', '', 'explorer-entry')
    const glyph = node('span', '', 'explorer-entry-glyph ' + (item.kind === 'directory' ? 'is-folder' : item.kind === 'link' ? 'is-link' : 'is-file'))
    glyph.append(iconGraphic(item.kind === 'directory' ? 'folder' : item.kind === 'file' ? 'file' : 'lock'))
    const main = node('button', '', 'explorer-entry-main')
    main.type = 'button'
    main.addEventListener('click', () => item.enterable ? void explorerBrowse(item.path) : explorerOpenMode(item))
    const title = node('strong', item.name, 'explorer-entry-title')
    const description = node('small', `${item.kind === 'directory' ? 'Pasta' : item.kind === 'file' ? 'Arquivo' : item.kind === 'link' ? 'Atalho simbólico' : 'Especial'} · ${item.owner}:${item.group} · ${item.mode}`, 'muted')
    main.append(title, description)
    row.append(glyph, main)
    const action = node('button', '', 'outline explorer-entry-action')
    action.type = 'button'
    action.setAttribute('aria-label', `Ver propriedades de ${item.name}`)
    action.append(iconGraphic(item.editable ? 'shield' : 'lock'), node('span', 'Propriedades'))
    action.addEventListener('click', () => explorerOpenMode(item))
    row.append(action)
    container.append(row)
  }
}
function explorerCrumbs() {
  const crumbs = $('explorer-crumbs')
  crumbs.replaceChildren()
  const parts = explorerDir ? explorerDir.split('/') : []
  if (!parts.length) { crumbs.hidden = true; return }
  crumbs.hidden = false
  const root = node('button', '', 'outline explorer-crumb explorer-crumb-root')
  root.type = 'button'
  root.setAttribute('aria-label', 'Voltar à raiz de arquivos')
  root.title = 'Raiz de arquivos'
  root.append(iconGraphic('folder'))
  root.addEventListener('click', () => void explorerBrowse(''))
  crumbs.append(root)
  for (let index = 0; index < parts.length; index++) {
    crumbs.append(node('span', '›', 'explorer-crumb-separator'))
    const part = node('button', parts[index], 'outline explorer-crumb')
    part.type = 'button'; part.disabled = index === parts.length - 1
    const path = parts.slice(0, index + 1).join('/')
    part.addEventListener('click', () => void explorerBrowse(path))
    crumbs.append(part)
  }
}
async function explorerBrowse(directory = '', offset = 0) {
  if (!explorerProject) return
  const requestId = ++explorerRequest
  const name = explorerProject
  if (!offset) {
    explorerDir = directory
    explorerEntries = []
    $('explorer-search').value = ''
    $('explorer-items').replaceChildren(node('p', 'Abrindo pasta…', 'small muted explorer-empty'))
    $('explorer-note').hidden = true
    explorerCrumbs()
  }
  $('explorer-more').disabled = true
  try {
    const result = await api(`/api/projects/${encodeURIComponent(name)}/files?dir=${encodeURIComponent(directory)}&offset=${offset}`)
    if (requestId !== explorerRequest || name !== explorerProject || currentAppRoute !== `project/${name}/permissions`) return
    explorerDir = directory
    explorerOffset = result.nextOffset
    explorerEntries = offset ? [...explorerEntries, ...(result.items || [])] : (result.items || [])
    $('explorer-summary').textContent = result.total === 1 ? '1 item' : result.total + ' itens'
    $('explorer-note').textContent = result.limited ? 'Esta lista mostra até 4.000 itens.' : ''
    $('explorer-note').hidden = !result.limited
    $('explorer-more').hidden = result.nextOffset == null
    $('explorer-more').disabled = false
    explorerCrumbs()
    explorerRenderEntries()
  } catch (error) {
    if (requestId !== explorerRequest) return
    $('explorer-summary').textContent = 'Não foi possível acessar a pasta'
    $('explorer-items').replaceChildren(node('p', error.message, 'small bad explorer-empty'))
    $('explorer-more').hidden = true
  }
}
$('explorer-refresh').addEventListener('click', () => {
  void explorerBrowse(explorerDir)
  if (explorerProject) void refreshGeneralPermissions(explorerProject)
})
$('explorer-search').addEventListener('input', explorerRenderEntries)
$('explorer-more').addEventListener('click', () => { if (explorerOffset != null) void explorerBrowse(explorerDir, explorerOffset) })
for (const check of document.querySelectorAll('#explorer-mode-table input[data-bit]')) check.addEventListener('change', explorerUpdateModeControls)
$('explorer-mode-dialog').addEventListener('close', () => {
  if (!$('explorer-mode-dialog').open) explorerCurrentItem = null
})
$('explorer-mode-save').addEventListener('click', async () => {
  const item = explorerCurrentItem, name = explorerProject, session = explorerModeSession
  const dialog = $('explorer-mode-dialog')
  const sameItem = () => dialog.open && session === explorerModeSession && explorerCurrentItem === item && currentAppRoute === 'project/' + name + '/permissions'
  if (!item?.editable || !sameItem() || $('explorer-mode-save').disabled) return
  const newMode = explorerNewMode()
  const expectedMode = parseInt(item.mode, 8)
  const label = `Alterar ${item.path} de ${item.mode} para ${explorerModeText(newMode)}?`
  if (!await confirmAction(label, 'Aplicar permissões') || !sameItem() || !explorerGrantKnown || explorerHasActiveGrant || generalBusy) return
  explorerModeBusy = true
  explorerUpdateModeControls()
  try {
    const result = await api('/api/projects/' + encodeURIComponent(name) + '/files/mode', 'POST', {
      path: item.path, inode: item.inode, newMode, expectedMode
    })
    item.mode = typeof result.mode === 'string' && /^[0-7]{3}$/.test(result.mode) ? result.mode : explorerModeText(newMode)
    if (item.kind === 'directory' && item.navigationBlockedReason === 'shared_write') {
      item.enterable = true
      item.navigationBlockedReason = null
    }
    if (name === explorerProject && currentAppRoute === 'project/' + name + '/permissions') explorerRenderEntries()
    if (!sameItem()) return
    explorerSetChecked(item)
    explorerModeFeedback('Novo modo: ' + item.mode + '. Dono e grupo não foram alterados.')
  } catch (error) { if (sameItem()) explorerModeFeedback(error.message, true) }
  finally {
    if (session === explorerModeSession) {
      explorerModeBusy = false
      explorerUpdateModeControls()
    }
  }
})

// Escrita temporária no pop-up de ajuda. As operações do servidor permanecem as mesmas.
let generalPermissionsName = ''
let generalCatalogPaths = new Set()
let generalSelectedPaths = new Set()
let generalSavedPaths = new Set()
let generalSavedPhpUser = ''
let generalActive = false
let generalReady = false
let generalCatalogReady = false
let generalBusy = false
let generalLoadId = 0
function updatePermissionSelection() {
  const count = generalSelectedPaths.size
  $('general-permissions-count').textContent = generalCatalogReady && !generalActive ? 'Selecionados: ' + count + '/12' : ''
  const phpUser = $('general-permissions-php').value
  const allEligible = [...generalSelectedPaths].every(path => generalCatalogPaths.has(path))
  $('general-permissions-allow').disabled = generalBusy || !generalReady || !generalCatalogReady || generalActive || !phpUser || !allEligible || count < 1 || count > 12
  $('general-permissions-restore').disabled = generalBusy || !generalReady || !generalActive
  $('general-permissions-php').disabled = !generalCatalogReady || !generalReady || generalBusy || generalActive
  for (const checkbox of document.querySelectorAll('#general-permissions-selected input[type=checkbox]')) {
    checkbox.checked = generalSelectedPaths.has(checkbox.value)
    checkbox.disabled = generalActive || generalBusy || !generalReady || !generalCatalogReady || (count >= 12 && !checkbox.checked) || (!generalCatalogPaths.has(checkbox.value) && !checkbox.checked)
  }
}
function renderWritableChoices() {
  const target = $('general-permissions-selected')
  target.replaceChildren()
  const query = $('general-permissions-match').value.trim().toLocaleLowerCase('pt-BR')
  const paths = new Set([...generalSavedPaths, ...generalCatalogPaths])
  if (!generalCatalogReady && !generalReady) return
  for (const path of paths) {
    if (query && !path.toLocaleLowerCase('pt-BR').includes(query)) continue
    const row = node('label', '', 'grant-file-option')
    const input = node('input')
    input.type = 'checkbox'
    input.value = path
    input.setAttribute('aria-label', 'Selecionar ' + path)
    input.addEventListener('change', () => {
      if (input.checked) generalSelectedPaths.add(path)
      else generalSelectedPaths.delete(path)
      updatePermissionSelection()
    })
    const copy = node('span', path + (!generalCatalogPaths.has(path) && !generalActive ? ' (fora da lista atual)' : ''))
    row.append(input, copy)
    target.append(row)
  }
  if (!target.childElementCount && generalCatalogReady) target.append(node('p', query ? 'Nenhum resultado.' : 'Nenhum arquivo elegível disponível.', 'small muted'))
}
async function refreshGeneralPermissions(name, { catalog = false } = {}) {
  const loadId = ++generalLoadId
  const active = () => loadId === generalLoadId && generalPermissionsName === name && currentAppRoute === 'project/' + name + '/permissions'
  generalReady = false
  generalCatalogReady = false
  explorerGrantKnown = false
  if (catalog) $('general-permissions-status').textContent = 'Consultando permissões…'
  updatePermissionSelection()
  if ($('explorer-mode-dialog').open) explorerUpdateModeControls()
  try {
    const [data, listing] = await Promise.all([
      api('/api/projects/' + encodeURIComponent(name) + '/permissions'),
      catalog ? api('/api/projects/' + encodeURIComponent(name) + '/permissions/catalog').catch(error => ({error})) : null
    ])
    if (!active()) return
    generalCatalogReady = !!listing && !listing.error
    generalCatalogPaths = new Set((listing?.files || []).map(file => file.path))
    generalSavedPaths = new Set((data.files || []).map(file => file.path))
    generalSelectedPaths = new Set(generalSavedPaths)
    generalSavedPhpUser = data.phpUser || ''
    generalActive = !!data.active
    explorerHasActiveGrant = generalActive
    explorerGrantKnown = true
    generalReady = true
    const select = $('general-permissions-php')
    select.replaceChildren(new Option('Escolha o usuário PHP', ''))
    for (const user of listing?.phpUsers || []) select.append(new Option(user, user))
    if (generalSavedPhpUser && ![...select.options].some(opt => opt.value === generalSavedPhpUser)) {
      const previous = new Option(generalSavedPhpUser, generalSavedPhpUser)
      previous.disabled = !generalActive
      select.append(previous)
    }
    select.value = generalSavedPhpUser
    if (catalog) {
      $('general-permissions-status').textContent = listing.error
        ? generalActive ? 'A lista está indisponível, mas você pode restaurar a escrita agora.' : 'Lista de arquivos indisponível: ' + listing.error.message
        : generalActive ? 'Escrita ativa. Restaure as permissões ao terminar.' : listing.limited ? 'Parte dos arquivos foi listada pelo servidor.' : 'Escolha somente os arquivos que precisam da liberação.'
      renderWritableChoices()
    }
  } catch (error) {
    if (active()) $('general-permissions-status').textContent = 'Não foi possível consultar as permissões: ' + error.message
  } finally {
    if (active()) {
      updatePermissionSelection()
      if ($('explorer-mode-dialog').open) explorerUpdateModeControls()
    }
  }
}
function loadGeneralPermissions(name) {
  generalPermissionsName = name
  explorerProject = name
  generalBusy = false
  $('general-project-permissions-title').textContent = 'Arquivos · ' + name
  $('general-permissions-back').textContent = '‹ ' + (history.state?.fromRoute === 'project/iguatamaonline/aws' ? 'Manutenção AWS' : name)
  $('general-permissions-result').textContent = ''
  $('general-permissions-selected').replaceChildren()
  void explorerBrowse('')
  void refreshGeneralPermissions(name)
}
async function changeGeneralPermissions(mode) {
  const name = generalPermissionsName
  if (!name || currentAppRoute !== 'project/' + name + '/permissions' || generalBusy || !generalReady) return
  const files = [...generalSelectedPaths].sort()
  const phpUser = $('general-permissions-php').value
  if (mode === 'allow' && $('general-permissions-allow').disabled) return
  if (mode === 'restore' && !generalActive) return
  const detail = mode === 'allow'
    ? `Liberar escrita temporária em ${files.length} arquivo(s) para ${phpUser}? Restaure depois da manutenção.`
    : 'Restaurar os grupos e modos anteriores dos arquivos selecionados?'
  if (!await confirmAction(detail, mode === 'allow' ? 'Liberar escrita' : 'Restaurar escrita')) return
  if (name !== generalPermissionsName || currentAppRoute !== 'project/' + name + '/permissions' || !$('general-permissions-write-dialog').open) return
  generalBusy = true
  updatePermissionSelection()
  const resultView = $('general-permissions-result')
  resultView.classList.remove('bad')
  resultView.textContent = 'Executando…'
  const endpoint = '/api/projects/' + encodeURIComponent(name) + '/permissions'
  try {
    if (mode === 'allow') {
      const isSameProfile = generalSavedPhpUser === phpUser && files.length === generalSavedPaths.size && files.every(file => generalSavedPaths.has(file))
      if (!isSameProfile) await api(endpoint + '/profile', 'POST', { files, phpUser })
    }
    await api(endpoint, 'POST', { mode })
    if (name === generalPermissionsName && currentAppRoute === 'project/' + name + '/permissions') {
      await refreshGeneralPermissions(name, { catalog:true })
      if (name === generalPermissionsName && currentAppRoute === 'project/' + name + '/permissions') {
        if ($('general-permissions-write-dialog').open) resultView.textContent = mode === 'allow' ? 'Escrita liberada.' : 'Permissões anteriores restauradas.'
        void explorerBrowse(explorerDir)
      }
    }
  } catch (error) {
    if (name === generalPermissionsName && currentAppRoute === 'project/' + name + '/permissions') {
      resultView.textContent = error.message
      resultView.classList.add('bad')
    }
  } finally {
    if (name === generalPermissionsName) { generalBusy = false; updatePermissionSelection() }
  }
}
$('general-permissions-back').addEventListener('click', () => projectBack('project/' + generalPermissionsName, generalPermissionsName === 'iguatamaonline' ? ['project/iguatamaonline', 'project/iguatamaonline/aws', 'project/iguatamaonline/aws/permissions'] : ['project/' + generalPermissionsName]))
$('general-permissions-write-open').addEventListener('click', () => {
  if ($('general-permissions-info-dialog').open) $('general-permissions-info-dialog').close()
  $('general-permissions-match').value = ''
  $('general-permissions-result').textContent = ''
  $('general-permissions-selected').replaceChildren()
  void refreshGeneralPermissions(generalPermissionsName, { catalog:true })
})
$('general-permissions-match').addEventListener('input', () => { renderWritableChoices(); updatePermissionSelection() })
$('general-permissions-php').addEventListener('change', updatePermissionSelection)
$('general-permissions-allow').addEventListener('click', () => changeGeneralPermissions('allow'))
$('general-permissions-restore').addEventListener('click', () => changeGeneralPermissions('restore'))
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
// Diagnóstico em linguagem simples: acesso, escrita e permissão para alterar são estados diferentes.
function diagnosticCard(icon, title, description, tone = '') {
  const card = node('div', '', 'diagnostic-card ' + tone)
  const glyph = node('span', '', 'diagnostic-card-icon'); glyph.append(iconGraphic(icon))
  const text = node('div', '', 'diagnostic-card-body')
  text.append(node('strong', title))
  if (description) text.append(node('span', description, 'small muted'))
  card.append(glyph, text)
  return card
}
let externalInspectionRequest = 0
async function reloadExternalInspection() {
  const request = ++externalInspectionRequest
  const targets = [$('external-diagnosis'), $('project-insights-aws-content')]
  const detailButtons = [$('external-diagnostic-files-open'), $('insights-aws-files-open')]
  for (const area of targets) area.replaceChildren(node('p','Analisando arquivos…','small muted'))
  for (const button of detailButtons) button.disabled = true
  try {
    const data = await api(externalRoot + '/maintenance')
    if (request !== externalInspectionRequest) return
    $('external-current-version').textContent = data.version || 'Não identificada'
    const files = Array.isArray(data.files) ? data.files : []
    const checked = files.filter(file => file.safePath).length
    const danger = data.permissionsGrantActive
    const blocked = data.mutationAllowed === false && !data.panelPermissionsAvailable
    const state = danger ? 'Escrita temporária ativa' : blocked ? 'Alterações bloqueadas' : 'Vistoria concluída'
    const description = danger ? 'Restaure as permissões em Arquivos quando terminar.' : blocked
      ? 'A política de propriedade bloqueou alterações nesta pasta.' : ''
    for (const area of targets) {
      const counters = node('div', '', 'diagnostic-overview')
      counters.append(projectInfoField('Versão',data.version || 'Não identificada'), projectInfoField('Arquivos verificados',checked + ' de ' + files.length))
      const status = diagnosticCard(danger ? 'alert' : blocked ? 'lock' : 'success', state, description, danger || blocked ? 'diagnostic-warning' : 'diagnostic-good')
      area.replaceChildren(status,counters)
    }
    const list = $('external-diagnostics-files')
    list.replaceChildren()
    if (blocked) list.append(node('p','Proprietário da pasta: ' + (data.rootOwner || 'não identificado') + '.','small muted'))
    if (!files.length) list.append(node('p','Nenhum arquivo retornado.','small muted'))
    for (const item of files) {
      const row = node('div','','insight-site-row')
      const body = node('div')
      body.append(node('strong',item.path),node('span',
        !item.safePath ? 'Não foi possível validar o arquivo.' :
          item.phpWritableEstimate === true ? 'Escrita PHP provável' :
          item.phpWritableEstimate === false ? 'Sem escrita PHP na estimativa' : 'Escrita PHP não identificada',
        'small muted'))
      row.append(body)
      list.append(row)
    }
    for (const button of detailButtons) button.disabled = false
    const select = $('external-backups')
    const previousBackup = select.value
    select.replaceChildren(new Option('Escolha um backup', ''))
    for (const item of data.backups || []) select.append(new Option(`${item.id} · ${item.from || '?'} → ${item.to || '?'}`, item.id))
    if ([...select.options].some(item => item.value === previousBackup)) select.value = previousBackup
    $('external-restore-code').disabled = !select.value
  } catch (error) {
    if (request !== externalInspectionRequest) return
    for (const area of targets) area.replaceChildren(diagnosticCard('alert','Não foi possível verificar',error.message,'diagnostic-warning'))
  }
}

function stopExternalPolling() {
  if (externalPoll) clearInterval(externalPoll)
  externalPoll = null
}
function projectUpdateStageLabel(stage) {
  return ({ queued: 'Na fila', checking: 'Verificando', downloading: 'Baixando', validating: 'Validando', backup: 'Criando backup', installing: 'Instalando', verifying: 'Verificando instalação', rolling_back: 'Revertendo', complete: 'Concluída', failed: 'Falhou' })[stage] || ('Etapa: ' + (stage || 'desconhecida'))
}
async function checkExternalStatus({ follow = false } = {}) {
  try {
    const response = await api(externalRoot + '/update/status')
    const state = response.status
    if (!state) { if (!externalUploading) { $('external-project-status').textContent = 'Nenhuma atualização registrada.'; $('external-update-summary').textContent = 'Nenhuma atualização registrada.' }; return }
    if (externalUploading) return
    maintenanceMessage(`${state.stage}: ${state.message || ''}`, state.stage === 'failed')
    $('external-project-status').textContent = 'Última atualização: ' + state.stage + ' · ' + (state.message || '')
    $('external-update-summary').textContent = projectUpdateStageLabel(state.stage) + (state.message ? ' · ' + state.message : '')
    $('external-update-summary').className = 'small project-update-state ' + (state.stage === 'failed' ? 'bad' : state.stage === 'complete' ? 'good' : 'muted')
    $('external-progress-step').textContent = state.stage === 'failed' ? 'A atualização falhou. Consulte Histórico e relatórios.' : state.stage === 'complete' ? 'Atualização concluída.' : 'Etapa atual: ' + state.stage
    const bar = $('external-progress')
    if (typeof state.percent === 'number' && Number.isFinite(state.percent)) {
      bar.hidden = false
      bar.value = state.percent
    } else if (!['complete', 'failed'].includes(state.stage)) {
      bar.hidden = false
      bar.removeAttribute('value') // Progresso indeterminado é mais honesto que porcentagem inventada.
    }
    const terminal = ['complete', 'failed'].includes(state.stage)
    if (!terminal && follow && !externalPoll) externalPoll = setInterval(() => void checkExternalStatus(), 1900)
    if (terminal) {
      const wasPolling = !!externalPoll
      bar.hidden = state.stage === 'failed'

      stopExternalPolling()
      $('external-reload').classList.toggle('hidden', state.stage !== 'complete')
      if (wasPolling) {
        projectOverviewCache.delete('iguatamaonline')
        await reloadExternalInspection()
      }
    }
  } catch (error) { maintenanceMessage('Consulta de progresso indisponível: ' + error.message, true) }
}
function startExternalPolling() {
  stopExternalPolling()
  $('external-reload').classList.add('hidden')
  externalPoll = setInterval(() => void checkExternalStatus(), 1900)
  void checkExternalStatus()
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
    if (mode === 'restore_code') projectOverviewCache.delete('iguatamaonline')
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
$('external-allow').addEventListener('click', () => navigateApp('project/iguatamaonline/permissions'))
$('external-backups').addEventListener('change', () => { $('external-restore-code').disabled = !$('external-backups').value })
$('external-restore-code').disabled = true
$('external-restore-code').addEventListener('click', () => externalCritical('restore_code'))
$('external-backup-code').addEventListener('click', () => externalCritical('backup_code'))
$('external-github').addEventListener('click', externalGithubUpdate)
$('external-upload').addEventListener('click', externalFileUpdate)
$('external-reload').addEventListener('click', () => window.location.reload())
$('external-check-progress').addEventListener('click', () => void checkExternalStatus())
$('external-refresh-version').addEventListener('click', () => void reloadExternalInspection())
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
// O histórico visível usa elementos de texto, sem injetar JSON como HTML.
function renderProjectAuditEvent(event) {
  const failed = /failed|rejected/.test(event.event || '')
  const done = /success|complete/.test(event.event || '')
  const requested = /requested/.test(event.event || '')
  const names = {
    task_requested: 'Operação solicitada', task_success: 'Operação concluída', task_failed: 'Operação falhou',
    project_permissions: 'Permissões solicitadas', project_permissions_failed: 'Falha nas permissões',
    update_requested: 'Atualização solicitada', update_failed: 'Falha na atualização'
  }
  const title = names[event.event] || (failed ? 'Falha administrativa' : requested ? 'Operação iniciada' : done ? 'Operação concluída' : 'Evento administrativo')
  const item = node('article', '', 'project-log-event ' + (failed ? 'event-failed' : done ? 'event-success' : 'event-neutral'))
  const glyph = node('span', '', 'project-feature-icon ' + (failed ? 'tone-alert' : done ? 'tone-good' : ''))
  glyph.append(iconGraphic(failed ? 'alert' : done ? 'success' : 'clock'))
  const body = node('div', '', 'project-log-event-body')
  const heading = node('div', '', 'project-log-event-heading')
  heading.append(node('strong', title))
  const timestamp = new Date(event.time)
  const when = Number.isNaN(timestamp.getTime()) ? 'Horário indisponível' : timestamp.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  heading.append(node('span', when, 'small muted'))
  body.append(heading)
  const actionNames = { project_permissions: 'Permissões', other_project_permissions: 'Permissões', backup_external_code: 'Backup', restore_project_code: 'Restauração', start_project_update: 'Atualização' }
  const name = actionNames[event.action] || ((typeof event.action === 'string' && event.action) ? event.action.replaceAll('_', ' ') : '')
  const detail = typeof event.reason === 'string' && event.reason ? event.reason :
    event.mode === 'allow' ? 'Liberação temporária' : event.mode === 'restore' ? 'Restauração das permissões' : name
  if (detail) body.append(node('p', detail, 'small muted'))
  item.append(glyph, body)
  return item
}
async function loadExternalReport() {
  const raw = $('external-report-text')
  const current = $('external-log-current')
  const eventsArea = $('external-log-events')
  raw.textContent = 'Consultando…'
  current.replaceChildren(node('p', 'Consultando última atualização…', 'small muted'))
  eventsArea.replaceChildren(node('p', 'Carregando eventos…', 'small muted'))
  try {
    const [status, auditData] = await Promise.all([api(externalRoot + '/update/status'), api('/api/audit')])
    const s = status.status
    const events = (auditData.events || []).filter(ev => ev.name === 'iguatamaonline' || (typeof ev.action === 'string' && /project_update|project_permissions|restore_project_code|backup_external_code|start_project_update/.test(ev.action)))
    current.replaceChildren()
    const statusGlyph = node('span', '', 'project-feature-icon ' + (s?.stage === 'failed' ? 'tone-alert' : s?.stage === 'complete' ? 'tone-good' : ''))
    statusGlyph.append(iconGraphic(s?.stage === 'failed' ? 'alert' : s?.stage === 'complete' ? 'success' : 'activity'))
    const statusText = node('div', '', 'project-log-current-text')
    statusText.append(node('span', 'Última atualização', 'small muted'), node('strong', s ? projectUpdateStageLabel(s.stage) : 'Nenhuma atualização registrada'))
    if (s?.message) statusText.append(node('span', s.message, 'small muted'))
    current.append(statusGlyph, statusText)
    eventsArea.replaceChildren()
    if (!events.length) eventsArea.append(node('p', 'Nenhum evento administrativo encontrado no histórico disponível.', 'small muted'))
    for (const ev of events.slice(0, 30)) eventsArea.append(renderProjectAuditEvent(ev))
    const lines = ['AL Sistemas · IguatamaOnline', 'Relatório consultado: ' + new Date().toLocaleString('pt-BR'), '', 'Última atualização:', s ? JSON.stringify(s, null, 2) : 'Nenhuma atualização registrada.', '', ...(externalLastError ? ['Último erro observado na interface:', externalLastError, ''] : []), 'Eventos administrativos recentes:']
    if (!events.length) lines.push('Nenhum evento relacionado ao projeto encontrado no histórico disponível.')
    for (const ev of events.slice(0, 30)) lines.push(JSON.stringify(ev))
    raw.textContent = lines.join('\n')
  } catch (error) {
    current.replaceChildren()
    eventsArea.replaceChildren(diagnosticCard('alert', 'Consulta indisponível', error.message, 'diagnostic-warning'))
    raw.textContent = 'Falha ao consultar o relatório: ' + error.message
  }
}

function renderProjectCatalog() {
  const list = $('projects')
  const status = $('project-list-status')
  const search = $('project-search')
  const projects = [...knownProjects.values()]
  $('project-count').textContent = projectCatalogLoaded ? projectNumber.format(projects.length) : '—'
  $('project-search-field').hidden = projects.length < 5
  if (projects.length < 5) search.value = ''
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  const filtered = projects.filter(item => !query || [item.name, item.displayName, ...(item.domains || [])].join(' ').toLocaleLowerCase('pt-BR').includes(query))
  const rows = filtered.map(item => {
    const line = node('button', '', 'project-entry project-catalog-entry')
    line.type = 'button'
    line.setAttribute('aria-label', 'Abrir projeto ' + (item.displayName || item.name))
    line.addEventListener('click', () => openProjectDetails(item))
    const emblem = node('span', '', 'project-emblem')
    emblem.append(iconGraphic(item.type === 'php' ? 'code' : item.type === 'node' ? 'server' : 'folder'))
    const info = node('span', '', 'project-catalog-info')
    const top = node('span', '', 'project-catalog-top')
    top.append(node('strong', item.displayName || item.name), node('span', projectAccess(item), 'pill project-catalog-access'))
    info.append(top, node('small', [item.domain || 'Sem domínio', item.capabilities?.hosting ? (item.release ? 'Arquivos publicados' : 'Sem arquivos publicados') : ''].filter(Boolean).join(' · '), 'muted'))
    const arrow = node('span', '›', 'project-entry-chevron')
    arrow.setAttribute('aria-hidden', 'true')
    line.append(emblem, info, arrow)
    return line
  })
  list.replaceChildren(...rows)
  status.textContent = projectCatalogError
    ? (projectCatalogLoaded ? 'Não foi possível atualizar. A lista anterior continua exibida. ' : 'Não foi possível carregar a lista. ') + projectCatalogError
    : !projectCatalogLoaded ? 'Carregando projetos…' : !projects.length ? 'Nenhum projeto localizado na pasta de hospedagem.'
      : !filtered.length ? 'Nenhum projeto corresponde à busca.' : ''
  status.hidden = !status.textContent
}
function loadProjectCatalog({ force = false } = {}) {
  if (projectCatalogRequest) return force ? projectCatalogRequest.then(() => loadProjectCatalog({ force: true })) : projectCatalogRequest
  if (projectCatalogLoaded && !force) return Promise.resolve()
  const session = projectCatalogSession
  $('projects-refresh').disabled = true
  $('project-detail-retry').disabled = true
  projectCatalogError = ''
  if (!projectCatalogLoaded) renderProjectCatalog()
  projectCatalogRequest = api('/api/projects', 'GET', undefined, { timeoutMs: 12_000 }).then(data => {
    if (session !== projectCatalogSession) return
    if (!Array.isArray(data.projects)) throw new Error('Resposta inválida do servidor.')
    knownProjects = new Map(data.projects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(item => [item.name, item]))
    projectCatalogLoaded = true
  }).catch(error => {
    if (session === projectCatalogSession) projectCatalogError = error.message
  }).finally(() => {
    if (session !== projectCatalogSession) return
    projectCatalogRequest = null
    $('projects-refresh').disabled = false
    $('project-detail-retry').disabled = false
    renderProjectCatalog()
    const detail = /^project\/([^/]+)$/.exec(currentAppRoute)
    if (detail) renderProjectPage(detail[1])
  })
  return projectCatalogRequest
}
const emptyHostMetrics=$('metrics').cloneNode(true)
function resetDashboardOverview() {
  $('metrics').replaceChildren(...emptyHostMetrics.cloneNode(true).childNodes)
  $('overview-sample-time').textContent='Leitura sob demanda da VPS.'
  $('overview-host').textContent='VM Linux'
  $('overview-uptime').textContent='Tempo ligado indisponível'
  for (const id of ['overview-system-info','overview-services','overview-site-counts','overview-sites']) $(id).replaceChildren()
  ec2Request++
  $('host-ec2-refresh').disabled=false
  $('host-ec2-status').textContent=''
  $('host-ec2-fields').replaceChildren()
  $('overview-details-status').hidden=false
  $('overview-details-status').textContent='Aguardando leitura do servidor…'
  $('overview-sites-dialog-meta').textContent='Teste feito pelo Nginx local. Não verifica DNS público ou acesso pela internet.'
  $('overview-alerts').hidden=true
  $('overview-reboot-status').hidden=true
  $('host-reboot-open').disabled=true
}
async function loadDashboardOverview() {
  const id=++hostRequest, status=$('overview-load-status'), refresh=$('refresh')
  const current=()=>id===hostRequest&&currentAppRoute==='overview'&&!!csrf
  refresh.disabled=true
  status.hidden=true
  $('metrics').setAttribute('aria-busy','true')
  if(!hostSample) $('overview-details-status').textContent='Consultando o Linux…'
  $('overview-sites-meta').textContent=hostSiteSample?'Atualizando teste local…':'Testando os sites pelo Nginx local…'
  const metrics=api('/api/monitor','GET',undefined,{timeoutMs:12000}).then(data=>{
    if(!current())return
    renderMetrics(data)
    receiveHostReboot(data.reboot)
  }).catch(error=>{
    if(!current())return
    const maintenance=hostAwaiting(hostReboot?.state)
    const message=maintenance ? (hostSample?'Última leitura antes do reinício.':'Aguardando nova leitura após o reinício.')
      : hostSample?'Leitura anterior mantida. Não foi possível atualizar a VPS.':'Dados da VPS indisponíveis. Use Atualizar para tentar novamente.'
    status.textContent=message
    status.classList.toggle('bad',!maintenance)
    status.classList.toggle('muted',maintenance)
    status.hidden=false
    const detailsStatus=$('overview-details-status')
    detailsStatus.textContent=message
    detailsStatus.hidden=false
    if(!hostSample) $('overview-sample-time').textContent='Leitura do Linux não concluída'
    $('host-reboot-open').disabled=true
    if(!hostReboot?.state || hostReboot.state==='idle') $('host-reboot-note').textContent='Aguarde uma leitura da VPS para verificar se o reinício está disponível.'
  }).finally(()=>{if(id===hostRequest) $('metrics').removeAttribute('aria-busy')})
  const sites=api('/api/host/sites','GET',undefined,{timeoutMs:12000}).then(data=>{
    if(current())renderHostSites(data)
  }).catch(error=>{
    if(!current())return
    const message=hostAwaiting(hostReboot?.state) ? 'Teste local será atualizado após o reinício.'
      : hostSiteSample?'Exibindo o último teste local. Não foi possível atualizar.':'Teste local indisponível.'
    $('overview-sites-meta').textContent=message
    $('overview-sites-dialog-meta').textContent=message
  })
  try {await Promise.all([metrics,sites])}
  finally {if(id===hostRequest)refresh.disabled=false}
}
async function loadAuditPage() {
  const status = $('audit-load-status')
  status.hidden = true
  try {
    const data = await api('/api/audit', 'GET', undefined, { timeoutMs: 10_000 })
    auditEvents = Array.isArray(data.events) ? data.events : []
    renderAudit()
  } catch (error) {
    status.textContent = 'Auditoria indisponível. ' + error.message
    status.hidden = false
  }
}
$('project-search').addEventListener('input', renderProjectCatalog)
for (const id of ['projects-refresh', 'project-detail-retry']) {
  $(id).addEventListener('click', () => void loadProjectCatalog({ force: true }))
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
  domain_change: ['Domínio atualizado', 'globe', 'system', 'ok'],
  domain_redirect_change: ['Alteração de redirecionamento', 'globe', 'system', 'neutral'],
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

function enterDashboard(sess) {
  csrf = sess.csrf
  shown('dashboard')
  $('logout').classList.remove('hidden')
  activateTab(validAppRoute(appRouteFromUrl()) ? appRouteFromUrl() : 'overview', { record: false })
  void resumeUpdateIfNeeded()
  void watchPackages()
  resumeHostReboot()
  startReleaseWatch()
  if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/maintenance-worker.js').catch(()=>{})
}
async function bootstrapPage() {
  const status = await api('/api/status')
  $('version').textContent = 'v' + status.version
  $('footer-version').textContent = 'v' + status.version
  if (!status.configured) return shown('setup')
  setTrustedLogin(status.trustedDevice)
  let sess
  try { sess = await api('/api/session') }
  catch (error) {
    if (error.httpStatus === 401) { shown('login'); return }
    throw error
  }
  enterDashboard(sess)
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
function closePanelPopups(except = null) {
  for (const dialog of [...document.querySelectorAll('dialog[data-panel-popup][open]')].reverse()) if (dialog.id !== except) dialog.close()
}
for (const button of document.querySelectorAll('[data-open-panel]')) {
  button.addEventListener('click', () => {
    const dialog = $(button.dataset.openPanel)
    if (!button.disabled && !dialog.open) dialog.showModal()
  })
}
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => $(button.dataset.close).close())
}
const contextHelp = new Map([...document.querySelectorAll('template[data-help-topic]')]
  .map(template => [template.dataset.helpTopic, template]))
for (const button of document.querySelectorAll('[data-context-help]')) {
  button.addEventListener('click', () => {
    const topic = contextHelp.get(button.dataset.contextHelp)
    const dialog = $('context-help-dialog')
    if (!topic || dialog.open || button.closest('dialog')) return
    $('context-help-title').textContent = topic.dataset.helpTitle
    $('context-help-content').replaceChildren(topic.content.cloneNode(true))
    $('context-help-content').scrollTop = 0
    dialog.showModal()
  })
}
for (const button of document.querySelectorAll('[data-context-inline]')) {
  const topic = contextHelp.get(button.dataset.contextInline)
  const panel = $(button.getAttribute('aria-controls'))
  if (!topic || !panel) continue
  panel.append(node('strong', topic.dataset.helpTitle), topic.content.cloneNode(true))
  const setExpanded = expanded => {
    panel.hidden = !expanded
    button.setAttribute('aria-expanded', String(expanded))
  }
  button.addEventListener('click', () => setExpanded(panel.hidden))
  button.closest('dialog')?.addEventListener('close', () => setExpanded(false))
}
for (const button of document.querySelectorAll('[data-project-help]')) {
  button.addEventListener('click', () => $(button.dataset.projectHelp).showModal())
}
$('external-open-technical-report').addEventListener('click', () => $('external-technical-report-dialog').showModal())
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
$('project-tech-open').addEventListener('click', () => void openProjectSheet())
$('project-tech-diagnostics').addEventListener('click', () => {
  if (!$('project-tech-diagnostics').hidden && currentAppRoute.startsWith('project/')) {
    $('project-tech-dialog').close()
    navigateApp(currentAppRoute + '/insights')
  }
})
$('project-directory-open').addEventListener('click', () => $('project-directory-dialog').showModal())
$('project-directory-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('project-directory-path').textContent); notice('Caminho copiado.') }
  catch { notice('Copie o caminho exibido na janela.', true) }
})
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
    e.target.reset()
    enterDashboard(sess)
  })
})
$('host-logs-open').addEventListener('click',async()=>{
  const dialog=$('host-logs-dialog'), list=$('host-log-list')
  $('host-log-note').textContent='Consultando projetos…'
  list.replaceChildren()
  dialog.showModal()
  await loadProjectCatalog()
  if(!dialog.open)return
  const catalog=[...knownProjects.values()].filter(item=>!item.protected && item.capabilities?.diagnostics)
  $('host-log-note').textContent=catalog.length?'Escolha o projeto para ver os logs locais.':projectCatalogError||'Nenhum projeto com diagnóstico disponível.'
  list.replaceChildren(...catalog.map(item=>{
    const button=node('button',item.displayName||item.name,'outline host-log-button')
    button.type='button';button.addEventListener('click',()=>navigateApp('project/'+item.name+'/runtime-logs'))
    return button
  }))
})
$('host-nginx-test').addEventListener('click',async()=>{
  const button=$('host-nginx-test'), feedback=$('host-nginx-feedback')
  button.disabled=true
  feedback.className='small muted';feedback.textContent='Validando configuração…'
  try {
    const result=await api('/api/tasks','POST',{action:'validate_nginx'},{timeoutMs:25000})
    feedback.textContent=result.diagnostic
    feedback.className=result.valid?'small good':'small bad'
  } catch(error) {feedback.textContent=error.message;feedback.className='small bad'}
  finally {button.disabled=false}
})
$('host-reboot-open').addEventListener('click',()=>{
  $('host-reboot-form').reset()
  $('host-reboot-send').disabled=true
  $('host-reboot-error').hidden=true
  $('host-reboot-dialog').showModal()
})
$('host-reboot-confirm').addEventListener('input',e=>{
  $('host-reboot-send').disabled=hostSending||e.target.value!=='REINICIAR'
})
$('host-reboot-form').addEventListener('submit',async e=>{
  e.preventDefault()
  const confirmation=$('host-reboot-confirm'), dialog=$('host-reboot-dialog')
  if(hostSending||confirmation.value!=='REINICIAR')return
  hostSending=true
  $('host-reboot-send').disabled=true
  $('host-reboot-error').hidden=true
  const session=csrf
  const now=Date.now()
  const previous=hostReboot?.requestedAt
  saveHostTrack({requestedAt:null,target:null,sentAt:now,deadline:now+hostRebootWindow,prior:previous||null})
  try {
    const response=await api('/api/host/reboot','POST',{confirm:confirmation.value},{timeoutMs:16000})
    if(csrf!==session)return
    dialog.close()
    receiveHostReboot(response)
    if(hostTrack) followHostReboot()
  } catch(error) {
    if(csrf!==session)return
    if (error.httpStatus && (error.httpStatus<500 || (error.httpStatus===503 && error.message!=='HTTP 503'))) {
      saveHostTrack(null)
      $('host-reboot-error').textContent=error.message
      $('host-reboot-error').hidden=false
      void loadDashboardOverview()
    } else {
      dialog.close()
      paintHostReboot({state:'sending',message:'A resposta não chegou. Consultando se o pedido foi registrado…'})
      followHostReboot()
    }
  } finally {
    hostSending=false
    $('host-reboot-send').disabled=confirmation.value!=='REINICIAR'
    $('host-reboot-open').disabled=!hostReboot?.canCheckBoot || hostAwaiting(hostReboot?.state) || !!hostSample?.maintenance?.busy?.length
  }
})
$('refresh').addEventListener('click', () => { clearNotice(); void loadDashboardOverview() })
$('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', 'POST')
    csrf = ''
    stopReleaseWatch()
    clearTimeout(aptTimer)
    clearTimeout(hostPoll)
    clearTimeout(hostCountdownTimer)
    hostPoll=null;hostRecheck=null;hostPollId++
    saveHostTrack(null)
    hostSample=null;hostSiteSample=null;hostReboot=null
    resetDashboardOverview()
    aptView=null
    $('apt-progress-panel').classList.add('hidden')
    projectCatalogSession++
    closePanelPopups()
    resetDomainsPage()
    projectCatalogRequest = null
    projectCatalogLoaded = false
    projectCatalogError = ''
    knownProjects.clear()
    projectOverviewCache.clear()
    projectTechRequest++
    $('project-tech-dialog').close()
    $('project-search').value = ''
    stopExternalPolling()
    shown('login')
    $('logout').classList.add('hidden')
    setTrustedLogin((await api('/api/status')).trustedDevice)
  }
  catch (e) { notice(e.message, true) }
})
bootstrapPage().catch(e => notice(`Não foi possível carregar o painel: ${e.message}`, true))


let currentBackupCenterName = ''
let backupCenterRequest = 0
async function loadProjectBackupCenter(name) {
  const request = ++backupCenterRequest
  currentBackupCenterName = name
  $('project-backup-center-title').textContent = `Backups · ${name}`
  $('project-backup-center-status').textContent = 'Consultando inventário…'
  $('project-backup-center-list').replaceChildren()
  $('project-backup-center-scopes').replaceChildren()
  await loadProjectCatalog()
  if (request !== backupCenterRequest || currentAppRoute !== `project/${name}/backup-center`) return
  const item = knownProjects.get(name)
  if (!item) {
    $('project-backup-center-status').textContent = 'Projeto não encontrado. Atualize a lista.'
    return
  }
  const info = (title, detail) => {
    const block = node('div', '', 'project-backup-scope')
    block.append(node('strong', title), node('span', detail, 'small muted'))
    $('project-backup-center-scopes').append(block)
  }
  const managedCopy = item.capabilities?.backups && name !== 'iguatamaonline'
  if (name === 'iguatamaonline') {
    info('Código de produção', 'Backups privados do código podem ser criados e restaurados na Manutenção AWS.')
    const link = node('button', 'Abrir backups do IguatamaOnline', 'outline')
    link.type = 'button'
    link.addEventListener('click', () => navigateApp('project/iguatamaonline/aws/backups'))
    $('project-backup-center-list').append(link)
    $('project-backup-center-status').textContent = 'Cópias privadas do código; banco e uploads não incluídos.'
  } else if (managedCopy) {
    info('Código público', 'Backups criptografados de public/; não abrangem arquivos privados, banco nem uploads fora de public/.')
    const create = node('button', 'Criar backup criptografado de public/', 'outline')
    create.type = 'button'
    create.addEventListener('click', () => openBackup(name))
    $('project-backup-center-list').append(create)
    try {
      const result = await api(`/api/projects/${encodeURIComponent(name)}/backups`)
      if (request !== backupCenterRequest || currentAppRoute !== `project/${name}/backup-center`) return
      const matching = (result.backups || []).filter(b => b.name === name && b.scope === 'public-only')
      if (Number.isInteger(result.capacity) && result.capacity > 0) create.disabled = matching.length >= result.capacity
      for (const backup of matching) {
        const row = node('div', '', 'project-backup-entry')
        row.append(node('strong', new Date(backup.createdAt).toLocaleString('pt-BR')),
          node('span', `${projectReadableSize(backup.bytes)} criptografados · ${backup.files} arquivos · public/`, 'small muted'),
          node('small', backup.archive, 'small muted break-text'))
        const verify = node('button', 'Verificar SHA-256', 'outline button-small')
        verify.type = 'button'
        const feedback = node('span', 'Verificação não executada.', 'small muted')
        verify.addEventListener('click', async () => {
          verify.disabled = true
          feedback.textContent = 'Conferindo bytes do arquivo armazenado…'
          try {
            const data = await api(`/api/projects/${encodeURIComponent(name)}/backups/verify`, 'POST', { archive: backup.archive })
            feedback.textContent = data.ok ? 'SHA-256 confere com o manifesto. A restauração não foi testada.' : 'SHA-256 divergente. Não confie nesta cópia.'
            feedback.className = data.ok ? 'small good' : 'small bad'
          } catch (error) {
            feedback.textContent = 'Verificação indisponível: ' + error.message
            feedback.className = 'small bad'
          } finally { verify.disabled = false }
        })
        row.append(verify, feedback)
        $('project-backup-center-list').append(row)
      }
      $('project-backup-center-status').textContent = `${matching.length}${Number.isInteger(result.capacity) ? ' de ' + result.capacity : ''} cópias de public/ registradas.`
    } catch (error) {
      if (request === backupCenterRequest && currentAppRoute === `project/${name}/backup-center`) $('project-backup-center-status').textContent = 'Não foi possível listar os backups: ' + error.message
    }
  } else {
    info('Código', 'Backup pelo painel indisponível para projetos externos ou não reconhecidos como gerenciados.')
    $('project-backup-center-status').textContent = 'Nenhuma operação de backup autorizada para este projeto.'
  }
  info('Banco de dados', 'Não incluído. Backup e restauração SQL ainda não estão implementados nesta versão.')
  info('Uploads e arquivos privados', 'Não garantidos por backup de public/. É necessária uma estratégia própria e cópia fora da EC2.')
}
$('project-backup-center-back').addEventListener('click', () => navigateApp(`project/${currentBackupCenterName}`))
$('project-backup-center-refresh').addEventListener('click', () => { if (currentBackupCenterName) void loadProjectBackupCenter(currentBackupCenterName) })
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
let serviceSnapshot = null, serviceLimit = 20, serviceFocus = null, serviceRequest = 0, serviceTimer = null
const serviceLabels = {active:'Em execução',inactive:'Parado',failed:'Falhou',activating:'Iniciando',deactivating:'Parando','not-loaded':'Não carregado'}
function paintServiceDialog() {
  if (!$('service-control-dialog').open || !serviceFocus) return
  const item = serviceSnapshot?.services.find(row=>row.unit===serviceFocus)
  if (!item) return
  $('service-control-meta').textContent = (serviceLabels[item.active] || item.active) + ' · ' + (item.substate || item.enabled || '')
  const buttons = item.actions.map(operation=>{
    const label = {start:'Iniciar',stop:'Parar',restart:'Reiniciar'}[operation]
    const button = node('button',label,'outline button-small')
    button.type = 'button'
    button.disabled = operation==='start' && item.active==='active' || operation==='stop' && item.active==='inactive'
    button.addEventListener('click',async () => {
      if (!await confirmAction(label + ' ' + item.unit + '? Sites ou conexões que usam esse serviço podem ser interrompidos.',label)) return
      button.disabled = true
      try {
        await api('/api/services/action','POST',{unit:item.unit,operation})
        $('service-control-feedback').textContent = 'Solicitado ao systemd. O estado será consultado novamente.'
        clearTimeout(serviceTimer)
        await updateDiagnostics()
        serviceTimer = setTimeout(()=>{if(currentAppRoute==='services')void updateDiagnostics()},2100)
      } catch (error) { $('service-control-feedback').textContent = error.message }
      finally { button.disabled=false }
    })
    return button
  })
  if (!buttons.length) buttons.push(node('p','Somente consulta. Este serviço não tem ações gerenciadas pelo painel.','small muted'))
  $('service-commands').replaceChildren(...buttons)
}
function paintServices() {
  if (!serviceSnapshot) return
  const filter = $('services-filter').value, query = $('services-query').value.trim().toLowerCase()
  const {services,mail,inventoryAvailable} = serviceSnapshot
  const rows = services.filter(item=>(!query || (item.unit+' '+(item.description||'')).toLowerCase().includes(query)) &&
    (filter==='all' || filter==='active'&&item.active==='active' || filter==='managed'&&item.actions.length || filter==='mail'&&item.mail))
  const totalActive = services.filter(item=>item.active==='active').length
  $('services-manager-status').textContent = inventoryAvailable ? totalActive + ' ativos · ' + services.length + ' conhecidos · ' + rows.length + ' neste filtro' : 'Systemd indisponível para consulta.'
  const mailInfo = $('services-mail-info')
  $('services-mail-row').hidden = filter!=='mail'
  mailInfo.textContent = 'Portas locais de e-mail: ' + (mail?.length ? mail.join(', ') : mail ? 'nenhuma detectada' : 'consulta indisponível')
  $('services-more').hidden = rows.length<=serviceLimit
  $('services').replaceChildren(...rows.slice(0,serviceLimit).map(item=>{
    const button=node('button','','service-manager-row outline')
    button.type='button'
    const left=node('span','','service-manager-copy')
    left.append(node('strong',item.unit,'break-text'),node('small',item.description || (item.actions.length?'Gerenciável':'Somente consulta'),'muted break-text'))
    button.append(left,dependencyPill(serviceLabels[item.active]||item.active,item.active==='active'?'good':item.active==='failed'?'bad':''))
    button.addEventListener('click',()=>{
      serviceFocus=item.unit
      $('service-control-title').textContent=item.unit
      $('service-control-feedback').textContent=''
      $('service-control-dialog').showModal()
      paintServiceDialog()
    })
    return button
  }))
  if (!rows.length && inventoryAvailable) $('services').append(node('p','Nenhum serviço neste filtro.','small muted'))
  paintServiceDialog()
}
async function updateDiagnostics() {
  const req=++serviceRequest
  $('refresh-services').disabled=true
  if(!serviceSnapshot) $('services-manager-status').textContent='Consultando o systemd…'
  try {
    const data=await api('/api/services/inventory')
    if(req!==serviceRequest || currentAppRoute!=='services') return
    serviceSnapshot=data
    paintServices()
  } catch(error) {
    if(req===serviceRequest && currentAppRoute==='services') $('services-manager-status').textContent=error.message
  } finally { if(req===serviceRequest) $('refresh-services').disabled=false }
}
$('refresh-services').addEventListener('click',()=>void updateDiagnostics())
for(const id of ['services-filter','services-query']) $(id).addEventListener(id==='services-query'?'input':'change',()=>{serviceLimit=20;paintServices()})
$('services-more').addEventListener('click',()=>{serviceLimit+=25;paintServices()})
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
    if (currentAppRoute === `project/${backupName}/backup-center`) await loadProjectBackupCenter(backupName)
    notice(`Backup criptografado criado: ${result.backup.archive}. Guarde a frase secreta e copie o arquivo para fora da VPS.`)
  } catch (e) { notice(e.message, true) }
  finally {
    $('backup-save').disabled = false
    $('backup-cancel').disabled = false
    $('backup-save').textContent = 'Criar backup'
    $('backup-secret').value = ''
  }
})


// Catálogo de pacotes da VPS. A instalação confirma um único ID e acompanha o APT.
const dependencyGroups = [
  {id:'node', title:'Node.js e npm', icon:'code', summary:'Runtime e ferramentas de compilação', detail:'O Node.js é o runtime do próprio painel. O npm é consultado localmente. As ferramentas ajudam a compilar módulos nativos, mas as dependências de cada projeto não são instaladas por esta tela.'},
  {id:'php', title:'PHP e Composer', icon:'code', summary:'CLI, PHP-FPM e extensões', detail:'Instale o PHP 8.3, extensões ou o Composer. O conector MySQL não instala um servidor de banco, e o Composer aqui não executa projetos.'},
  {id:'database', title:'Banco de dados', icon:'database', summary:'MariaDB, MongoDB, Redis e clientes', detail:'Instala os pacotes do banco ou do cliente. Não cria bancos, contas ou regras de acesso.'},
  {id:'ruby', title:'Ruby on Rails', icon:'code', summary:'Ruby, Rails e Bundler', detail:'Instala pelo APT. Usa o Rails da distribuição, sem criar nem publicar aplicativos.'},
  {id:'mail', title:'E-mail', icon:'terminal', summary:'Clientes e serviços de e-mail', detail:'Mutt e msmtp são clientes. Postfix e Dovecot são servidores e precisam de configuração. Diagnóstico local em Serviços.'},
  {id:'tools', title:'Ferramentas da VPS', icon:'package', summary:'Certbot, Git, cURL e ZIP', detail:'Ferramentas do sistema para HTTPS, repositórios, consultas e arquivos. O Nginx aparece só para consulta.'}
]
const packageBusy = state => ['queued','checking','installing','removing'].includes(state?.stage)
let packageToInstall = null, packageOperation = 'install', packageGroup = null, packageInventory = null
let packageRequest = 0, packageSubmitting = false
function dependencyPill(text, css = '') {return node('span',text,'status-chip dependency-pill ' + css)}
function dependencyState(id,state,packages) {
  const el = $(id)
  el.hidden = !state
  if (!state) { el.replaceChildren(); return }
  const title = packages.find(item=>item.id === state.package)?.label || state.package || 'Pacote'
  const status = {queued:'Na fila',checking:'Verificando',installing:'Instalando',removing:'Removendo',canceled:'Cancelado',completed:'Concluído',failed:'Não concluído'}[state.stage] || 'Andamento'
  el.replaceChildren(dependencyPill(status,state.stage === 'completed' ? 'good' : state.stage === 'failed' ? 'bad' : ''),node('strong',title),node('small',state.message || '','muted break-text'))
}
function dependencyRow(pkg, state, showGroup = false) {
  const line = node('div','','dependency-row')
  const info = node('div','','dependency-row-copy')
  info.append(node('strong',pkg.label))
  if (showGroup) {
    const group = dependencyGroups.find(item=>item.id===pkg.group)
    if (group) info.append(node('small',group.title,'muted'))
  }
  if (pkg.detail) info.append(node('small',pkg.detail,'muted'))
  if (pkg.apt) info.append(node('small',pkg.apt,'muted dependency-apt break-text'))
  if (pkg.version) info.append(node('small','v' + String(pkg.version).replace(/^v/,''),'muted break-text'))
  line.append(info)
  if (pkg.installable && pkg.installed === false) {
    const working = state?.package === pkg.id && packageBusy(state)
    if (working) line.append(dependencyPill('Em andamento'))
    else {
      const install = node('button','Instalar','outline button-small')
      install.type = 'button'
      install.setAttribute('aria-label','Instalar ' + pkg.label)
      install.disabled = packageBusy(state)
      install.addEventListener('click',() => {
        openPackageOperation(pkg,'install')
      })
      line.append(install)
    }
  } else {
    const label = pkg.installed === true ? (pkg.readOnly ? 'Do sistema' : 'Instalado') : pkg.installed === false ? 'Não encontrado' : 'Não verificado'
    if (pkg.removable && pkg.installed) {
      const actions = node('div','','dependency-row-actions')
      actions.append(dependencyPill(label,'good'))
      const remove = node('button','Remover','outline button-small')
      remove.type='button'
      remove.setAttribute('aria-label','Remover '+pkg.label)
      remove.disabled=packageBusy(state)
      remove.addEventListener('click',()=>openPackageOperation(pkg,'remove'))
      actions.append(remove)
      line.append(actions)
    } else line.append(dependencyPill(label,pkg.installed ? 'good' : ''))
  }
  return line
}
function dependencySummary(group, data) {
  if (group.id === 'node') {
    const npm = data.runtime.npm
    return 'Node v' + data.runtime.node.version + ' · npm ' + (npm.version ? 'v'+npm.version : npm.state === 'missing' ? 'não encontrado' : 'não verificado')
  }
  const list = data.packages.filter(p=>p.group === group.id)
  return group.summary + (data.inventoryAvailable ? ' · ' + list.filter(p=>p.installed).length + '/' + list.length + ' instalados' : '')
}
function dependencyItems(data) {
  const list = [...data.packages]
  const npm = data.runtime.npm
  list.unshift(
    {id:'system-node',group:'node',label:'Node.js',apt:'nodejs',detail:'Versão do processo que está executando o painel.',version:data.runtime.node.version,installed:true,readOnly:true},
    {id:'system-npm',group:'node',label:'npm',detail:'Versão do npm detectada na VPS.',version:npm.version,installed:npm.state === 'ready' ? true : npm.state === 'missing' ? false : null,readOnly:true})
  list.push({id:'system-nginx',group:'tools',label:'Nginx',apt:'nginx',detail:'Servidor web do painel. Somente leitura.',version:data.runtime.nginx.version,installed:data.inventoryAvailable ? !!data.runtime.nginx.version : null,readOnly:true})
  return list
}
function dependencyGroupRows(group, data) {
  if (!group || !$('package-group-dialog').open) return
  $('package-group-title').textContent = group.title
  $('package-group-detail').textContent = group.detail
  const list = dependencyItems(data).filter(p=>p.group===group.id)
  $('package-list').replaceChildren(...list.map(pkg=>dependencyRow(pkg,data.status)))
  dependencyState('package-group-status',data.status,data.packages)
}
const dependencyNormalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
function filterDependencies(data) {
  const query = dependencyNormalize($('dependency-search').value).trim().split(/\s+/).filter(Boolean)
  const state = $('dependency-filter').value
  const filtered = !!query.length || state!=='all'
  $('dependency-groups').hidden = filtered
  $('dependency-results').hidden = !filtered
  const installed = data.packages.filter(p=>p.installed===true).length
  const missing = data.packages.filter(p=>p.installed===false).length
  $('dependency-counts').textContent = data.inventoryAvailable ? installed+' instalados · '+missing+' não instalados' : 'Inventário ainda não verificado'
  if (!filtered) return
  const results = dependencyItems(data).filter(pkg=>{
    if (state==='installed' && pkg.installed!==true || state==='missing' && pkg.installed!==false) return false
    const group = dependencyGroups.find(item=>item.id===pkg.group)?.title
    const fields = dependencyNormalize([pkg.apt,pkg.label,pkg.id,pkg.detail,group].filter(Boolean).join(' '))
    return query.every(term=>fields.includes(term))
  })
  $('dependency-results-title').textContent = results.length + (results.length===1 ? ' resultado' : ' resultados')
  $('dependency-results-list').replaceChildren(...(results.length ? results.map(pkg=>dependencyRow(pkg,data.status,true)) :
    [node('p','Nenhum pacote corresponde à busca ou ao filtro.','small muted')]))
}
for (const id of ['dependency-search','dependency-filter']) $(id).addEventListener(id==='dependency-search'?'input':'change',()=>{
  if (packageInventory) filterDependencies(packageInventory)
})
function renderDependencies(data) {
  const cards = dependencyGroups.map(group => {
    const btn = node('button','','dependency-category outline')
    btn.type = 'button'
    btn.setAttribute('aria-haspopup','dialog')
    const badge = node('span','','package-icon')
    badge.append(iconGraphic(group.icon))
    const copy = node('span','','dependency-category-copy')
    copy.append(node('strong',group.title),node('small',dependencySummary(group,data),'muted break-text'))
    const arrow = node('span','›','dependency-arrow')
    arrow.setAttribute('aria-hidden','true')
    btn.append(badge,copy,arrow)
    btn.addEventListener('click',() => {
      packageGroup = group
      if (!$('package-group-dialog').open) $('package-group-dialog').showModal()
      dependencyGroupRows(group,packageInventory)
    })
    return btn
  })
  $('dependency-groups').replaceChildren(...cards)
  dependencyState('package-status',data.status,data.packages)
  dependencyGroupRows(packageGroup,data)
  filterDependencies(data)
}
function dependencyFeedback(message, bad = false) {
  const el = $('dependencies-feedback')
  el.hidden = !message
  el.textContent = message
  el.classList.toggle('bad',bad)
}
async function refreshDependencies({ background = false } = {}) {
  const token = ++packageRequest
  if (!background) {
    $('reload-packages').disabled = true
    if (!packageInventory) dependencyFeedback('Consultando a VPS…')
  }
  try {
    const data = await api('/api/dependencies')
    if (currentAppRoute !== 'dependencies' || token !== packageRequest) return
    packageInventory = data
    dependencyFeedback(data.inventoryAvailable ? '' : 'Não foi possível ler o inventário do APT. Atualize para liberar instalações.',!data.inventoryAvailable)
    renderDependencies(data)
  } catch (error) {
    if (token !== packageRequest || currentAppRoute !== 'dependencies') return
    dependencyFeedback(error.message,true)
  } finally { if (token === packageRequest) $('reload-packages').disabled = false }
}
$('reload-packages').addEventListener('click', () => void refreshDependencies())
$('package-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (!packageToInstall || packageSubmitting) return
  const pkg = packageToInstall, op = packageOperation
  const submitButton = event.currentTarget.querySelector('button[type=submit]')
  const feedback = $('package-install-feedback')
  packageSubmitting = true
  submitButton.disabled = true
  feedback.hidden = true
  try {
    await launchPackageOperation(pkg,op)
    if (currentAppRoute !== 'dependencies') return
    if ($('package-dialog').open) $('package-dialog').close()
    if (currentAppRoute === 'dependencies') await refreshDependencies({background:true})
  } catch (error) {
    if (currentAppRoute === 'dependencies' && $('package-dialog').open) {
      feedback.textContent = error.message
      feedback.hidden = false
      feedback.classList.add('bad')
    }
  } finally { packageSubmitting = false; submitButton.disabled = false }
})

let dependencyHistoryToken=0, dependencyHistoryLog=''
const dependencyStage = value => ({queued:'Na fila',checking:'Verificando',installing:'Instalando',removing:'Removendo',
  completed:'Concluído',failed:'Falhou',canceled:'Cancelado'})[value] || 'Operação'
const formatPackageDate = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : 'Hora não registrada'
function formatPackageDuration(start,end) {
  const elapsed = Math.round((Date.parse(end)-Date.parse(start))/1000)
  if (!Number.isFinite(elapsed) || elapsed<0) return ''
  const minutes = Math.floor(elapsed/60)
  return minutes ? minutes+' min '+(elapsed%60)+' s' : elapsed+' s'
}
function dependencyHistoryMode(detail) {
  $('dependency-history-list').hidden=detail
  $('dependency-history-record').hidden=!detail
  $('dependency-history-back').hidden=!detail
  $('dependency-history-copy').hidden=true
  dependencyHistoryLog=''
}
async function readDependencyHistory() {
  const token=++dependencyHistoryToken, dialog=$('dependency-history-dialog')
  $('dependency-history-title').textContent='Histórico do APT'
  $('dependency-history-list').replaceChildren()
  $('dependency-history-feedback').textContent='Consultando operações recentes…'
  dependencyHistoryMode(false)
  if (!dialog.open) dialog.showModal()
  try {
    const {history}=await api('/api/dependencies/history')
    if(token!==dependencyHistoryToken || !dialog.open)return
    $('dependency-history-feedback').textContent=history.length?'Últimas 20 operações concluídas, falhas ou canceladas.':'Nenhuma operação finalizada registrada.'
    $('dependency-history-list').replaceChildren(...history.map(entry=>{
      const label=entry.operation==='remove'?'Remoção':'Instalação'
      const row=node('button','','depend-history-row outline')
      row.type='button'
      const copy=node('span','','depend-history-copy')
      copy.append(node('strong',entry.label,'break-text'),node('small',label+' · '+formatPackageDate(entry.time),'muted break-text'))
      row.append(copy,dependencyPill(dependencyStage(entry.stage),entry.stage==='failed'?'bad':entry.stage==='completed'?'good':''))
      row.addEventListener('click',()=>void openDependencyRecord(entry))
      return row
    }))
  } catch(error) {
    if(token===dependencyHistoryToken && dialog.open) $('dependency-history-feedback').textContent=error.message
  }
}
async function openDependencyRecord(entry) {
  const token=++dependencyHistoryToken
  const dialog=$('dependency-history-dialog'), box=$('dependency-history-log')
  dependencyHistoryMode(true)
  $('dependency-history-title').textContent=entry.label
  $('dependency-history-meta').textContent=(entry.operation==='remove'?'Remoção':'Instalação')+' · '+dependencyStage(entry.stage)+' · '+formatPackageDate(entry.time)
  box.hidden=true
  $('dependency-history-feedback').textContent='Lendo o registro…'
  try {
    const {record}=await api('/api/dependencies/history?job='+encodeURIComponent(entry.job))
    if(token!==dependencyHistoryToken || !dialog.open)return
    dependencyHistoryLog=record.log || ''
    const duration=formatPackageDuration(record.startedAt,record.time)
    box.textContent=dependencyHistoryLog
    box.hidden=!dependencyHistoryLog
    $('dependency-history-copy').hidden=!dependencyHistoryLog
    $('dependency-history-feedback').textContent=[record.message, duration?'Duração '+duration:'', dependencyHistoryLog?'':'Nenhuma saída adicional.'].filter(Boolean).join(' · ')
  } catch(error) {
    if(token===dependencyHistoryToken && dialog.open) $('dependency-history-feedback').textContent=error.message
  }
}
async function copyPackageLog(content,target) {
  if (!content) return
  try {await navigator.clipboard.writeText(content);target.textContent='Registro copiado.'}
  catch {target.textContent='Não foi possível copiar. Selecione o texto do registro.'}
  target.hidden=false
}
$('dependency-history-open').addEventListener('click',()=>void readDependencyHistory())
$('dependency-history-back').addEventListener('click',()=>void readDependencyHistory())
$('dependency-history-copy').addEventListener('click',()=>void copyPackageLog(dependencyHistoryLog,$('dependency-history-feedback')))

let aptTimer, aptView, aptWatchId=0, aptExpanded=true, aptDismissed=null, aptCanceling=false
function openPackageOperation(pkg,operation) {
  packageToInstall=pkg; packageOperation=operation
  const verb=operation==='remove'?'Remover':'Instalar'
  $('package-title').textContent=verb+' '+pkg.label
  $('package-description').textContent=operation==='remove' ?
    'Pode interromper serviços que usam este pacote. Remove pelo APT sem purgar configurações nem apagar dados pelo painel. Faça backup se houver dados importantes.' :
    pkg.detail+' O APT verifica o plano antes de alterar a VPS.'
  $('package-install-feedback').hidden=true
  const submit=$('package-form').querySelector('[type=submit]')
  submit.textContent=verb+' pacote';submit.disabled=false
  $('package-dialog').showModal()
}
function paintApt(state) {
  aptView=state
  const frame=$('apt-progress-panel')
  const busy=packageBusy(state)
  if(!state || !csrf || (!busy && (!state.job || aptDismissed===state.job))) {frame.classList.add('hidden');return}
  frame.classList.remove('hidden')
  const label=packageInventory?.packages.find(pkg=>pkg.id===state.package)?.label || ({'node-build':'Compiladores e Make','ruby-rails':'Ruby on Rails',mongodb:'MongoDB Community'})[state.package] || state.package
  const stage=dependencyStage(state.stage)
  $('apt-progress-title').textContent=stage+' · '+label
  $('apt-progress-message').textContent=(state.message || '') + (['installing','removing'].includes(state.stage)?' Aguarde esta etapa antes de reiniciar.':'')
  const log=$('apt-progress-log')
  const follow=log.scrollHeight-log.scrollTop-log.clientHeight<35
  const lines=state.log || (busy?'Aguardando saída do APT…':'Sem saída adicional.')
  if (log.textContent!==lines) {log.textContent=lines;if(follow)log.scrollTop=log.scrollHeight}
  $('apt-copy').hidden=!state.log
  const steps=$('apt-progress-steps')
  steps.hidden=!busy
  if (busy) {
    const phase={queued:0,checking:1,installing:2,removing:2}[state.stage]
    steps.replaceChildren(...['Fila','Plano','Aplicação'].map((label,index)=>{
      const item=node('small',label,phase===index?'current':phase>index?'past':'muted')
      if(phase===index)item.setAttribute('aria-current','step')
      return item
    }))
  }
  const time=$('apt-progress-time'), duration=formatPackageDuration(state.startedAt,state.time)
  time.textContent=duration?(busy?'Tempo decorrido · ':'Duração · ')+duration:''
  time.hidden=!duration
  $('apt-progress-body').hidden=!aptExpanded
  $('apt-toggle').textContent=aptExpanded?'Minimizar':'Ver progresso'
  $('apt-toggle').setAttribute('aria-expanded',String(aptExpanded))
  $('apt-cancel').hidden=!state.job || !['queued','checking'].includes(state.stage)
  $('apt-cancel').disabled=aptCanceling
  $('apt-retry').hidden=!['failed','canceled'].includes(state.stage)
  $('apt-dismiss').hidden=busy
}
async function watchPackages() {
  clearTimeout(aptTimer)
  const session=csrf, id=++aptWatchId
  if(!session)return
  try {
    const {status}=await api('/api/dependencies/status')
    if(csrf!==session || id!==aptWatchId)return
    const previous=aptView
    if (!previous && status && !packageBusy(status)) aptDismissed=status.job
    paintApt(status)
    if (packageInventory && currentAppRoute==='dependencies' &&
        (previous?.stage!==status?.stage || previous?.job!==status?.job || previous?.message!==status?.message)) {
      packageInventory={...packageInventory,status}
      if (packageBusy(previous) && !packageBusy(status)) void refreshDependencies({background:true})
      else if (packageBusy(previous)!==packageBusy(status)) renderDependencies(packageInventory)
      else {
        dependencyState('package-status',status,packageInventory.packages)
        if ($('package-group-dialog').open) dependencyState('package-group-status',status,packageInventory.packages)
      }
    }
  } catch { /* reconecta sem perder a última saída */ }
  finally { if(csrf===session && id===aptWatchId)aptTimer=setTimeout(watchPackages,packageBusy(aptView)?2200:15000) }
}
async function launchPackageOperation(pkg,op) {
  const result=await api('/api/dependencies/'+op,'POST',{package:pkg.id})
  aptDismissed=null;aptExpanded=true
  $('apt-progress-feedback').hidden=true
  const status={package:pkg.id,job:result.job,operation:op,stage:'queued',message:'Solicitação enviada. Aguardando o APT.'}
  paintApt(status)
  if (packageInventory && currentAppRoute==='dependencies') {
    packageInventory={...packageInventory,status}
    renderDependencies(packageInventory)
  }
  void watchPackages()
}
$('apt-copy').addEventListener('click',()=>void copyPackageLog(aptView?.log,$('apt-progress-feedback')))
$('apt-toggle').addEventListener('click',()=>{aptExpanded=!aptExpanded;paintApt(aptView)})
$('apt-dismiss').addEventListener('click',()=>{aptDismissed=aptView?.job;paintApt(aptView)})
$('apt-cancel').addEventListener('click',async()=>{
  if(!aptView?.job || aptCanceling)return
  const feedback=$('apt-progress-feedback')
  aptCanceling=true;paintApt(aptView)
  try { await api('/api/dependencies/cancel','POST',{job:aptView.job});feedback.textContent='Cancelamento solicitado. Aguardando etapa segura.' }
  catch(error) { feedback.textContent=error.message }
  finally {aptCanceling=false;feedback.hidden=false;void watchPackages()}
})
$('apt-retry').addEventListener('click',()=>{
  if(!aptView || packageBusy(aptView))return
  const pkg=packageInventory?.packages.find(row=>row.id===aptView.package) || {id:aptView.package,label:aptView.package,detail:'Repete a última operação selecionada.'}
  if(currentAppRoute!=='dependencies')navigateApp('dependencies')
  openPackageOperation(pkg,aptView.operation==='remove'?'remove':'install')
})

function activateTab(tab, { record = true } = {}) {
  if (!mainTabs.has(tab) && !validAppRoute(tab)) return
  if (record) navigateApp(tab)
  else showAppRoute(tab)
}
for (const nav of document.querySelectorAll('[data-tab]')) nav.addEventListener('click', () => activateTab(nav.dataset.tab))
$('more-nav').addEventListener('click', () => {
  const dialog = $('more-dialog')
  if (dialog.open) return
  dialog.showModal()
  $('more-nav').setAttribute('aria-expanded', 'true')
})
$('more-dialog').addEventListener('close', () => $('more-nav').setAttribute('aria-expanded', 'false'))
$('more-close').addEventListener('click', () => $('more-dialog').close())
$('new-project').addEventListener('click', () => {
  resetManagedWizard()
  if (!$('project-dialog').open) $('project-dialog').showModal()
  $('create').elements.displayName.focus()
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
    stopReleaseWatch()
    shown('login')
    $('logout').classList.add('hidden')
    setTrustedLogin(false)
    notice('Todos os dispositivos e sessões foram revogados. Entre novamente com senha e TOTP.')
  })
})

let lastRelease = null, releaseIssue = '', updatePanelInfo = null, releasePending = null, releaseGeneration = 0
let releaseTimer = null, releaseAttemptAt = 0, reviewedUpdateVersion = null
const releaseNoticeKey = 'als-release-notice-v1'
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
const releaseInterval = 30 * 60_000
const releaseRetry = 60_000
function releaseNoticeId() {
  return lastRelease?.available && lastRelease.assetsReady && !lastRelease.checkError &&
    (!updatePanelInfo || updatePanelInfo.installed === lastRelease.installed) ? lastRelease.repo + ':v' + lastRelease.latest : ''
}
function dismissedRelease() {
  try { return localStorage.getItem(releaseNoticeKey) } catch { return null }
}
function paintRelease() {
  const info=updatePanelInfo
  const release=lastRelease
  const knownRelease=release && (!info || (info.repo===release.repo && info.installed===release.installed))
  const available=!!(knownRelease && release.available && release.latest)
  const ready=!!(available && release.assetsReady && !releaseIssue && !release.checkError)
  const stage=info?.status?.stage
  const busy=updateBusy.has(stage)
  const state=$('update-release-state')
  state.textContent=releasePending && !release ? 'Verificando GitHub…' : releaseIssue || (knownRelease && release.checkError)
    ? 'Não foi possível verificar' : available ? (ready ? 'Atualização disponível' : 'Release sem pacote pronto')
    : knownRelease && release.releaseStatus==='published' ? 'Painel atualizado'
    : knownRelease && release.releaseStatus==='no_stable_release' ? 'Sem Release estável'
    : knownRelease && release.releaseStatus==='repo_unavailable' ? 'Repositório indisponível' : 'Aguardando verificação'
  state.classList.toggle('good',ready)
  $('update-installed-version').textContent=info?.installed || release?.installed ? 'v'+(info?.installed || release.installed) : '—'
  $('update-available-version').textContent=available ? 'v'+release.latest : '—'
  $('update-release-copy').textContent=releaseIssue || (knownRelease && release.message) || 'O painel verifica o GitHub automaticamente.'
  $('update-source-label').textContent=info?.repo || release?.repo || 'GitHub Releases'
  $('update-check-time').textContent=knownRelease && release.checkedAt ? 'Última consulta · '+hostShortDate(release.checkedAt) : 'Ainda não verificado'
  const operation=info?.status
  $('update-last-operation').textContent=stage==='completed' ? 'v'+info.installed+' instalada e verificada.' :
    operation ? updateStageLabel(stage)+' · '+(operation.message||'') : 'Nenhuma operação registrada.'
  $('view-update-progress').hidden=!operation
  $('view-update-progress').textContent=busy?'Acompanhar':'Ver detalhes'
  $('apply-update').hidden=!ready
  $('apply-update').disabled=busy||!ready
  $('upload-update').disabled=busy
  $('check-update').disabled=!!releasePending
  const key=releaseNoticeId()
  $('global-update-notice').hidden=!csrf||!key||busy||!!releaseIssue||currentAppRoute==='updates'||dismissedRelease()===key
  $('global-update-label').textContent=key ? 'Atualização disponível · v'+release.latest : ''
}
$('global-update-open').addEventListener('click',()=>navigateApp('updates'))
$('global-update-dismiss').addEventListener('click',()=>{
  const key=releaseNoticeId()
  try { if(key) localStorage.setItem(releaseNoticeKey,key) } catch {}
  $('global-update-notice').hidden=true
})
window.addEventListener('storage',event=>{if(event.key===releaseNoticeKey)paintRelease()})
async function loadUpdateInfo() {
  const session=csrf
  const data=await api('/api/updates','GET',undefined,{timeoutMs:8000})
  if (session!==csrf) return data
  updatePanelInfo=data
  if (lastRelease && (data.installed!==lastRelease.installed || data.repo!==lastRelease.repo)) {
    lastRelease=null
    showReleaseNotes(null)
    releaseAttemptAt=0
  }
  $('update-repo').value=data.repo || 'drilemoz/alsistemas'
  document.querySelector('.repo-url').textContent='https://github.com/'+$('update-repo').value
  const repo=data.repo || 'drilemoz/alsistemas'
  $('github-releases-link').href=/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_.-]+$/.test(repo) ? 'https://github.com/'+repo+'/releases' : 'https://github.com/drilemoz/alsistemas/releases'
  paintRelease()
  return data
}
function refreshRelease({force=false}={}) {
  if (!csrf || (!force && (document.hidden || hostAwaiting(hostReboot?.state)))) return
  if (releasePending) return releasePending
  if (!force && Date.now()-releaseAttemptAt<(releaseIssue||lastRelease?.checkError?releaseRetry:releaseInterval)) return
  releaseAttemptAt=Date.now()
  const generation=releaseGeneration, session=csrf
  const current=()=>csrf===session&&releaseGeneration===generation
  releasePending=(force?api('/api/updates/check','POST',{},{timeoutMs:20000})
    :api('/api/updates/availability','GET',undefined,{timeoutMs:20000})).then(data=>{
    if(!current())return
    if(typeof data?.repo!=='string'||typeof data?.installed!=='string') throw new Error('Resposta indisponível')
    lastRelease=data
    releaseIssue=''
    if (updatePanelInfo && (updatePanelInfo.repo!==data.repo || updatePanelInfo.installed!==data.installed)) updatePanelInfo=null
    showReleaseNotes(data)
  }).catch(error=>{
    if(!current())return
    releaseIssue=error.httpStatus===401?'Entre novamente para verificar.':'Não foi possível consultar o GitHub agora.'
  }).finally(()=>{
    if(!current())return
    releasePending=null
    paintRelease()
  })
  paintRelease()
  return releasePending
}
function stopReleaseWatch() {
  clearInterval(releaseTimer)
  releaseGeneration++
  lastRelease=updatePanelInfo=releasePending=null
  releaseIssue=''
  releaseAttemptAt=0
  showReleaseNotes(null)
  paintRelease()
}
function startReleaseWatch() {
  clearInterval(releaseTimer)
  void refreshRelease()
  releaseTimer=setInterval(()=>void refreshRelease(),60_000)
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshRelease()})
window.addEventListener('online',()=>void refreshRelease())
$('check-update').addEventListener('click',()=>void refreshRelease({force:true}))
$('update-repo-form').addEventListener('submit', e => {
  e.preventDefault()
  submit(e.currentTarget, async data => {
    await api('/api/updates/configure', 'POST', data)
    stopReleaseWatch()
    e.target.reset()
    $('repo-dialog').close()
    await loadUpdateInfo()
    startReleaseWatch()
    notice('Repositório salvo. Verificando as Releases.')
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
function updateStageLabel(stage) {
  return updateSteps.find(([key]) => key === stage)?.[1] || ({failed:'Falha na atualização', up_to_date:'Nenhuma versão nova', rolling_back:'Revertendo instalação', stalled:'Progresso interrompido'})[stage] || 'Estado não informado'
}
function showUpdateProgress(state) {
  const stage = state?.stage || 'queued'
  const label=updateStageLabel(stage)
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
  reviewedUpdateVersion = method==='github' ? lastRelease?.latest : null
  if(method==='github' && (!reviewedUpdateVersion || $('apply-update').disabled))return
  $('update-title').textContent = method === 'file' ? 'Atualizar por arquivo ZIP' : 'Instalar v'+reviewedUpdateVersion+' pelo GitHub'
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
      : await api('/api/updates/apply', 'POST', {version:reviewedUpdateVersion})
    form.reset()
    syncFilePicker('update-file-input', 'update-file-name', 'Nenhum arquivo selecionado.')
    beginTrackedUpdate(result)
  } catch (error) {
    showUpdateProgress({ stage:'failed', message:error.message, mode:updateMethod, httpStatus:error.httpStatus })
  } finally { button.disabled = false }
})
