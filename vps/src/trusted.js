import crypto from 'node:crypto'
import { readJson, writeJson } from './store.js'
import { randomToken } from './security.js'

export const TRUST_MS = 30 * 24 * 60 * 60 * 1000
const HASH = value => crypto.createHash('sha256').update(value).digest('hex')
const valid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
function fresh() {
  const current = readJson('trusted-devices.json')
  return Array.isArray(current?.devices) ? current.devices.filter(d => d && d.expires > Date.now() && typeof d.hash === 'string').slice(-10) : []
}
export function findTrusted(token) {
  if (!valid(token)) return null
  const hashed = HASH(token)
  return fresh().find(d => d.hash === hashed) || null
}
export function rememberDevice(userAgent = '') {
  const token = randomToken()
  const devices = fresh()
  const now = Date.now()
  const device = { id: crypto.randomUUID(), hash: HASH(token), created: now, expires: now + TRUST_MS, label: String(userAgent).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 90) || 'Navegador' }
  devices.push(device)
  // Limite de dispositivos confiáveis; remoção dos mais antigos.
  writeJson('trusted-devices.json', { devices: devices.slice(-5) })
  return { token, device }
}
export function trustedDevices() {
  return fresh().map(({ id, created, expires, label }) => ({ id, created, expires, label }))
}
export function revokeDevice(token) {
  const hashed = valid(token) ? HASH(token) : ''
  const current = fresh()
  const devices = current.filter(d => d.hash !== hashed)
  writeJson('trusted-devices.json', { devices })
  return current.length !== devices.length
}
export function revokeAllDevices() { writeJson('trusted-devices.json', { devices: [] }) }
