import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'vps/public/integrations.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')

test('APIs exibe uma lista compacta com botões Gerenciar e Testar DNS', () => {
  const page = html.split('id="page-integrations"')[1].split('id="page-security"')[0]
  assert.match(page, /class="integration-tile"/)
  assert.match(page, /id="spaceship-open"/)
  assert.match(page, /id="spaceship-open-dns"/)
  assert.doesNotMatch(page, /<form|id="spaceship-results"/, 'não apresentar o formulário nem resultados na lista')
})

test('gerenciamento e teste DNS usam modais diferentes, com campos protegidos', () => {
  assert.match(html, /<dialog id="spaceship-manage-dialog"/)
  assert.match(html, /<dialog id="spaceship-dns-dialog"/)
  for (const name of ['apiKey', 'apiSecret']) {
    assert.match(html, new RegExp(`name="${name}" type="password"`))
  }
  assert.match(js, /Credenciais salvas no servidor/)
  assert.match(js, /Não é necessário preenchê-las novamente/)
  assert.match(js, /resetSpaceshipCredentialForm/)
  assert.match(js, /'spaceship-dns-form'\)\.addEventListener\('submit'/)
  assert.match(css, /\.integration-dialog/)
  assert.match(css, /\.dns-record-card/)
})

test('valores DNS externos são inseridos como texto e não HTML', () => {
  assert.match(js, /value\.textContent = dnsValue\(record\)/)
  assert.match(js, /host\.textContent = String\(record\.name/)
  assert.match(js, /chip\.textContent = type/)
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/)
  assert.match(js, /navigator\.clipboard\.writeText/)
})
