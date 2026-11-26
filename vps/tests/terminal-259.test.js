import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import fs from 'node:fs'
import {createTerminalManager} from '../src/terminal.js'
class FakeSocket extends EventEmitter {
  writableLength=0;written=[];destroyed=false
  write(s){this.written.push(s);return true}
  destroy(){this.destroyed=true}
}
test('terminal owner, streaming UTF8, output cursor, input, logout and expiration', async()=>{
  let time=1000, active=true, socket
  const m=createTerminalManager({connect:()=>{socket=new FakeSocket();queueMicrotask(()=>socket.emit('connect'));return socket},isSessionActive:()=>active,now:()=>time})
  try{
    const {id}=await m.open('one',99999999)
    assert.equal((await m.open('one',99999999)).id,id)
    assert.throws(()=>m.poll('two',id,0),{status:404})
    assert.throws(()=>m.input('two',id,'id\n'),{status:404})
    const b=Buffer.from('olá\n');socket.emit('data',b.subarray(0,3));socket.emit('data',b.subarray(3))
    const first=m.poll('one',id,0);assert.equal(first.output,'olá\n');assert.equal(m.poll('one',id,first.cursor).output,'')
    assert.throws(()=>m.poll('one',id,first.cursor+1),{status:400})
    m.input('one',id,'printf hi\n');m.input('one',id,'\x03');assert.deepEqual(socket.written,['printf hi\n','\x03'])
    assert.throws(()=>m.input('one',id,'x'.repeat(4097)),{status:400})
    socket.emit('data',Buffer.alloc(300000,97));assert.equal(m.poll('one',id,0).truncated,true);assert.equal(m.poll('one',id,0).output.length,262144)
    time+=600001;assert.equal(m.poll('one',id,0).closed,true);assert.equal(socket.destroyed,true)
    const second=await m.open('one',99999999);active=false;assert.equal(m.poll('one',second.id,0).closed,true)
  }finally{m.dispose()}
})
test('terminal closes on logout and revocation and handles connection failure',async()=>{
  let socket,fail=false
  const m=createTerminalManager({connect:()=>{socket=new FakeSocket();queueMicrotask(()=>socket.emit(fail?'error':'connect',new Error('test')));return socket},isSessionActive:()=>true})
  try{
    const a=await m.open('a',Date.now()+900000);m.closeOwner('a');assert.equal(m.poll('a',a.id,0).closed,true)
    const b=await m.open('b',Date.now()+900000);m.closeAll();assert.equal(m.poll('b',b.id,0).closed,true)
    fail=true;await assert.rejects(m.open('c',Date.now()+900000),{status:503})
  }finally{m.dispose()}
})
test('terminal global, protected by HTTPS, isolated service and no sudo expansion',()=>{
  const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8')
  const s=read('../src/server.js'), h=read('../public/index.html'), u=read('../systemd/alsistemas-terminal@.service'), socket=read('../systemd/alsistemas-terminal.socket')
  assert.match(s,/if \(!origin.startsWith\('https:\/\/'\)\) return fail\(res,403/)
  assert.match(s,/terminal.closeOwner\(sess.key\)/);assert.match(s,/terminal.closeAll\(\)/)
  assert.equal((h.match(/data-tab="terminal"/g)||[]).length,2)
  assert.match(u,/DynamicUser=yes/);assert.match(u,/NoNewPrivileges=yes/);assert.match(u,/ProtectSystem=strict/);assert.match(u,/InaccessiblePaths=.*\/var\/lib\/alsistemas/)
  assert.match(socket,/SocketMode=0600/);assert.match(socket,/Accept=yes/)
  assert.match(read('../public/app.js'),/out.textContent=terminalText/)
})
