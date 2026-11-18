import {execFileSync} from 'node:child_process'
import {domainError} from './domains.js'
const ACTIONS = {
  nginx:['restart'],
  'php8.3-fpm':['start','stop','restart'],
  mariadb:['start','stop','restart'], mongod:['start','stop','restart'],
  'redis-server':['start','stop','restart'], postgresql:['start','stop','restart'],
  dovecot:['start','stop','restart'], postfix:['start','stop','restart']
}
const allowedUnit = /^[a-zA-Z0-9_.:@\\-]{1,160}\.service$/
export function validServiceAction(unit,action) {
  return typeof unit === 'string' && typeof action === 'string' && Object.hasOwn(ACTIONS,unit) && ACTIONS[unit].includes(action)
}
const MAIL = new Set(['postfix','dovecot','exim4','sendmail'])
export function serviceInventory(exec = execFileSync) {
  const run = (command,args) => exec(command,args,{encoding:'utf8',timeout:2200,maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}})
  const flags = ['--no-pager','--plain','--no-legend','--type=service']
  const rows = new Map()
  let inventoryAvailable = false
  try {
    const files = run('/bin/systemctl',['list-unit-files',...flags])
    inventoryAvailable = true
    for (const line of files.split('\n')) {
      const [file,enabled] = line.trim().split(/\s+/)
      if (!allowedUnit.test(file)) continue
      const unit = file.slice(0,-8)
      rows.set(unit,{unit,active:'not-loaded',enabled:enabled || 'unknown'})
    }
  } catch { /* host sem systemd */ }
  try {
    const units = run('/bin/systemctl',['list-units','--all',...flags])
    inventoryAvailable = true
    for (const line of units.split('\n')) {
      const [file,load,active,substate,...description] = line.trim().split(/\s+/)
      if (!allowedUnit.test(file) || !active || load === 'not-found') continue
      const unit = file.slice(0,-8), old=rows.get(unit)
      rows.set(unit,{unit,active,substate,description:description.join(' ').slice(0,210),enabled:old?.enabled || 'unknown'})
    }
  } catch { /* arquivos instalados ainda podem estar disponíveis */ }
  const services = [...rows.values()].map(item=>({...item,actions:Object.hasOwn(ACTIONS,item.unit)?ACTIONS[item.unit]:[],mail:MAIL.has(item.unit)}))
    .sort((a,b)=>Number(b.active==='active')-Number(a.active==='active')||a.unit.localeCompare(b.unit))
  let mail = null
  try {
    const ports = new Set()
    for (const row of run('/usr/bin/ss',['-H','-ltn']).split('\n')) {
      const local = row.trim().split(/\s+/)[3]
      const port = Number(local?.split(':').at(-1))
      if ([25,110,143,465,587,993,995].includes(port)) ports.add(port)
    }
    mail = [...ports].sort((a,b)=>a-b)
  } catch { /* teste não disponível */ }
  if (services.length > 4000) throw domainError('Inventário acima do limite de exibição.',503)
  return {services,mail,inventoryAvailable,checkedAt:new Date().toISOString()}
}
