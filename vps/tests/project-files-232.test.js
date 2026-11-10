import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8')
const start = html.indexOf('id="page-project-permissions-general"')
const end = html.indexOf('id="page-project-aws"', start)
const page = html.slice(start, end)

test('Arquivos usa um único explorador sem subseções duplicadas', () => {
 assert.ok(start > 0 && end > start)
 assert.match(page, /id="general-project-permissions-title">Arquivos/)
 assert.match(page, /id="explorer-refresh"[^>]*aria-label="Atualizar arquivos"/)
 assert.match(page, /id="explorer-heading">Explorador de arquivos/)
 assert.match(page, /id="general-permissions-php"/)
 assert.match(page, /id="explorer-search"/)
 assert.match(page, /id="explorer-items"/)
 assert.match(page, /id="general-permissions-count"/)
 assert.match(page, /id="general-permissions-allow"/)
 assert.match(page, /id="general-permissions-restore"/)
 assert.doesNotMatch(page, /<details|Escolher arquivos|Escrita temporária para o PHP|Aplicar ou desfazer|Pesquisar nesta pasta|general-permissions-files|general-permissions-save/)
 assert.match(css, /\.explorer-file-select/)
})

test('navegação AWS abre diretamente Arquivos e seleção se mantém entre pastas', () => {
 assert.match(js, /button\.dataset\.projectRoute === 'permissions' \? 'project\/iguatamaonline\/permissions'/)
 assert.match(js, /generalSelectedPaths = new Set\(generalSavedPaths\)/)
 assert.match(js, /generalCatalogPaths\.has\(item\.path\)/)
 assert.match(js, /generalSelectedPaths\.add\(item\.path\)/)
 assert.match(js, /generalSelectedPaths\.delete\(item\.path\)/)
 assert.match(js, /generalSelectedPaths\.size >= 12/)
 assert.match(js, /if \(!isSameProfile\) await api\(`\/api\/projects\/\$\{encodeURIComponent\(name\)\}\/permissions\/profile`/)
 assert.match(js, /const result = await api\(`\/api\/projects\/\$\{encodeURIComponent\(name\)\}\/permissions`, 'POST', \{ mode \}\)/)
 assert.match(js, /if \(mode === 'restore' && !generalActive\) return/)
 assert.match(js, /'general-permissions-php'\)\.disabled = !generalReady \|\| generalBusy \|\| generalActive/)
})
