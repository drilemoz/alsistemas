import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')
const installer = fs.readFileSync(path.join(root, 'instalar.sh'), 'utf8')

test('Notas e README em diálogos sem repetir a Release na página', () => {
  assert.match(html, /id="update-release-help"[^>]*>\?<\/button>/)
  assert.match(html, /<dialog[^>]+id="update-release-dialog"/)
  assert.match(html, /<dialog[^>]+id="update-readme-dialog"/)
  assert.doesNotMatch(html, /id="update-notes"/)
  assert.match(js, /'update-release-dialog'\)\.showModal\(\)/)
  assert.match(js, /'update-readme-dialog'\)\.showModal\(\)/)
  assert.match(js, /\.textContent = readme/)
})

test('Ações de atualizar GitHub, ZIP e andamento permanecem em uma linha compacta', () => {
  assert.match(html, /id="apply-update"[^>]*>GitHub<\/button>/)
  assert.match(html, /id="upload-update"[^>]*>Arquivo ZIP<\/button>/)
  assert.match(html, /id="view-update-progress"[^>]*>Andamento<\/button>/)
  assert.match(css, /\.update-actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(css, /\.update-actions button\{min-width:0/)
})

test('Relatório do erro em diálogo com cópia e download, disponível em falhas', () => {
  for (const id of ['update-report-dialog','update-report-open','update-report-text','update-report-copy','update-report-download']) assert.ok(html.includes(`id="${id}"`), id)
  assert.match(js, /function composeUpdateReport\(state\)/)
  assert.match(js, /navigator\.clipboard\.writeText\(latestUpdateReport\)/)
  assert.match(js, /new Blob\(\[latestUpdateReport/)
  assert.match(js, /update-report-open'\)\.classList\.toggle/)
  assert.match(js, /httpStatus = xhr\.status/)
})

test('O instalador não libera todo o painel para uploads grandes', () => {
  assert.match(installer, /client_max_body_size 64k/)
  assert.match(installer, /location = \/api\/updates\/upload[\s\S]*?client_max_body_size 32m/)
  assert.match(installer, /location = \/api\/projects\/iguatamaonline\/update\/upload[\s\S]*?client_max_body_size 32m/)
  assert.match(installer, /nginx_upload\.py/)
})
