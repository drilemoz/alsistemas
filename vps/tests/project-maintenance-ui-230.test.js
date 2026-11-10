import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8')
function screen(id) {
  const start = html.indexOf(`id="page-project-${id}"`)
  const end = html.indexOf('<section class="tab-page hidden project-page"', start + 1)
  return html.slice(start, end === -1 ? undefined : end)
}
test('quatro seções têm ajuda contextual real e botões funcionais', () => {
  for (const page of ['permissions', 'updates', 'backups', 'logs']) {
    const markup = screen(page)
    assert.match(markup, new RegExp(`data-project-help="external-${page}-info-dialog"`))
    assert.match(html, new RegExp(`id="external-${page}-info-dialog"`))
  }
  assert.match(js, /querySelectorAll\('\[data-project-help\]'\)/)
  assert.match(js, /dataset\.projectHelp\)\.showModal\(\)/)
  assert.match(css, /\.project-feature-icon\.tone-alert/)
})
test('permissões não repetem três botões para o mesmo destino', () => {
  const page = screen('permissions')
  assert.match(page, /id="external-allow"/)
  assert.doesNotMatch(page, /id="external-(?:preview-permissions|restore-permissions)"/)
  assert.match(js, /\$\('external-allow'\)\.addEventListener/)
  assert.match(html, /id="general-permissions-restore"/)
  assert.match(html, /id="general-permissions-allow"/)
})
test('atualizador mantém ZIP, GitHub e progresso com seleção visível', () => {
  const page = screen('updates')
  for (const id of ['external-zip', 'external-zip-name', 'external-upload','external-repo','external-github', 'external-current-version','external-update-summary']) {
    assert.match(page, new RegExp(`id="${id}"`))
  }
  assert.match(page, /data-project-route="progress"/)
  assert.match(js, /function projectUpdateStageLabel/)
})
test('backups têm ações distintas e restauração depende de seleção', () => {
  const page = screen('backups')
  for (const id of ['external-backup-code', 'external-backups', 'external-restore-code']) assert.match(page, new RegExp(`id="${id}"`))
  assert.match(js, /'external-backups'\)\.addEventListener\('change'/)
  assert.match(js, /'external-restore-code'\)\.disabled = !select\.value/)
})
test('histórico acessível não mistura JSON técnico à lista principal', () => {
  const page = screen('logs')
  assert.match(page, /id="external-log-events"/)
  assert.match(page, /id="external-log-current"/)
  assert.doesNotMatch(page, /id="external-report-text"/)
  assert.match(html, /id="external-technical-report-dialog"/)
  assert.match(html, /id="external-report-text"/)
  assert.match(html, /id="external-download-report"/)
  assert.match(js, /function renderProjectAuditEvent/)
  assert.match(js, /eventsArea\.append\(renderProjectAuditEvent\(ev\)\)/)
  assert.doesNotMatch(js, /eventsArea\.innerHTML/)
})
