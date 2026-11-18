import net from 'node:net'
import { Resolver } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { spaceshipRequest, listSpaceshipDns, changeSpaceshipDns } from './integrations.js'

export const domainError = (message, status = 400) => Object.assign(new Error(message), { status })
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const protectedNames = new Set(['www','painel','panel','admin','api','mail','smtp','imap','pop','autodiscover','migrar'])
export function domainHost(value) {
  if (typeof value !== 'string') throw domainError('Informe um domínio válido.')
  const host = value.trim().toLowerCase().replace(/\.$/, '')
  const parts = host.split('.')
  if (host.length > 253 || parts.length < 2 || !parts.every(part => label.test(part)) ||
      !/[a-z]/.test(parts.at(-1)) || /\.(?:local|localhost|internal|home|test|invalid|onion)$/.test(host)) throw domainError('Informe um domínio público válido em ASCII.')
  return host
}
function keys(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === fields.split(',').sort().join(',')
}
function compactDomain(value) {
  let name
  try { name = domainHost(value?.name) } catch { return null }
  const ns = value.nameservers
  let nameservers = null
  if (['basic', 'custom'].includes(ns?.provider)) {
    try {
      const hosts = Array.isArray(ns.hosts) ? [...new Set(ns.hosts.slice(0, 12).map(domainHost))].sort() : []
      nameservers = { provider: ns.provider, hosts }
    } catch { /* resposta não utilizável para alterações */ }
  }
  return { name, unicodeName: typeof value.unicodeName === 'string' ? value.unicodeName.slice(0, 253) : name,
    autoRenew: typeof value.autoRenew === 'boolean' ? value.autoRenew : null,
    expirationDate: Number.isFinite(Date.parse(value.expirationDate)) ? value.expirationDate : null,
    lifecycleStatus: typeof value.lifecycleStatus === 'string' ? value.lifecycleStatus.slice(0, 40) : null,
    nameservers }
}
const apiDomain = (path, opts, write = false) => spaceshipRequest(path, { ...opts, permission: write ? 'domains:write' : 'domains:read' })
export async function listDomains(skip, options) {
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 50000) throw domainError('Página inválida.')
  const result = await apiDomain(`/v1/domains?take=25&skip=${skip}`, options)
  if (!Array.isArray(result?.items) || result.items.length > 25 || !Number.isSafeInteger(result.total) || result.total < 0)
    throw domainError('A Spaceship retornou uma lista de domínios inválida.', 502)
  return { items: result.items.map(compactDomain).filter(Boolean), total: result.total, skip, next: skip + 25 < result.total ? skip + 25 : null }
}
export async function getDomain(domain, options) {
  const name = domainHost(domain)
  const result = compactDomain(await apiDomain('/v1/domains/' + encodeURIComponent(name), options))
  if (!result || result.name !== name) throw domainError('Não foi possível confirmar o domínio na conta.', 502)
  return result
}
const writes = new Set()
async function lock(key, fn) {
  if (writes.has(key)) throw domainError('Outra alteração deste domínio está em andamento.', 409)
  writes.add(key)
  try { return await fn() } finally { writes.delete(key) }
}
function nameservers(input, previous = false) {
  if (!keys(input, 'provider,hosts') || !['basic','custom'].includes(input.provider) || !Array.isArray(input.hosts) || input.hosts.length > 12)
    throw domainError('Informe o provedor e os servidores DNS.')
  const hosts = [...new Set(input.hosts.map(domainHost))].sort()
  if (hosts.length !== input.hosts.length || (input.provider === 'custom' && hosts.length < 2) || (!previous && input.provider === 'basic' && hosts.length))
    throw domainError('Use de 2 a 12 servidores distintos para DNS personalizado. O DNS Spaceship não aceita uma lista manual.')
  return { provider: input.provider, hosts }
}
export function changeDomainSettings(domain, body, options) {
  const name = domainHost(domain)
  if (!keys(body, 'action,previous,value')) throw domainError('Parâmetros da alteração inválidos.')
  return lock('domain:' + name, async () => {
    const current = await getDomain(name, options)
    const path = '/v1/domains/' + name
    if (body.action === 'autorenew') {
      if (typeof body.value !== 'boolean' || typeof body.previous !== 'boolean' || body.value === body.previous) throw domainError('Alteração de renovação inválida.')
      if (current.autoRenew !== body.previous) throw domainError('O estado mudou. Atualize antes de aplicar.', 409)
      const result = await apiDomain(path + '/autorenew', { ...options, method:'PUT', payload:{ isEnabled:body.value } }, true)
      return { accepted:true, verified:result?.isEnabled === body.value }
    }
    if (body.action !== 'nameservers') throw domainError('Ajuste não autorizado.')
    const previous = nameservers(body.previous, true)
    const desired = nameservers(body.value)
    if (JSON.stringify(current.nameservers) !== JSON.stringify(previous)) throw domainError('Os servidores DNS mudaram. Atualize antes de aplicar.', 409)
    if (previous.provider === desired.provider && (desired.provider === 'basic' || previous.hosts.join() === desired.hosts.join()))
      throw domainError('A configuração informada já é a atual.')
    const payload = desired.provider === 'basic' ? { provider:'basic' } : desired
    const returned = await apiDomain(path + '/nameservers', { ...options, method:'PUT', payload }, true)
    const verified = returned?.provider === desired.provider && (desired.provider === 'basic' ||
      (Array.isArray(returned.hosts) && returned.hosts.map(value => String(value).toLowerCase().replace(/\.$/, '')).sort().join() === desired.hosts.join()))
    return { accepted:true, verified }
  })
}
export const changeDnsLocked = (domain, command, options) => lock('dns:' + domainHost(domain), () => changeSpaceshipDns(domain, command, options))
export function redirectSource(zone, origin, panelHost = '') {
  const domain = domainHost(zone)
  const host = domainHost(origin)
  const relative = host.slice(0, -(domain.length + 1))
  if (!host.endsWith('.' + domain) || !relative || host.length > 180 || host === panelHost ||
      relative.split('.').some(part => protectedNames.has(part))) throw domainError('Use um subdomínio não protegido pertencente ao domínio selecionado.')
  return { domain, host, relative }
}
const normalizeRecord = (record, type) => type === 'A' && net.isIP(record) === 4 ? record : type === 'CNAME' ? domainHost(record) : null
const readValue = (item, type) => {
  try { return normalizeRecord(type === 'A' ? item.address : item.cname, type) } catch { return null }
}
export function changePointer(rawDomain, body, options) {
  const domain = domainHost(rawDomain)
  if (!keys(body, 'name,previous,ttl,type,value') || !['A','CNAME'].includes(body.type) || typeof body.name !== 'string' ||
      !Number.isInteger(body.ttl) || body.ttl < 300 || body.ttl > 86400) throw domainError('Apontamento inválido.')
  const relative = redirectSource(domain, body.name.trim() + '.' + domain, options?.panelHost).relative
  const type = body.type, value = normalizeRecord(body.value, type)
  if (!value || (type === 'CNAME' && value === relative + '.' + domain)) throw domainError('Destino inválido ou circular.')
  const record = { type, name:relative, value, ttl:body.ttl }
  return lock('dns:' + domain, async () => {
    const accountDomain = await getDomain(domain, options)
    if (accountDomain.nameservers?.provider !== 'basic') throw domainError('A zona não foi confirmada como DNS Spaceship. Faça o apontamento no provedor ativo.', 409)
    if (body.previous === null) return changeSpaceshipDns(domain, { action:'create', record }, options)
    if (!keys(body.previous, 'ttl,value') || !Number.isInteger(body.previous.ttl) || body.previous.ttl < 300 || body.previous.ttl > 86400)
      throw domainError('Selecione o registro anterior na zona.')
    const old = normalizeRecord(body.previous.value, type)
    if (!old || old === value) throw domainError('O novo destino precisa ser diferente.')
    const wire = (value, ttl) => ({ name:relative, type, [type === 'A' ? 'address' : 'cname']:value, ...(ttl === undefined ? {} : { ttl }) })
    const endpoint = '/v1/dns/records/' + domain
    const send = (method, payload) => spaceshipRequest(endpoint, { ...options, method, payload })
    const save = (value, ttl) => send('PUT', { force:false, items:[wire(value, ttl)] })
    const remove = value => send('DELETE', [wire(value)])
    async function state() {
      const listing = await listSpaceshipDns(domain, options)
      if (listing.total !== listing.items.length) throw domainError('Não foi possível conferir a zona inteira. Nenhuma alteração adicional foi feita.', 409)
      const records = listing.items.filter(item => String(item?.name).toLowerCase() === relative &&
        (type === 'CNAME' || ['CNAME',type].includes(item?.type)))
      const matches = (wanted, ttl) => records.some(item => item.type === type && item.group?.type === 'custom' &&
        item.ttl === ttl && readValue(item,type) === wanted)
      return { size:records.length, old:matches(old,body.previous.ttl), next:matches(value,body.ttl) }
    }
    const before = await state()
    if (!before.old || before.size !== 1) throw domainError('Houve alteração ou existe mais de um registro neste nome/tipo. Atualize e confira na Spaceship.', 409)
    try {
      if (type === 'A') {
        await save(value,body.ttl)
        const added = await state()
        if (!added.old || !added.next || added.size !== 2) throw domainError('Os dois valores não foram confirmados.')
        await remove(old)
      } else {
        await remove(old)
        if ((await state()).size !== 0) throw domainError('O nome não ficou livre para o novo CNAME.')
        await save(value,body.ttl)
      }
      const after = await state()
      if (after.next && !after.old && after.size === 1) return { accepted:true, verified:true }
    } catch { /* Antes de compensar, reconcilia novamente a zona real. */ }
    try {
      const actual = await state()
      if (actual.next && !actual.old && actual.size === 1) return { accepted:true, verified:true }
      if (actual.old && actual.next && actual.size === 2 && type === 'A') await remove(value)
      else if (actual.size === 0) await save(old,body.previous.ttl)
      const recovered = await state()
      if (recovered.size === 1 && recovered.old) throw domainError('Troca não concluída. O registro anterior foi confirmado na Spaceship.', 409)
    } catch (error) {
      if (error.status === 409 && error.message.startsWith('Troca não concluída')) throw error
    }
    throw domainError('Estado do DNS não confirmado. Consulte a zona na Spaceship antes de repetir.', 502)
  })
}

const specialNetworks = new net.BlockList()
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['192.88.99.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) specialNetworks.addSubnet(ip,bits)
export function publicIpv4(ip) {
  if (typeof ip !== 'string' || net.isIP(ip) !== 4 || specialNetworks.check(ip)) throw domainError('Informe um IPv4 público da EC2.')
  return ip
}
function probe(host, ip, secure, rule) {
  return new Promise(resolve => {
    const transport = secure ? https : http
    let request
    const deadline = setTimeout(() => request.destroy(Object.assign(new Error(), {code:'ETIMEDOUT'})), 4000)
    const done = result => { clearTimeout(deadline); resolve(result) }
    request = transport.request({ hostname:ip, port:secure ? 443 : 80, path:'/', method:'HEAD', headers:{ Host:host },
      ...(secure ? { servername:host, rejectUnauthorized:true } : {}), agent:false }, res => {
      const location = res.headers.location
      const expected = rule.destination + (rule.preserve ? '/' : '')
      const matching = res.statusCode === rule.code && location === expected
      res.resume()
      done({ status:res.statusCode, matching, tlsValid:secure, location:typeof location === 'string' ? location.slice(0,1500) : null })
    })
    request.on('error', error => done({ status:null, matching:false, tlsValid:false, error:String(error.code || 'UNAVAILABLE').slice(0,60) }))
    request.end()
  })
}
export async function redirectDiagnostics(rule, ip, { resolver = new Resolver({timeout:2200,tries:1}), check = probe } = {}) {
  const host = domainHost(rule.host), expectedIp = publicIpv4(ip)
  const [v4,v6] = await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)])
  const addresses = v4.status === 'fulfilled' ? [...new Set(v4.value)] : []
  const ipv6 = v6.status === 'fulfilled' ? [...new Set(v6.value)] : []
  const matching = addresses.length === 1 && addresses[0] === expectedIp
  const dns = { addresses:addresses.slice(0,20), ipv6:ipv6.slice(0,20), expectedIp, matching,
    ipv6Unknown:v6.status === 'rejected' && !['ENODATA','ENOTFOUND'].includes(v6.reason?.code),
    error:v4.status === 'rejected' ? String(v4.reason?.code || 'UNAVAILABLE').slice(0,60) : null }
  if (!matching || !rule.enabled) return { dns, http:null, https:null }
  const [plain,secure] = await Promise.all([check(host,expectedIp,false,rule),check(host,expectedIp,true,rule)])
  return { dns, http:plain, https:secure }
}
