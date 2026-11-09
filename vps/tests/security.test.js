import test from 'node:test'
import assert from 'node:assert/strict'
import { base32, totp, verifyTotp, hashPassword, verifyPassword, strongPassword } from '../src/security.js'

test('TOTP RFC 6238 / SHA-1 e janela curta', () => {
  const secret = base32(Buffer.from('12345678901234567890'))
  assert.equal(totp(secret, 59000), '287082')
  assert.ok(verifyTotp(secret, '287082', 59000))
  assert.ok(!verifyTotp(secret, '287082', 1800000))
  assert.ok(!verifyTotp(secret, 'abcde6', 59000))
})
test('scrypt: senha correta, erro e formato inválido', () => {
  const hash = hashPassword('Senha#123456789')
  assert.ok(verifyPassword('Senha#123456789', hash))
  assert.ok(!verifyPassword('errada', hash))
  assert.ok(!verifyPassword('', 'fake'))
  assert.ok(strongPassword('Senha#123456789'))
  assert.ok(!strongPassword('fraca123'))
})
