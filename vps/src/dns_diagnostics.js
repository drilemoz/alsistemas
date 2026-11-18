import net from 'node:net'
import { randomInt } from 'node:crypto'
import { domainHost, domainError } from './domains.js'

const TYPES = Object.freeze({ A:1, NS:2, CNAME:5, MX:15, TXT:16, AAAA:28, SRV:33, CAA:257 })
const SOURCES = [
  ['google', 'Google', 'https://dns.google/resolve'],
  ['cloudflare', 'Cloudflare', 'https://cloudflare-dns.com/dns-query']
]
const normal = (text, type) => typeof text === 'string'
  ? (['NS','CNAME','A','AAAA'].includes(type) ? text.trim().toLowerCase().replace(/\.$/, '') : text.trim()).slice(0, 600)
  : ''
const uniq = data => [...new Set(data.filter(Boolean))].sort()

export function publicIPv4(value) {
  if (typeof value !== 'string' || !net.isIPv4(value)) return false
  const [a,b,c] = value.split('.').map(Number)
  return a > 0 && a < 224 && ![10,127].includes(a) && !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || (b === 0 && [0,2].includes(c)) || (b === 88 && c === 99))) &&
    !(a === 198 && ([18,19].includes(b) || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113)
}
function state(code, values) {
  return code === 3 ? 'not_found' : code !== 0 ? 'unavailable' : values.length ? 'answered' : 'empty'
}
async function lookup(source, host, type, fetchImpl) {
  const [id,label,url] = source
  try {
    const query = new URL(url)
    query.searchParams.set('name',host)
    query.searchParams.set('type',type)
    const r = await fetchImpl(query, {signal:AbortSignal.timeout(3800), redirect:'error', headers:{accept:'application/dns-json'}})
    if (!r.ok) throw new Error('DNS indisponível')
    const result = await r.json()
    const answers = Array.isArray(result.Answer) ? result.Answer.slice(0,80) : []
    const chosen = answers.filter(a => a?.type === TYPES[type] && typeof a.name === 'string' &&
      ((type === 'A' || type === 'AAAA') || normal(a.name,'NS') === host))
    const values = uniq(chosen.map(a => normal(a.data,type)))
    return { id,label,state:state(result.Status,values),values, ttl:chosen.length ? Math.min(...chosen.map(x => Number.isInteger(x.TTL) && x.TTL >= 0 ? x.TTL : 0)) : null }
  } catch { return { id,label,state:'unavailable',values:[],ttl:null } }
}
function wireName(buf, offset, depth = 0) {
  if (depth > 12) throw new Error('Nome DNS inválido')
  let p = offset
  const parts = []
  while (p < buf.length && p - offset <= 255) {
    const len = buf[p++]
    if (len === 0) return [parts.join('.').toLowerCase(),p]
    if ((len & 192) === 192) {
      if (p >= buf.length) throw new Error('Nome DNS incompleto')
      parts.push(wireName(buf, ((len & 63) << 8) | buf[p], depth + 1)[0])
      return [parts.join('.').toLowerCase(),p+1]
    }
    if (len > 63 || p + len > buf.length) break
    parts.push(buf.subarray(p,p+len).toString('ascii'))
    p += len
  }
  throw new Error('Nome DNS inválido')
}
function decodeWire(buf, id, host, type, referral) {
  if (buf.length < 12 || buf.readUInt16BE(0) !== id || buf.readUInt16BE(4) !== 1) throw new Error('Resposta DNS inválida')
  const flags = buf.readUInt16BE(2)
  if (!(flags & 32768) || flags & 512 || (!referral && !(flags & 1024))) throw new Error('Resposta não autoritativa')
  const [question, offset] = wireName(buf,12)
  if (question !== host || buf.readUInt16BE(offset) !== TYPES[type] || buf.readUInt16BE(offset+2) !== 1) throw new Error('Resposta DNS divergente')
  const values = [], ttls = [], answers = buf.readUInt16BE(6)
  const total = Math.min(120, answers + (referral ? buf.readUInt16BE(8) : 0))
  let p = offset + 4
  for (let i=0; i<total; i++) {
    const [owner,pos] = wireName(buf,p)
    const kind = buf.readUInt16BE(pos), cls = buf.readUInt16BE(pos+2)
    const ttl = buf.readUInt32BE(pos+4), len = buf.readUInt16BE(pos+8), start = pos+10
    p = start+len
    if (p > buf.length) throw new Error('Resposta DNS incompleta')
    if (owner !== host || cls !== 1 || kind !== TYPES[type]) continue
    let value
    if (kind === 2 || kind === 5) value = wireName(buf,start)[0]
    if (kind === 15 && len > 2) value = buf.readUInt16BE(start) + ' ' + wireName(buf,start+2)[0]
    if (kind === 33 && len > 6) value = [buf.readUInt16BE(start),buf.readUInt16BE(start+2),buf.readUInt16BE(start+4),wireName(buf,start+6)[0]].join(' ')
    if (kind === 16 && len > 0) {
      const chunks = []
      for (let n = start; n < p;) {
        const size = buf[n++]
        if (n + size > p) throw new Error('TXT inválido')
        chunks.push(JSON.stringify(buf.subarray(n,n+size).toString('utf8')))
        n += size
      }
      value = chunks.join(' ')
    }
    if (kind === 257 && len > 2 && buf[start+1]+2 <= len) {
      const end = start+2+buf[start+1]
      value = [buf[start],buf.subarray(start+2,end).toString('ascii'),JSON.stringify(buf.subarray(end,p).toString('utf8'))].join(' ')
    }
    if (kind === 1 && len === 4) value = [...buf.subarray(start,p)].join('.')
    if (kind === 28 && len === 16) {
      const parts = Array.from({length:8},(_,j) => buf.readUInt16BE(start+2*j).toString(16))
      value = new URL('http://[' + parts.join(':') + ']').hostname.slice(1,-1)
    }
    if (value) { values.push(normal(value,type)); ttls.push(ttl) }
  }
  return { state:state(flags & 15,values), values:uniq(values), ttl:ttls.length ? Math.min(...ttls) : null }
}
export function queryAuthoritative(ip, host, type, referral = false) {
  if (!publicIPv4(ip) || !Object.hasOwn(TYPES,type) || !/^[a-z0-9_.*-]+$/.test(host) || host.length > 253 || host.split('.').some(label=>!label.length || label.length > 63)) return Promise.reject(new Error('Consulta inválida'))
  const id = randomInt(65536)
  const header = Buffer.alloc(12); header.writeUInt16BE(id); header.writeUInt16BE(1,4)
  const labels = host.split('.').map(x => Buffer.concat([Buffer.from([x.length]), Buffer.from(x)]))
  const tail = Buffer.alloc(5); tail.writeUInt16BE(TYPES[type],1); tail.writeUInt16BE(1,3)
  const packet = Buffer.concat([header,...labels,tail])
  const prefix = Buffer.alloc(2); prefix.writeUInt16BE(packet.length)
  return new Promise((resolve,reject) => {
    const s = net.createConnection({ host:ip,port:53 })
    let data = Buffer.alloc(0)
    const finish = (err,val) => { clearTimeout(timer); s.destroy(); if (err) reject(err); else resolve(val) }
    const timer = setTimeout(() => finish(new Error('DNS autoritativo sem resposta')),2400)
    s.once('connect',() => s.write(Buffer.concat([prefix,packet])))
    s.once('error',err => finish(err))
    s.once('end',() => finish(new Error('Resposta DNS incompleta')))
    s.on('data',chunk => {
      data = Buffer.concat([data,chunk])
      if (data.length > 65537) return finish(new Error('Resposta DNS extensa'))
      if (data.length < 2 || data.length < data.readUInt16BE(0)+2) return
      try { finish(null,decodeWire(data.subarray(2,2+data.readUInt16BE(0)),id,host,type,referral)) } catch (error) { finish(error) }
    })
  })
}

export function recordHost(zone, name) {
  if (typeof name !== 'string' || name.length > 253) throw domainError('Nome DNS inválido.')
  const host = name.trim().toLowerCase().replace(/\.$/,'')
  if (host === '@' || host === zone) return zone
  if (!/^(?:[a-z0-9_*-]+\.)*[a-z0-9_*-]+$/.test(host) || host.split('.').some(x => x.length > 63 || (x.includes('*') && x !== '*'))) throw domainError('Nome DNS inválido.')
  const final = host.endsWith('.'+zone) ? host : host + '.' + zone
  if (final.length > 253) throw domainError('Endereço DNS muito longo.')
  return final
}
export async function dnsDiagnostics(zone, {host = zone, type = 'NS', mode = 'record'} = {}, { fetchImpl = fetch, direct = queryAuthoritative } = {}) {
  zone = domainHost(zone)
  if (host !== zone && !host.endsWith('.'+zone)) throw domainError('Endereço fora da zona.')
  if (!TYPES[type] || !Object.hasOwn(TYPES,type)) throw domainError('Tipo DNS não suportado.')
  const byGoogle = (name,kind) => lookup(SOURCES[0],name,kind,fetchImpl)
  const parent = zone.split('.').slice(1).join('.')
  async function directRows(nsHost, queryName, queryType, referral) {
    const ns = await byGoogle(nsHost,'NS')
    const servers = ns.values.filter(name => /^[a-z0-9.-]+$/.test(name)).slice(0,2)
    return Promise.all(servers.map(async (name,index) => {
      const base = { id: (referral ? 'parent-' : 'authority-')+index, label:(referral ? 'Registro pai · ' : 'Autoritativo · ')+name }
      try {
        const nsAddress = await byGoogle(name,'A')
        const ip = nsAddress.values.find(publicIPv4)
        if (!ip) throw new Error()
        return {...base, ...await direct(ip,queryName,queryType,referral)}
      } catch { return {...base,state:'unavailable',values:[],ttl:null} }
    }))
  }
  const delegated = mode === 'servers'
  const [publicSources,authority,website] = await Promise.all([
    Promise.all(SOURCES.map(source => lookup(source,host,type,fetchImpl))),
    directRows(delegated ? parent : zone,host,type,delegated),
    delegated ? Promise.all(['A','AAAA'].map(async kind => ({type:kind,...await byGoogle(zone,kind)}))) : undefined
  ])
  return {host,type,checkedAt:new Date().toISOString(),sources:[...authority,...publicSources],website}
}
