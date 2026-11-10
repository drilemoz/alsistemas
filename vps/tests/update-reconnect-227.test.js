import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { base32, hashPassword, totp } from '../src/security.js'
import crypto from 'node:crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const html = fs.readFileSync(path.join(root, 'vps/public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'vps/public/app.js'), 'utf8')

// Executa a mesma função que o navegador usa; captura ReferenceError e erros de UI.
test('nome/tamanho do ZIP são mostrados e o botão depende de seleção válida', () => {
  const start = js.indexOf('function formatBytes(size) {')
  const end = js.indexOf('for (const [buttonId, inputId]', start)
  assert.ok(start > -1 && end > start)
  const pieces = {
    'update-file-input': { files: [] }, 'update-file-name': { textContent: '', classList: { toggle() {} } },
    'external-zip': { files: [] }, 'external-zip-name': { textContent: '', classList: { toggle() {} } },
    'update-submit': { disabled: false }, 'external-upload': { disabled: false }
  }
  const mod = new Function('$', `let updateMethod='file'; let externalUploading=false; ${js.slice(start, end)}; return {formatBytes,syncFilePicker}`)(id => pieces[id])
  assert.equal(mod.formatBytes(2 * 1024 * 1024), '2.00 MiB')
  mod.syncFilePicker('update-file-input', 'update-file-name')
  assert.equal(pieces['update-submit'].disabled, true)
  pieces['update-file-input'].files = [{name:'AL-Sistemas-v2.0.27-VPS.zip', size:1_500_000}]
  mod.syncFilePicker('update-file-input', 'update-file-name')
  assert.match(pieces['update-file-name'].textContent, /AL-Sistemas-v2\.0\.27-VPS\.zip · 1\.43 MiB · Pronto para enviar/)
  assert.equal(pieces['update-submit'].disabled, false)
  pieces['external-zip'].files = [{name:'iguatamaonline.zip', size:4096}]
  mod.syncFilePicker('external-zip', 'external-zip-name')
  assert.match(pieces['external-zip-name'].textContent, /iguatamaonline\.zip/)
  pieces['external-zip'].files = [{name:'arquivo.txt', size:1000}]
  mod.syncFilePicker('external-zip', 'external-zip-name')
  assert.equal(pieces['external-upload'].disabled, true)
})

test('seletor ZIP mobile usa label separada do botão e progresso mostra estado de conexão', () => {
  for (const id of ['update-file-label', 'external-zip']) assert.ok(html.includes(`id="${id}"`))
  const modal = html.slice(html.indexOf('id="update-file-label"'), html.indexOf('id="update-file-trigger"'))
  assert.match(modal, /<\/label><input[^>]+id="update-file-input"/)
  assert.ok(modal.indexOf('</label>') < modal.indexOf('<button'), 'botão fora do rótulo nativo')
  assert.match(html, /id="update-progress-connection"/)
  assert.match(html, /id="update-progress-file"/)
  assert.match(js, /window\.addEventListener\('focus'/)
  assert.match(js, /document\.addEventListener\('visibilitychange'/)
  assert.match(js, /AbortSignal\.timeout\(timeoutMs\)/)
  assert.match(js, /Última etapa conhecida preservada/)
  assert.match(js, /sessionStorage\.setItem\('als-update-zip'/)
})

async function startApi(dataDir) {
  const src = new URL('../src/server.js', import.meta.url).href
  const code = `import {createServer} from ${JSON.stringify(src)}; const server=createServer(); server.listen(0,'127.0.0.1',()=>console.log('READY:'+server.address().port));`
  const child = spawn(process.execPath, ['--input-type=module','-e',code], {
    env:{...process.env, ALS_DATA_DIR:dataDir, ALS_ORIGIN:'http://localhost:8181'}, stdio:['ignore','pipe','pipe']
  })
  return new Promise((resolve,reject)=>{
    let output=''
    const timeout = setTimeout(()=>{child.kill();reject(new Error('timeout iniciação da API '+output))},6000)
    child.stdout.on('data', chunk => {
      output+=chunk.toString()
      const m=/READY:(\d+)/.exec(output)
      if (m) {clearTimeout(timeout);resolve({child, url:`http://127.0.0.1:${m[1]}`})}
    })
    child.stderr.on('data',chunk=>{output+=chunk.toString()})
    child.once('error',err=>{clearTimeout(timeout);reject(err)})
    child.once('exit',()=>{clearTimeout(timeout);if (!output.includes('READY:')) reject(new Error('API saiu: '+output))})
  })
}
async function stopApi(child) {
  if (child.exitCode !== null) return
  await new Promise(resolve=> { child.once('exit',resolve);child.kill('SIGTERM') })
}

test('sessão, CSRF e autenticação continuam válidos após reinício real do processo', {timeout:20000}, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'als-restart-227-'))
  const secret=base32(crypto.randomBytes(20))
  const password='SenhaValida#ParaTeste227'
  fs.writeFileSync(path.join(tmp,'admin.json'),JSON.stringify({passwordHash:hashPassword(password),totpSecret:secret}),{mode:0o600})
  let api1, api2
  const req=(url, endpoint, method='GET', cookie='',csrf='',body) => fetch(url+endpoint,{
    method,headers:{...(body?{'Content-Type':'application/json',Origin:'http://localhost:8181'}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})}, body:body?JSON.stringify(body):undefined
  })
  try {
    api1=await startApi(tmp)
    const login=await req(api1.url,'/api/login','POST','','',{password,otp:totp(secret)})
    assert.equal(login.status,200)
    const {csrf}=await login.json()
    const cookie=login.headers.get('set-cookie').split(';')[0]
    const disk=fs.readFileSync(path.join(tmp,'sessions.json'),'utf8')
    assert.ok(!disk.includes(cookie.split('=')[1]),'o token de cookie não pode ser persistido em claro')
    assert.equal(fs.statSync(path.join(tmp,'sessions.json')).mode & 0o777,0o600)
    await stopApi(api1.child);api1=null
    api2=await startApi(tmp)
    const session=await req(api2.url,'/api/session','GET',cookie)
    assert.equal(session.status,200,'reinício não deve exigir login novamente')
    assert.equal((await session.json()).csrf,csrf)
    const protectedEndpoint=await req(api2.url,'/api/tasks','POST',cookie,csrf,{action:'sem-permissao'})
    assert.equal(protectedEndpoint.status,400,'CSRF válido continua chegando ao endpoint protegido')
    assert.equal((await req(api2.url,'/api/tasks','POST',cookie,'invalido',{action:'sem-permissao'})).status,403)
    assert.equal((await req(api2.url,'/api/logout','POST',cookie,csrf,{})).status,200)
    assert.equal((await req(api2.url,'/api/session','GET',cookie)).status,401,'logout deve invalidar a sessão persistida')
  } finally {
    if(api1) await stopApi(api1.child)
    if(api2) await stopApi(api2.child)
    fs.rmSync(tmp,{recursive:true,force:true})
  }
})
