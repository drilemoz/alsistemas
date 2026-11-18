import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url),'utf8')
const html = read('index.html'), app = read('app.js'), domains = read('domains.js')
const dialog = id => html.match(new RegExp('<dialog id="' + id + '"[\\s\\S]*?</dialog>'))?.[0]

test('todas as opções de Domínios abrem janelas e ajustes avançados não expandem na página', () => {
 for (const p of ['dns','pointer','redirect','settings']) {
  assert.match(dialog('dn-pane-'+p), /data-panel-popup/)
  assert.match(html,new RegExp('data-domain-pane="' + p + '"[^>]+aria-haspopup="dialog"'))
 }
 for (const p of ['rule','test','ns']) assert.match(dialog('dn-'+p+'-dialog'), /data-panel-popup/)
 assert.doesNotMatch(html,/<details\b/)
 assert.match(domains,/dialog\.showModal\(\)/)
 assert.match(domains,/pane === 'dns'\) void dnLoadDns\(\)/)
})

test('propriedades não são fechadas ao confirmar e mostram resultado separado', () => {
 const save = app.slice(app.indexOf("$('explorer-mode-save').addEventListener"), app.indexOf('// Escrita temporária no pop-up de ajuda.'))
 assert.match(save,/await confirmAction/)
 assert.match(save,/explorerModeFeedback/)
 assert.doesNotMatch(save,/\.close\(|notice\(/)
 assert.match(dialog('explorer-mode-result-dialog'), />OK<\/button>/)
 assert.match(app,/modeBlockedReason/)
})

test('diagnóstico mostra resumo e deixa informações e consultas nas janelas', () => {
 for (const [p, content] of [['info','MariaDB'],['details','project-insights-details'],['sites','project-insights-sites'],['http','project-probe-run'],['aws','project-insights-aws-content']]) {
  assert.match(dialog('project-insights-'+p+'-dialog'), new RegExp(content))
 }
 const page = html.slice(html.indexOf('id="page-project-insights"'),html.indexOf('id="page-project-backup-center"'))
 assert.match(page,/project-insights-summary/)
 assert.doesNotMatch(page,/projeto não|HTTPS configurado|project-probe-output/)
})
