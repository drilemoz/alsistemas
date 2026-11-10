import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8')

test('visão geral mantém somente tecnologia, acesso e nginx; ficha ao lado do nome', () => {
  assert.match(html, /class="project-hero-title-row"/)
  assert.match(html, /id="project-tech-open"/)
  assert.doesNotMatch(html, /id="project-tech-shortcut"/)
  assert.doesNotMatch(html, /Domínios e estrutura<\/button>/)
  const summary = js.match(/const summaryItems = \[[\s\S]*?\n  \]/)?.[0]
  assert.ok(summary)
  for (const key of ["'Tecnologia'", "'Acesso'", "'Nginx'"]) assert.ok(summary.includes(key))
  for (const key of ["'Diretório'", "'Domínio principal'"]) assert.ok(!summary.includes(key))
  assert.match(css, /\.project-summary-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
})
test('caminho produção aparece apenas em diálogo Diretório e diagnóstico fica compacto com ajuda', () => {
  assert.match(html, /id="project-directory-open"/)
  assert.match(html, /id="project-directory-dialog"/)
  assert.match(html, /id="project-diagnostics-info-open"/)
  assert.match(html, /id="project-diagnostics-info-dialog"/)
  assert.doesNotMatch(html, /IguatamaOnline · ações restritas ao código de produção/)
  assert.doesNotMatch(html, /Leitura das permissões dos arquivos protegidos, sem alterar dados/)
  assert.match(html, /Esta tela faz uma <strong>análise de leitura<\/strong>/)
  assert.match(js, /function diagnosticCard\(/)
  assert.match(js, /data\.mutationAllowed === false/)
})
test('rotas de permissão externa não se confundem com AWS IguatamaOnline', () => {
  const code = js.match(/^function validAppRoute\(route\) \{[\s\S]*?^\}/m)?.[0]
  assert.ok(code)
  const valid = vm.runInNewContext(`const mainTabs=new Set(['projects']); const projectSections=new Set(['permissions','diagnostics']); ${code}; validAppRoute`)
  for (const route of ['project/site-um/permissions', 'project/iguatamaonline/aws/permissions', 'project/site-um']) assert.equal(valid(route), true)
  for (const route of ['project/iguatamaonline/permissions', 'project/iguatama-teste/aws', 'project/../../permissions', 'project/site-um/permissions/../../etc']) assert.equal(valid(route), false)
})
