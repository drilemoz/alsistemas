import fs from 'node:fs'
import os from 'node:os'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {setTimeout as pause} from 'node:timers/promises'
import {monitor,projects} from './monitor.js'
import {packageProgress} from './dependencies.js'

const REBOOT_FILE = '/etc/alsistemas-vps/reboot-request.json'
const bootPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const qualified=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const units = {
  'alsistemas-package-installer.service':'Dependências do APT',
  'alsistemas-updater.service':'Atualização do painel',
  'alsistemas-project-updater.service':'Atualização de projeto',
  'apt-daily.service':'Rotina do APT',
  'apt-daily-upgrade.service':'Atualização automática do APT'
}
const execute = promisify(execFile)
export function hostBootId(filename='/proc/sys/kernel/random/boot_id') {
  try {
    const value=fs.readFileSync(filename,'utf8').trim()
    return bootPattern.test(value)?value:null
  } catch { return null }
}
function readReboot(filename=REBOOT_FILE) {
  let fd
  try {
    fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW)
    const st=fs.fstatSync(fd)
    if (!st.isFile() || st.uid!==0 || (st.mode&0o022) || st.size>4096) return null
    return JSON.parse(fs.readFileSync(fd,'utf8'))
  } catch {return null}
  finally { if (fd!==undefined) fs.closeSync(fd) }
}
export function rebootState(data, boot, now=Date.now()) {
  if (!data || !bootPattern.test(data.boot||'') || !Number.isFinite(data.requestedAt) || data.requestedAt<1) return {state:'idle'}
  const since=data.requestedAt*1000
  if (!Number.isFinite(since) || since>now+60000 || since<1000 || since>8640000000000000) return {state:'idle'}
  const context={requestedAt:new Date(since).toISOString()}
  if (['failed','blocked'].includes(data.phase)) return {...context,state:'blocked',message:String(data.reason||'O reinício não foi enviado.').slice(0,250)}
  if (!['scheduled','dispatching'].includes(data.phase)) return {state:'idle'}
  if (boot && data.boot!==boot) return {...context,state:'rebooted'}
  if (now-since>240000) return {...context,state:'unconfirmed'}
  return {...context,state:data.phase}
}
export function hostRebootStatus() {
  const boot=hostBootId()
  return {...rebootState(readReboot(),boot),canCheckBoot:!!boot}
}
export const rebootPending = state => ['scheduled','dispatching'].includes(state?.state)
export function cpuUtilization(before,after) {
  if (!before?.length || before.length!==after?.length) return null
  let idle=0,total=0
  for (let i=0;i<before.length;i++) {
    for (const key of ['user','nice','sys','idle','irq']) {
      const d=after[i]?.times?.[key]-before[i]?.times?.[key]
      if (!Number.isFinite(d) || d<0) return null
      total+=d
      if (key==='idle') idle+=d
    }
  }
  return total>0 ? Math.round(100*(total-idle)/total) : null
}
export async function hostMaintenance(exec=execute) {
  const busy=[]
  let verified=false
  try {
    const {stdout}=await exec('/bin/systemctl',['show','--property=Id,ActiveState,LoadState','--',...Object.keys(units)],
      {encoding:'utf8',timeout:2000,maxBuffer:12*1024})
    const found=new Set()
    for (const block of String(stdout).trim().split(/\n\s*\n/)) {
      const data=Object.fromEntries(block.split('\n').filter(line=>line.includes('=')).map(line=>line.split(/=(.*)/,2)))
      if (!Object.hasOwn(units,data.Id)) continue
      found.add(data.Id)
      if (['active','activating','deactivating','reloading','refreshing'].includes(data.ActiveState)) busy.push(units[data.Id])
    }
    verified=Object.keys(units).slice(0,3).every(unit=>found.has(unit))
  } catch {
    // Sem inferir inatividade quando o systemd não pôde ser consultado.
  }
  const apt=packageProgress()
  if (['queued','checking','installing','removing'].includes(apt?.stage) && !busy.includes('Dependências do APT')) busy.push('Dependências do APT')
  return {busy,verified}
}
export function hostInterfaces(read=os.networkInterfaces) {
  try {
    const interfaces=Object.entries(read()).flatMap(([name,addresses])=>
      (addresses||[]).filter(row=>!row.internal).map(row=>({name,address:row.address,family:row.family}))).slice(0,10)
    return {interfaces, interfacesAvailable:true}
  } catch {
    // Em serviços com AF_NETLINK bloqueado, uv_interface_addresses pode lançar.
    // Rede é complementar; não invalida métricas nem estado do boot.
    return {interfaces:[], interfacesAvailable:false}
  }
}
export async function hostOverview({transfers=0,networkInterfaces=os.networkInterfaces}={}) {
  const before=os.cpus()
  const [maintenance]=await Promise.all([hostMaintenance(),pause(310)])
  const cpuPercent=cpuUtilization(before,os.cpus())
  const sample=monitor()
  const network=hostInterfaces(networkInterfaces)
  const rebootRequired=fs.existsSync('/run/reboot-required')
  if (transfers>0) maintenance.busy.push('Transferência de arquivo pelo painel')
  return {...sample,cpuPercent,bootedAt:new Date(Date.now()-sample.uptimeSeconds*1000).toISOString(),
    system:{kernel:os.release(),...network,rebootRequired},maintenance,reboot:hostRebootStatus()}
}

export function probeLocalSite(name,protocol, {request,timeout=2100}={}) {
  if (typeof name!=='string' || !qualified.test(name) || !['http','https'].includes(protocol))
    return Promise.resolve({status:null,error:'Não testado',certificate:null})
  const secure=protocol==='https'
  const transport=request || (secure?https.request:http.request)
  return new Promise(resolve=>{
    let req, certificate=null, done=false
    function finish(status,error=null) {
      if (done) return
      done=true
      clearTimeout(timer)
      resolve({status,error,certificate})
    }
    const timer=setTimeout(()=>{
      finish(null,'Tempo de espera esgotado')
      req?.destroy()
    },timeout)
    const options={hostname:'127.0.0.1',port:secure?443:80,method:'HEAD',path:'/',headers:{Host:name},agent:false}
    if (secure) Object.assign(options,{servername:name,rejectUnauthorized:false})
    try {
      req=transport(options,(res)=>{
        res.resume()
        finish(res.statusCode)
      })
      if (secure) req.once('socket',socket=>socket.once('secureConnect',()=>{
        const peer=socket.getPeerCertificate()
        if (!peer?.subject) return
        const expiry=Date.parse(peer.valid_to||'')
        let hostnameValid=false
        try { hostnameValid=!tls.checkServerIdentity(name,peer) } catch {}
        certificate={expiresAt:Number.isFinite(expiry)?new Date(expiry).toISOString():null,
          valid:!!socket.authorized && hostnameValid && Number.isFinite(expiry) && expiry>Date.now()}
      }))
      req.on('error',error=>finish(null,error.code==='ECONNREFUSED'?'Conexão local recusada':'Consulta local indisponível'))
      req.end()
    } catch {finish(null,'Consulta local indisponível')}
  })
}
export async function hostSites({list=projects,probe=probeLocalSite,limit=12}={}) {
  const sites=new Map()
  for (const project of list()) {
    if (project.protected || project.enabled===false) continue
    for (const site of project.sites||[]) {
      const name=site.name?.toLowerCase()
      if (!name || !qualified.test(name) || !site.enabled || (!site.http&&!site.https) || sites.has(name)) continue
      sites.set(name,{name,project:project.name,display:project.displayName||project.name,http:!!site.http,https:!!site.https})
    }
  }
  const selected=[...sites.values()].slice(0,limit), checked=[]
  for(let start=0;start<selected.length;start+=4) {
    checked.push(...await Promise.all(selected.slice(start,start+4).map(async site=>{
      const [httpResult,httpsResult]=await Promise.all([
        site.http?probe(site.name,'http'):null,
        site.https?probe(site.name,'https'):null
      ])
      return {name:site.name,project:site.project,display:site.display,http:httpResult,https:httpsResult}
    })))
  }
  return {source:'loopback',sites:checked,total:sites.size,checkedAt:new Date().toISOString()}
}
