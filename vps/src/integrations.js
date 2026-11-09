import crypto from 'node:crypto'
import fs from 'node:fs'
import { dataPath, readJson, writeJson } from './store.js'

const FILE = 'integrations-spaceship.json'
const KEY_FILE = 'integrations.key'
const API = 'https://api.spaceship.com'
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
  return { provider: 'spaceship', configured: !!readJson(FILE), capabilities: ['dns:read'], documentation: 'https://docs.spaceship.dev/' }
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
export async function spaceshipRequest(endpoint, { fetchImpl = fetch } = {}) {
  const saved = readJson(FILE)
  if (!saved) throw new Error('Configure a Spaceship primeiro')
  const credentials = decrypt(saved)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetchImpl(`${API}${endpoint}`, { headers: { 'X-API-Key': credentials.apiKey, 'X-API-Secret': credentials.apiSecret, Accept: 'application/json' }, signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`Spaceship retornou HTTP ${response.status}`)
    return await response.json()
  } finally { clearTimeout(timer) }
}
export async function listSpaceshipDns(domain, options) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) throw new Error('Domínio inválido')
  return spaceshipRequest(`/v1/dns/records/${encodeURIComponent(domain)}`, options)
}
