import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
const js=fs.readFileSync(new URL('../public/integrations.js',import.meta.url),'utf8')
test('formulários DNS exibem revisão e confirmação sem senha',()=>{
  for (const id of ['spaceship-add-record','spaceship-change-dialog','spaceship-change-form','spaceship-confirm-dialog','spaceship-confirm-form','spaceship-change-summary']) assert.match(html,new RegExp(`id="${id}"`))
  assert.doesNotMatch(html.split('id="spaceship-confirm-form"')[1].split('</form>')[0],/name="password"|name="otp"/)
  assert.match(js,/\/api\/integrations\/spaceship\/dns\/change/)
  assert.match(js,/spaceshipDnsTotal > records.length/)
  assert.doesNotMatch(js,/\.innerHTML\s*=|insertAdjacentHTML/)
})
test('ajuda documenta write e proteções',()=>{
  assert.match(html,/dnsrecords:write/)
  assert.match(html,/nomes essenciais são protegidos/i)
})
