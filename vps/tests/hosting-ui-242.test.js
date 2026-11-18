import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = name => fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8')
const html = read('index.html'), ui = read('hosting.js'), app = read('app.js')
const panel = html.slice(html.indexOf('id="project-dialog"'),html.indexOf('id="page-services"'))
test('revisão, upload e DNS reutilizam a mesma janela sem confirmação sobreposta', () => {
  for (const id of ['hosting-wizard','hosting-review','hosting-publish','hosting-dns-results','hosting-upload-result']) assert.ok(panel.includes('id="'+id+'"'))
  assert.doesNotMatch(html,/id="managed-(?:hosting|upload)-dialog"/)
  assert.doesNotMatch(ui,/confirmAction\(|openDnsResult\(/)
  assert.match(ui,/keepPopup:'project-dialog'/)
  assert.match(app,/closePanelPopups\(keepPopup\)/)
})
test('upload tem seletor controlado e botão real para abrir o resultado', () => {
  assert.match(panel,/<input type="file"[^>]*id="hosting-file"[^>]*hidden>/)
  assert.match(panel,/<a class="button-link" id="hosting-open-site"[^>]*target="_blank"/)
  assert.match(ui,/Validando e publicando na VPS/)
  assert.match(ui,/Publicação concluída/)
  assert.match(ui,/Publicação concluída','success'/)
  assert.match(ui,/tls\?\.state === 'active' \? 'https:\/\/' : 'http:\/\/'/)
  assert.match(ui,/url\.searchParams\.set\('v',String\(version\)\)/)
})
