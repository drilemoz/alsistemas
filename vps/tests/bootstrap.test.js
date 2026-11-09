import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const script = path.join(root, 'inicio-termux.sh')

test('início Termux imprime ajuda sem precisar de SSH, sudo ou chave', () => {
  const out = spawnSync('bash', [script, '--help'], { encoding:'utf8', timeout:5000 })
  assert.equal(out.status, 0)
  assert.match(out.stdout, /--host/)
  assert.match(out.stdout, /--existing/)
  assert.match(out.stdout, /--yes/)
})

test('início Termux recusa parâmetros e destinos inseguros antes do envio', () => {
  const cases = [ ['--host', '127.0.0.1;whoami'], ['--host','127.0.0.1','--user','ubuntu;id'], ['--host','127.0.0.1','--ssh-port','-1'], ['--host','127.0.0.1','--unknown'] ]
  for (const args of cases) {
    const out = spawnSync('bash', [script,...args], { encoding:'utf8', timeout:5000 })
    assert.notEqual(out.status, 0, args.join(' '))
  }
})
