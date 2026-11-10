import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const app = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'vps/public/style.css'), 'utf8')

test('projetos e manutenção da AWS são páginas e não diálogos longos', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1])
  assert.equal(new Set(ids).size, ids.length, 'IDs duplicados')
  for (const id of ['page-project-detail', 'page-project-aws', 'page-project-diagnostics', 'page-project-permissions', 'page-project-updates', 'page-project-backups', 'page-project-logs', 'page-project-progress']) {
    assert.match(html, new RegExp(`<section[^>]*class="[^"]*tab-page[^"]*"[^>]*id="${id}"`), id)
  }
  assert.doesNotMatch(html, /id="(?:project-details-dialog|external-project-dialog)"/)
  assert.match(html, /id="external-auth-dialog"/)
  assert.match(html, /data-project-route="diagnostics"/)
  assert.match(html, /data-project-route="permissions"/)
  assert.match(html, /data-project-route="updates"/)
  assert.match(html, /data-project-route="backups"/)
  assert.match(html, /data-project-route="logs"/)
  assert.match(html, /id="external-report-text"/)
  assert.match(css, /\.project-update-grid/)
  assert.match(css, /\.project-tool-list/)
})

test('rotas de manutenção da AWS não apontam para outros projetos externos', () => {
  const routeCode = app.match(/^function validAppRoute\(route\) \{[\s\S]*?^\}/m)?.[0]
  assert.ok(routeCode, 'função de validação de rota')
  const context = vm.createContext({})
  const validate = vm.runInContext(`
    const mainTabs = new Set(['overview','projects'])
    const projectSections = new Set(['diagnostics','permissions','updates','backups','logs','progress'])
    ${routeCode}
    validAppRoute
  `, context)
  for (const path of ['projects', 'project/iguatamaonline', 'project/iguatamaonline/aws', 'project/iguatamaonline/aws/diagnostics', 'project/iguatamaonline/aws/progress', 'project/Portal_2026']) {
    assert.equal(validate(path), true, path)
  }
  for (const path of ['project/outro/aws', 'project/outro/aws/permissions', 'project/iguatamaonline/aws/exec', 'project/../../aws', 'project/.hidden', 'project/iguatamaonline/aws/logs/../permissions']) {
    assert.equal(validate(path), false, path)
  }
})

test('diálogo de ação crítica confirma sem campos de credenciais', () => {
  const dialogStart = html.indexOf('<dialog id="external-auth-dialog"')
  const dialogEnd = html.indexOf('</dialog>', dialogStart)
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart)
  assert.equal(html.includes('id="external-password"'), false)
  assert.ok(!html.slice(dialogStart, dialogEnd).includes('id="external-otp"'))
  assert.match(app, /requestExternalConfirmation\('Atualizar pelo GitHub'/)
  assert.match(app, /requestExternalConfirmation\('Atualizar pelo ZIP'/)
  assert.match(app, /requestExternalConfirmation\(label, detail\)/)
  assert.match(app, /window\.addEventListener\('popstate'/)
  assert.match(app, /history\.pushState/)
  assert.match(app, /function loadExternalReport\(/)
  assert.match(app, /function externalFileUpdate\(/)
})
