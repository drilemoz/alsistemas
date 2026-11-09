import crypto from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(bytes) {
  let bits = 0; let n = 0; let result = ''
  for (const byte of bytes) {
    n = (n << 8) | byte; bits += 8
    while (bits >= 5) { result += alphabet[(n >>> (bits -= 5)) & 31] }
  }
  if (bits) result += alphabet[(n << (5 - bits)) & 31]
  return result
}
function fromBase32(str) {
  let bits = 0; let n = 0; const arr = []
  for (const char of str.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(char)
    if (idx < 0) return Buffer.alloc(0)
    n = (n << 5) | idx; bits += 5
    if (bits >= 8) { bits -= 8; arr.push((n >>> bits) & 255) }
  }
  return Buffer.from(arr)
}
export function totp(secret, at = Date.now()) {
  const key = fromBase32(secret)
  if (key.length < 16) throw new Error('Segredo TOTP inválido')
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)))
  const hmac = crypto.createHmac('sha1', key).update(counter).digest()
  const offset = hmac[19] & 15
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0')
}
export function matchingTotpStep(secret, candidate, at = Date.now()) {
  if (typeof candidate !== 'string' || !/^\d{6}$/.test(candidate)) return null
  try {
    for (const delta of [-30000, 0, 30000]) {
      if (constantEquals(totp(secret, at + delta), candidate)) return Math.floor((at + delta) / 30000)
    }
  } catch { /* código ou segredo inválido */ }
  return null
}
export function verifyTotp(secret, candidate, at = Date.now()) {
  return matchingTotpStep(secret, candidate, at) !== null
}
export function constantEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a); const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  return `scrypt$${salt}$${key}`
}
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false
  const [algo, salt] = encoded.split('$')
  if (algo !== 'scrypt' || !/^[0-9a-f]{32}$/.test(salt || '')) return false
  return constantEquals(hashPassword(password, salt), encoded)
}
export const strongPassword = (v) => typeof v === 'string' && v.length >= 12 && v.length <= 256 && /[A-Za-z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)
export const randomToken = () => crypto.randomBytes(32).toString('hex')
