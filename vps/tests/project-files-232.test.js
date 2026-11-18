import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
const js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
const start = html.indexOf('id="page-project-permissions-general"')
const end = html.indexOf('id="page-project-aws"', start)
const page = html.slice(start, end)
const popup = id => html.match(new RegExp('<dialog id="' + id + '"[\\s\\S]*?</dialog>'))?.[0]

test('Arquivos tem busca e atualização no título e não exibe os controles temporários', () => {
 assert.ok(start > 0 && end > start)
 assert.match(page, /<header[^>]*>.*id="general-project-permissions-title">Arquivos.*id="explorer-refresh".*id="general-permissions-info-open".*<\/header>/)
 assert.match(page, /id="explorer-search"/)
 assert.match(page, /id="explorer-items"/)
 assert.doesNotMatch(page, /Explorador de arquivos|Marque os arquivos elegíveis|id="general-permissions-(php|count|allow|restore)"/)
 assert.match(popup('general-permissions-info-dialog'), /data-open-panel="general-permissions-write-dialog"/)
 for (const id of ['php','allow','restore','selected','match']) assert.match(popup('general-permissions-write-dialog'), new RegExp('id="general-permissions-' + id + '"'))
})

test('escrita temporária depende de catálogo, preserva perfil e permite restaurar sem catálogo', () => {
 assert.match(js, /button\.dataset\.projectRoute === 'permissions' \? 'project\/iguatamaonline\/permissions'/)
 assert.match(js, /generalSelectedPaths = new Set\(generalSavedPaths\)/)
 assert.match(js, /generalSelectedPaths\.add\(path\)/)
 assert.match(js, /generalSelectedPaths\.delete\(path\)/)
 assert.match(js, /if \(!isSameProfile\) await api\(endpoint \+ '\/profile', 'POST', \{ files, phpUser \}\)/)
 assert.match(js, /await api\(endpoint, 'POST', \{ mode \}\)/)
 assert.match(js, /if \(mode === 'restore' && !generalActive\) return/)
 assert.match(js, /general-permissions-restore'\)\.disabled = generalBusy \|\| !generalReady \|\| !generalActive/)
})
