import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import { dataPath, readJson, writeJson } from './store.js'

const FILE = 'integrations-spaceship.json'
const KEY_FILE = 'integrations.key'
const API = 'https://spaceship.dev/api'
function key() {
  const file = dataPath(KEY_FILE)
  try {
    const value = fs.readFileSync(file)
    if (value.length !== 32) throw new Error('Chave de integrações inválida')
    return value
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    fs.mkdirSync(dataPath('.'), { recursive: true, mode: 0o700 })
    try { fs.writeFileSync(file, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }) }
    catch (err) { if (err.code !== 'EEXIST') throw err }
    return fs.readFileSync(file)
  }
}
function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const content = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return { iv: iv.toString('base64'), data: content.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}
function decrypt(payload) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8'))
}
export function spaceshipStatus() {
  return { provider: 'spaceship', configured: !!readJson(FILE), capabilities: ['dns:read', 'dns:write'], documentation: 'https://docs.spaceship.dev/' }
}
export function saveSpaceship({ apiKey, apiSecret }) {
  if (typeof apiKey !== 'string' || typeof apiSecret !== 'string' || !apiKey.trim() || !apiSecret.trim() || apiKey.length > 512 || apiSecret.length > 512 || /[\r\n]/.test(apiKey + apiSecret)) throw new Error('API Key e API Secret inválidas')
  writeJson(FILE, encrypt({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }))
  return spaceshipStatus()
}
export function removeSpaceship() {
  try { fs.unlinkSync(dataPath(FILE)) } catch (e) { if (e.code !== 'ENOENT') throw e }
  return spaceshipStatus()
}
export async function spaceshipRequest(endpoint, { fetchImpl = fetch, method = 'GET', payload } = {}) {
  const saved = readJson(FILE)
  if (!saved) throw new Error('Configure a Spaceship primeiro')
  const credentials = decrypt(saved)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetchImpl(`${API}${endpoint}`, { method, headers: { 'X-API-Key': credentials.apiKey, 'X-API-Secret': credentials.apiSecret, Accept: 'application/json', ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: controller.signal, redirect: 'error' })
    if (!response.ok) {
      const explanations = {
        400: 'pedido DNS rejeitado; confira os parâmetros',
        401: 'API Key ou API Secret não autorizadas',
        403: `a chave não possui permissão dnsrecords:${method === 'GET' ? 'read' : 'write'}`,
        404: 'domínio ou zona DNS não encontrados nesta conta',
        422: 'registro DNS recusado; verifique valor, conflitos e TTL',
        429: 'limite de consultas da API atingido; tente novamente mais tarde'
      }
      const detail = explanations[response.status] || (response.status >= 500 ? 'serviço temporariamente indisponível' : 'falha na operação DNS')
      const error = new Error(`Spaceship HTTP ${response.status}: ${detail}`)
      error.status = response.status === 429 ? 429 : 502
      throw error
    }
    if (response.status === 204) return { ok: true }
    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('Spaceship não respondeu em 10 segundos')
      timeout.status = 504
      throw timeout
    }
    if (error.status) throw error
    const unavailable = new Error('Não foi possível conectar à Spaceship; verifique a rede da VPS e tente novamente')
    unavailable.status = 502
    throw unavailable
  } finally { clearTimeout(timer) }
}
export async function listSpaceshipDns(domain, options) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw new Error('Domínio inválido')
  // A API exige take e skip. Uma página de 500 cobre a maioria das zonas;
  // o campo total permite informar ao operador se há registros além dessa página.
  const result = await spaceshipRequest(`/v1/dns/records/${encodeURIComponent(domain)}?take=500&skip=0`, options)
  if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0) {
    const error = new Error('A Spaceship retornou uma lista DNS em formato inesperado')
    error.status = 502
    throw error
  }
  return { items: result.items.slice(0, 500), total: result.total }
}

// 2.0.16: operações DNS conservadoras. A API Spaceship usa PUT (salvar/TTL)
// e DELETE (registro completo), não PATCH por ID. Nunca usar force=true.
const SUPPORTED_DNS = new Set(['A', 'CNAME', 'TXT'])
const PROTECTED_DNS_NAMES = new Set(['@', 'www', 'painel', 'mail', 'smtp', 'imap', 'pop', 'autodiscover', 'migrar', '_dmarc', '_domainkey', '_acme-challenge'])
const DNS_HOST = /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/

function dnsError(message, status = 400) { return Object.assign(new Error(message), { status }) }
function normalizeDnsRecord(raw, { original = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['type', 'name', 'value', 'ttl'].includes(k))) throw dnsError('Campos do registro DNS inválidos')
  const type = String(raw.type || '').trim().toUpperCase()
  const name = String(raw.name || '').trim().toLowerCase()
  if (!SUPPORTED_DNS.has(type)) throw dnsError('Nesta etapa, apenas registros A, CNAME e TXT podem ser gerenciados')
  if (PROTECTED_DNS_NAMES.has(name) || name.startsWith('_acme-challenge.') || name.endsWith('._domainkey')) throw dnsError('Nome protegido por segurança; altere manualmente na Spaceship')
  if (!DNS_HOST.test(name) || name.length > 253) throw dnsError('Nome DNS inválido')
  const value = String(raw.value ?? '').trim()
  if (!value || value.length > 255 || /[\r\n\0]/.test(value)) throw dnsError('Valor DNS inválido ou muito longo')
  if (type === 'A' && net.isIP(value) !== 4) throw dnsError('Registro A exige IPv4 válido')
  if (type === 'CNAME' && (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i.test(value) || value.length > 253)) throw dnsError('CNAME exige um destino DNS válido')
  const ttl = Number(raw.ttl)
  if (!Number.isSafeInteger(ttl) || ttl < 300 || ttl > 86400) throw dnsError('TTL deve estar entre 300 e 86400 segundos')
  return { type, name, value, ttl }
}
function recordField(type) { return type === 'A' ? 'address' : type === 'CNAME' ? 'cname' : 'value' }
function wireRecord(record, includeTtl = true) {
  return { type: record.type, name: record.name, [recordField(record.type)]: record.value, ...(includeTtl ? { ttl: record.ttl } : {}) }
}
function recordValue(raw, type) { return raw[recordField(type)] }
function sameRecord(current, desired) {
  if (String(current.type).toUpperCase() !== desired.type || String(current.name).toLowerCase() !== desired.name) return false
  const value = recordValue(current, desired.type)
  if (typeof value !== 'string') return false
  return desired.type === 'TXT' ? value === desired.value : value.toLowerCase().replace(/\.$/, '') === desired.value.toLowerCase().replace(/\.$/, '')
}
export async function changeSpaceshipDns(domain, command, options = {}) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw dnsError('Domínio inválido')
  if (!command || typeof command !== 'object' || Array.isArray(command) || Object.keys(command).some(k => !['action','record','previous'].includes(k))) throw dnsError('Operação DNS inválida')
  const action = command.action
  if (!['create', 'update_ttl', 'delete'].includes(action)) throw dnsError('Ação DNS não autorizada')
  if (action === 'create' && command.previous !== undefined) throw dnsError('Registro anterior inesperado')
  if (action !== 'create' && command.previous === undefined) throw dnsError('Registro anterior obrigatório')
  const record = normalizeDnsRecord(command.record)
  const previous = action === 'create' ? null : normalizeDnsRecord(command.previous, { original: true })
  if (action !== 'create' && (record.name !== previous.name || record.type !== previous.type || record.value !== previous.value)) throw dnsError('Para alterar tipo, nome ou destino, use a Spaceship diretamente. Aqui a edição altera somente TTL.')
  if (action === 'delete' && record.ttl !== previous.ttl) throw dnsError('Para excluir, confirme o TTL atual do registro')
  if (action === 'update_ttl' && record.ttl === previous.ttl) throw dnsError('O TTL informado é igual ao atual')

  const listing = await listSpaceshipDns(domain, options)
  if (listing.total > listing.items.length) throw dnsError('Zona possui mais de 500 registros; operação bloqueada até haver paginação completa', 409)
  const existing = listing.items.filter(item => item && typeof item === 'object' && sameRecord(item, record))
  const sameName = listing.items.filter(item => String(item?.name || '').toLowerCase() === record.name)
  if (action === 'create') {
    if (existing.length) throw dnsError('Este registro já existe; atualize a consulta antes de continuar', 409)
    if (sameName.some(item => String(item.type).toUpperCase() === 'CNAME' || record.type === 'CNAME')) throw dnsError('CNAME não pode coexistir com registros do mesmo nome', 409)
  } else {
    if (existing.length !== 1 || existing[0]?.group?.type !== 'custom' || Number(existing[0].ttl) !== previous.ttl) throw dnsError('Registro foi alterado, não existe ou não é personalizado. Consulte o DNS novamente.', 409)
  }
  // Exige senha e confirmação via camada HTTP. Este método é invocado somente
  // no endpoint autenticado; não aceita requisições diretas do navegador à API.
  const endpoint = `/v1/dns/records/${encodeURIComponent(domain)}`
  const method = action === 'delete' ? 'DELETE' : 'PUT'
  const payload = action === 'delete' ? [wireRecord(record, false)] : { force: false, items: [wireRecord(record)] }
  await spaceshipRequest(endpoint, { ...options, method, payload })
  return { accepted: true, action, domain, type: record.type, name: record.name, message: 'Alteração aceita pela Spaceship. A propagação DNS pode levar algum tempo.' }
}
