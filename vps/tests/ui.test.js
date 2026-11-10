import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')

test('modais funcionais: projetos, configurações GitHub, tema e mais módulos', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1])
  assert.equal(new Set(ids).size, ids.length, 'IDs duplicados na interface')
  for (const id of ['project-dialog', 'repo-dialog', 'theme-dialog', 'more-dialog', 'new-project', 'repo-settings']) assert.ok(ids.includes(id), id)
  assert.match(html, /<dialog[^>]+id="project-dialog"/)
  assert.match(html, /<dialog[^>]+id="repo-dialog"/)
  assert.match(html, /<dialog[^>]+id="theme-dialog"/)
  assert.match(js, /'project-dialog'\)\.showModal\(\)/)
  assert.match(js, /'repo-dialog'\)\.showModal\(\)/)
  assert.match(js, /'project-dialog'\)\.close\(\)/)
  assert.match(js, /'repo-dialog'\)\.close\(\)/)
  assert.match(css, /\.close-right/)
  assert.match(css, /\.stat-label/)
  assert.equal(html.includes('id="theme"'), false, 'seletor antigo de tema não deve reaparecer')
})

test('tutorial é idêntico no ZIP e webroot e tem índice navegável', () => {
  const rootDoc = fs.readFileSync(path.join(root, 'tutorial-instalacao.html'), 'utf8')
  const published = fs.readFileSync(path.join(root, 'vps/public/tutorial-instalacao.html'), 'utf8')
  assert.equal(rootDoc, published)
  assert.match(rootDoc, /id="rapido"/)
  assert.match(rootDoc, /index-grid/)
  assert.match(rootDoc, /inicio-termux.sh/)
  assert.match(rootDoc, /id="indice"/)
})

test('manutenção externa não solicita senha ou TOTP após o login', () => {
  const dialog = html.slice(html.indexOf('id="external-auth-dialog"'), html.indexOf('id="project-dialog"'))
  assert.doesNotMatch(dialog, /external-password|Senha do AL Sistemas/)
  assert.doesNotMatch(dialog, /id="external-otp"|name="password"/)
  assert.doesNotMatch(js, /external-password|X-Update-Password|X-Update-Otp/)
  assert.match(js, /resolve\(true\)/)
})


test('login aceita preenchimento automático e impede OTP oculto no FormData', () => {
  const passwordInput = html.match(/<input[^>]+id="login-password"[^>]*>/)?.[0] || ''
  assert.match(passwordInput, /autocomplete="current-password"/)
  assert.match(passwordInput, /name="password"/)
  assert.match(js, /e\.currentTarget\.elements\.namedItem\('password'\)\.value/)
  assert.match(js, /senha salva, confira se ela corresponde à\s+senha/i)
  const start = js.indexOf('function setTrustedLogin(enabled)')
  const end = js.indexOf('for (const button of document.querySelectorAll(\'.password-toggle\'))', start)
  assert.ok(start >= 0 && end > start)
  const code = js.slice(start, end)
  const elements = Object.fromEntries(['login-otp', 'trust-device', 'login-otp-row', 'trusted-note'].map(id => [id, {
    disabled: false, required: true, checked: true, value: 'antigo',
    classList: { toggle: () => {} }
  }]))
  const setTrustedLogin = new Function('$', code + '\nreturn setTrustedLogin')((id) => elements[id])
  setTrustedLogin(true)
  assert.equal(elements['login-otp'].disabled, true)
  assert.equal(elements['login-otp'].required, false)
  assert.equal(elements['login-otp'].value, '')
  assert.equal(elements['trust-device'].disabled, true)
  assert.equal(elements['trust-device'].checked, false)
  setTrustedLogin(false)
  assert.equal(elements['login-otp'].disabled, false)
  assert.equal(elements['login-otp'].required, true)
  assert.equal(elements['trust-device'].disabled, false)
})
