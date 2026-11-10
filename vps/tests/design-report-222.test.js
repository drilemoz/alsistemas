import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')
const updater = fs.readFileSync(path.join(root, 'vps/admin/updater.py'), 'utf8')
const projectUpdater = fs.readFileSync(path.join(root, 'vps/admin/project_updater.py'), 'utf8')

test('login, seletor de arquivos e ficha técnica receberam a nova interface', () => {
  for (const id of ['project-tech-dialog', 'project-tech-open', 'project-directory-open', 'project-diagnostics-info-open', 'update-file-trigger', 'update-file-name', 'external-zip-trigger', 'external-zip-name']) {
    assert.match(html, new RegExp(`id="${id}"`), id)
  }
  assert.match(html, /Ficha técnica/)
  assert.doesNotMatch(html, /id="project-tech-shortcut"/, 'atalho redundante removido')
  assert.match(html, /id="project-hero-title-row"|class="project-hero-title-row"/)
  assert.match(css, /\.password-toggle\{[^}]*top:50%[^}]*translateY\(-50%\)/s)
  assert.match(css, /\.custom-file-picker\{/)
  assert.match(css, /\.project-tech-dialog\{/)
  assert.match(js, /function syncFilePicker\(/)
  assert.match(js, /project-tech-open/)
  assert.doesNotMatch(js, /project-tech-shortcut/)
  assert.match(js, /project-tech-dialog'\)\.showModal\(\)/)
})

test('relatórios de falha agora tentam reunir mais contexto do atualizador', () => {
  assert.match(js, /append\('Diagnóstico de saúde', state\?\.healthDiagnostics\)/)
  assert.match(js, /append\('Retorno do instalador', state\?\.installerExitCode\)/)
  assert.match(js, /append\('Saída do instalador', state\?\.installerStderrTail\)/)
  assert.match(updater, /healthDiagnostics/)
  assert.match(updater, /installerStderrTail/)
  assert.match(updater, /sha256Prefix/)
  assert.match(projectUpdater, /sha256Prefix/)
  assert.match(projectUpdater, /errorType/)
})
