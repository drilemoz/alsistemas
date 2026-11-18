import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const html = source('../public/index.html')
const app = source('../public/app.js')
const hosting = source('../public/hosting.js')

test('cada botão de informação tem tópico, rótulo e maneira acessível de abrir', () => {
  const topics = new Set([...html.matchAll(/<template data-help-topic="([^"]+)"/g)].map(match => match[1]))
  const buttons = [...html.matchAll(/<button[^>]*data-context-(help|inline)="([^"]+)"[^>]*>/g)]
  assert.equal(topics.size, 11)
  assert.equal(buttons.length, topics.size + 1)
  for (const [button, type, topic] of buttons) {
    assert.ok(topics.has(topic), topic)
    assert.match(button, /aria-label="[^"]+"/)
    if (type === 'help') assert.match(button, /aria-haspopup="dialog"/)
    else {
      assert.ok(html.includes(`id="help-inline-${topic}"`))
      assert.match(button, /aria-expanded="false"/)
    }
  }
  assert.match(app, /topic.content.cloneNode\(true\)/)
})
test('dados da VPS usam diálogo próprio e publicação usa etapas dentro do mesmo diálogo', () => {
  assert.match(html, /data-open-panel="overview-details" aria-haspopup="dialog"/)
  assert.match(html, /<dialog id="overview-details"[^>]*aria-labelledby="overview-details-title"/)
  const dialog = html.match(/<dialog[^>]*id="project-dialog"[^>]*>[\s\S]*?<\/dialog>/)[0]
  for (const id of ['hosting-domain-open','hosting-domain-details','hosting-detail-back','hosting-zip-help','hosting-upload-progress','hosting-open-site']) {
    assert.ok(dialog.includes(`id="${id}"`), id)
  }
  assert.doesNotMatch(dialog, /<details|<dialog[\s\S]*<dialog/)
  assert.match(hosting, /hpBackToPublish/)
  assert.match(hosting, /!hpInPublication\(\)/)
  assert.match(hosting, /hpPublishScroll/)
})
test('avisos de impacto continuam fora da ajuda opcional', () => {
  const visible = html.split('<template data-help-topic=')[0]
  assert.match(visible, /painel e os sites ficam indisponíveis/)
  assert.match(visible, /Banco de dados e uploads não serão restaurados/)
  assert.match(visible, /ocultação automática não garante remover todos os dados sensíveis/)
  assert.match(visible, /Até 32 MiB/)
  assert.match(visible, /id="apt-toggle"[^>]*aria-expanded="true"/)
})
test('legado substitui expansão de erros, projetos e índices por diálogos', () => {
  const legacy = '../../alsistemas/src/'
  const errors = source(legacy + 'pages/admin/AdminErros.jsx')
  const projects = source(legacy + 'pages/admin/AdminProjetos.jsx')
  const mongo = source(legacy + 'components/admin/infra/AbaMongoDB.jsx')
  assert.match(errors, /<DetailDialog[^>]*title="Detalhes do erro"/)
  assert.match(errors, /<DetailDialog[^>]*title="Ocorrências do erro"/)
  assert.equal((projects.match(/<DetailDialog open=/g) || []).length, 2)
  assert.match(mongo, /<DetailDialog open=\{indicesAbertos\}/)
  assert.doesNotMatch(mongo, /<details/)
})
