import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {cpuUtilization,hostSites,probeLocalSite,rebootState,hostMaintenance} from '../src/host_dashboard.js'
const id='38bd4f0a-447a-11f1-83e7-624aeb0e1de2', newer='38bd4f0a-447a-11f1-83e7-624aeb0e1de3'
const at=1794960000
test('novo boot é confirmado apenas com outro identificador do kernel',()=>{
  const scheduled={phase:'scheduled',boot:id,requestedAt:at}
  assert.equal(rebootState(scheduled,id,at*1000+2500).state,'scheduled')
  assert.equal(rebootState({...scheduled,phase:'dispatching'},id,at*1000+30000).state,'dispatching')
  assert.equal(rebootState(scheduled,null,at*1000+240001).state,'unconfirmed')
  assert.equal(rebootState(scheduled,newer,at*1000+4000).state,'rebooted')
  assert.equal(rebootState({...scheduled,phase:'blocked',reason:'APT ativo'},newer,at*1000+4000).state,'blocked')
})
test('CPU em percentual usa a diferença dos contadores agregados',()=>{
  const times=(user,idle)=>[{times:{user,idle,nice:0,sys:0,irq:0}}]
  assert.equal(cpuUtilization(times(1000,70000),times(1250,70750)),25)
  assert.equal(cpuUtilization(times(1000,70000),times(1000,70000)),null)
  assert.equal(cpuUtilization(times(1000,70000),times(10,50)),null)
})
test('relata manutenção em andamento a partir das unidades relevantes',async()=>{
  const table=['alsistemas-package-installer','alsistemas-updater','alsistemas-project-updater'].map((name,i)=>
    'Id='+name+'.service\nActiveState='+(i===0?'activating':'inactive')+'\nLoadState=loaded')
  const report=await hostMaintenance(async()=>({stdout:table.join('\n\n')}))
  assert.equal(report.verified,true)
  assert.deepEqual(report.busy,['Dependências do APT'])
})
test('teste HEAD só usa loopback e não segue resposta 302',async()=>{
  const calls=[]
  const result=await probeLocalSite('site.example.com','http',{request:(options,send)=>{
    calls.push(options)
    const req=new EventEmitter()
    req.end=()=>queueMicrotask(()=>send({statusCode:302,resume(){}}))
    return req
  }})
  assert.equal(calls.length,1)
  assert.equal(calls[0].hostname,'127.0.0.1')
  assert.equal(calls[0].headers.Host,'site.example.com')
  assert.equal(calls[0].method,'HEAD')
  assert.equal(result.status,302)
  assert.equal((await probeLocalSite('127.0.0.1','http')).status,null)
})
test('HTTPS usa SNI do vhost e expõe a validade observada, sem inferir certificado de HTTP',async()=>{
  const result=await probeLocalSite('site.example.com','https',{request:(options,send)=>{
    assert.equal(options.hostname,'127.0.0.1')
    assert.equal(options.servername,'site.example.com')
    assert.equal(options.port,443)
    const req=new EventEmitter(), sock=new EventEmitter()
    sock.authorized=false
    sock.getPeerCertificate=()=>({subject:{CN:'site.example.com'},valid_to:'Aug 31 00:00:00 2099 GMT'})
    req.end=()=>queueMicrotask(()=>{
      req.emit('socket',sock)
      sock.emit('secureConnect')
      send({statusCode:200,resume(){}})
    })
    return req
  }})
  assert.equal(result.status,200)
  assert.equal(result.certificate.valid,false)
  assert.match(result.certificate.expiresAt,/^2099-/)
})
test('painel testa somente sites identificados e limita quantidade',async()=>{
  const items=[{name:'hidden',protected:true,sites:[{name:'hidden.example.com',enabled:true,https:true}]},
  {name:'demo',displayName:'Demo',sites:[{name:'demo.example.com',enabled:true,http:true,https:true},{name:'other.example.com',enabled:true,http:true}]}]
  const ver=await hostSites({list:()=>items,probe:async(_site,protocol)=>({status:protocol==='http'?301:200}),limit:1})
  assert.equal(ver.total,2)
  assert.equal(ver.sites.length,1)
  assert.equal(ver.sites[0].name,'demo.example.com')
  assert.equal(ver.sites[0].http.status,301)
  assert.equal(ver.source,'loopback')
})
