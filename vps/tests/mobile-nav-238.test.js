import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8')
const html = read('index.html'), css = read('style.css'), app = read('app.js'), domains = read('domains.js')
const nav = html.match(/<nav[^>]+class="bottom-nav">[\s\S]*?<\/nav>/)?.[0]
const more = html.match(/<ul class="more-links"[^>]*>[\s\S]*?<\/ul>/)?.[0]

test('Domínios usa o quarto atalho no celular e Atualizar abre o módulo por Mais', () => {
  assert.deepEqual([...nav.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]), ['overview','projects','services','domains'])
  assert.match(nav, /data-tab="domains"[^>]*><svg[^>]*><use href="#i-globe"><\/use><\/svg>Domínios/)
  assert.match(nav, /aria-controls="more-dialog"/)
  assert.match(more, /data-tab="updates"[^>]*><svg[^>]*><use href="#i-updates"/)
  assert.doesNotMatch(more, /data-tab="domains"/)
  assert.match(app, /more-links \[aria-current="page"\]/)
})

test('Outros módulos é uma lista em uma coluna e todos os itens têm ícone', () => {
  const rows = [...more.matchAll(/<li>(.*?)<\/li>/g)]
  assert.equal(rows.length, 7)
  for (const [,row] of rows) assert.match(row, /<button.*data-tab=.*<svg.*<use href="#i-.*<\/button>$/)
  assert.match(css, /\.more-links\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*overflow-y:auto/)
  assert.doesNotMatch(css, /\.more-links\{[^}]*grid-template-columns:1fr 1fr/)
})

test('rodapé móvel reserva espaço uma vez e a lista DNS reutiliza ícones por tipo', () => {
  assert.doesNotMatch(css, /\.workspace\{[^}]*padding-bottom/)
  assert.match(css, /#dashboard:not\(\.hidden\) ~ footer\{padding-bottom:calc/)
  assert.match(html, /class="domain-dns-heading"><svg/)
  assert.match(domains, /emblem\.append\(dnsSvg\(dnsIconForType\(type\)\)\)/)
})
