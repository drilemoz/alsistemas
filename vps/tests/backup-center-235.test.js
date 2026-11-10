import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const ui = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const server = fs.readFileSync(path.join(root, 'vps/src/server.js'), 'utf8')

test('central de backups é por projeto e não promete banco de dados', () => {
  for (const id of ['page-project-backup-center','project-backup-center-title','project-backup-center-list','project-backup-center-scopes']) {
    assert.ok(html.includes(`id="${id}"`), id)
  }
  assert.match(ui, /project\/\$\{item\.name\}\/backup-center/)
  assert.match(ui, /function loadProjectBackupCenter\(name\)/)
  assert.match(ui, /Backup e restauração SQL ainda não estão implementados/)
  assert.match(ui, /b\.name === name && b\.scope === 'public-only'/)
  assert.match(ui, /project\/iguatamaonline\/aws\/backups/)
})

test('verificação de SHA-256 usa rota autenticada por projeto, sem arquivo arbitrário', () => {
  assert.match(server, /const projectBackupRoute = /)
  assert.match(server, /action: 'verify_backup'/) // corrected below if action syntax changes
  assert.match(server, /'backup-verify'/)
  assert.match(ui, /backups\/verify`, 'POST', \{ archive: backup\.archive \}/)
  assert.match(ui, /restauração não foi testada/)
})
