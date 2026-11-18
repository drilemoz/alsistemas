import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createEc2Reader,describeSelf,describeInventory,createEbsSnapshots} from '../src/aws_ec2.js'

const local={instanceId:'i-0123456789abcdef0',region:'us-east-2',availabilityZone:'us-east-2b',
  instanceType:'t3.small',architecture:'x86_64',privateIp:'10.2.0.3',pendingTime:'2026-01-01T12:00:00Z',accountId:'não deve retornar'}
const imds='http://169.254.169.254'
const token='token-de-teste'
const root=await mkdtemp(join(tmpdir(),'als-ec2-250-'))
process.env.ALS_DATA_DIR=root
const {createServer}=await import('../src/server.js')
test.after(async()=>{await rm(root,{recursive:true,force:true})})

test('IMDSv2 usa URL fixa, token, cache e somente campos selecionados',async()=>{
  const requests=[]
  let describes=0, now=Date.now()
  const load=createEc2Reader({now:()=>now,inventory:async()=>({state:'cli_missing'}),describe:async ({instanceId,region})=>{
    describes++
    assert.equal(instanceId,local.instanceId)
    assert.equal(region,local.region)
    return {state:'cli_missing'}
  },fetcher:async (url,options)=>{
    requests.push(url)
    assert.equal(options.redirect,'error')
    if(url===imds+'/latest/api/token'){
      assert.equal(options.method,'PUT')
      return new Response(token)
    }
    assert.equal(options.headers['X-aws-ec2-metadata-token'],token)
    if(url===imds+'/latest/dynamic/instance-identity/document')return Response.json(local)
    assert.equal(url,imds+'/latest/meta-data/public-ipv4')
    return new Response('203.0.113.5')
  }})
  const [info,copy]=await Promise.all([load(),load()])
  assert.equal(info,copy)
  assert.equal(info.identity.publicIp,'203.0.113.5')
  assert.equal(info.identity.zone,'us-east-2b')
  assert.equal(info.identity.accountId,undefined)
  assert.equal(info.resources.state,'cli_missing')
  assert.equal(info.consoleUrl,'https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#InstanceDetails:instanceId='+local.instanceId)
  assert.equal(describes,1)
  assert.equal(requests.length,3)
  assert.equal(await load(),info)
  now+=60_001
  assert.notEqual(await load(),info)
  assert.equal(describes,2)
})
test('IMDSv2 sem token não tenta consulta alternativa; 404 do IPv4 é ausência',async()=>{
  let calls=0
  const unavailable=createEc2Reader({fetcher:async()=>{calls++;return new Response('',{status:403})},
    describe:()=>assert.fail('API indevida')})
  assert.equal((await unavailable()).state,'metadata_unavailable')
  assert.equal(calls,1)
  const noIp=createEc2Reader({fetcher:async url=>url.endsWith('/token')?new Response(token)
    :url.endsWith('/document')?Response.json(local):new Response(null,{status:404}),
    inventory:async()=>({state:'cli_missing'}),describe:async()=>{throw new Error('não expor detalhes internos')}})
  const snapshot=await noIp()
  assert.equal(snapshot.state,'metadata_ok')
  assert.equal(snapshot.identity.publicIpState,'not_assigned')
  assert.equal(snapshot.checks.state,'unavailable')
})
test('AWS CLI recebe somente a instância local e não herda credenciais estáticas',async()=>{
  const checks=await describeSelf(local,{cli:()=>'/usr/bin/aws',execute:async (bin,args,opt)=>{
    assert.equal(bin,'/usr/bin/aws')
    assert.deepEqual(args.slice(0,5),['ec2','describe-instance-status','--instance-ids',local.instanceId,'--include-all-instances'])
    assert.equal(opt.env.AWS_EC2_METADATA_V1_DISABLED,'true')
    assert.equal(opt.env.AWS_SHARED_CREDENTIALS_FILE,'/dev/null')
    assert.equal(opt.env.AWS_ACCESS_KEY_ID,undefined)
    return {stdout:JSON.stringify({InstanceStatuses:[
      {InstanceId:'i-fffffffffffffffff',InstanceState:{Name:'stopped'}},
      {InstanceId:local.instanceId,InstanceState:{Name:'running'},SystemStatus:{Status:'ok'},InstanceStatus:{Status:'impaired'}}
    ]})}
  }})
  assert.deepEqual(checks,{state:'ok',instanceState:'running',system:'ok',instance:'impaired',ebs:null})
  assert.deepEqual(await describeSelf({...local,region:'--renamed'},{cli:()=>assert.fail()}),{state:'unavailable'})
  const denied=await describeSelf(local,{cli:()=>'/usr/bin/aws',execute:async()=>{throw {stderr:'UnauthorizedOperation PRETEND_SECRET'}}})
  assert.deepEqual(denied,{state:'access_denied'})
})
test('endpoint não é público, só lê a própria EC2 e não guarda resposta no navegador',async()=>{
  const token='a'.repeat(64), csrf='b'.repeat(64)
  const key=createHash('sha256').update(token).digest('hex')
  await writeFile(join(root,'sessions.json'),JSON.stringify({[key]:{csrf,expires:Date.now()+50000}}))
  let calls=0
  const server=createServer({ec2Reader:async()=>{calls++;return {state:'metadata_unavailable'}},taskRunner:async()=>assert.fail('O recurso não executa tarefas')})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const endpoint='http://127.0.0.1:'+server.address().port+'/api/host/ec2'
  const headers={cookie:'als_session='+token}
  try {
    assert.equal((await fetch(endpoint)).status,401)
    assert.equal((await fetch(endpoint+'?instance=i-outro',{headers})).status,400)
    const response=await fetch(endpoint,{headers})
    assert.equal(response.status,200)
    assert.equal(response.headers.get('cache-control'),'no-store')
    assert.equal((await response.json()).state,'metadata_unavailable')
    assert.equal(calls,1)
  } finally {await new Promise(r=>server.close(r))}
})

test('inventário usa DescribeInstances com a instância local e exclui campos desconhecidos',async()=>{
  const d=await describeInventory(local,{cli:()=>'/usr/bin/aws',execute:async(_,args)=>{
    assert.deepEqual(args.slice(0,5),['ec2','describe-instances','--instance-ids',local.instanceId,'--query'])
    return {stdout:JSON.stringify([
      {id:'i-fffffffffffffffff',vpc:'vpc-ffffffff'},
      {id:local.instanceId,vpc:'vpc-12345678',subnet:'subnet-12345678',groups:['sg-12345678','não incluir'],
        root:'/dev/sda1',disks:[
          {device:'/dev/sda1',id:'vol-12345678',status:'attached'},
          {device:'/dev/sdb',id:'não incluir',status:'attached'}
        ]}
    ])}
  }})
  assert.deepEqual(d,{state:'ok',vpc:'vpc-12345678',subnet:'subnet-12345678',groups:['sg-12345678'],
    volumes:[{device:'/dev/sda1',id:'vol-12345678',root:true,status:'attached'}]})
})

const rootVol='vol-aabbccdd'
const rootDisks={state:'ok',volumes:[
  {id:rootVol,root:true,status:'attached'},
  {id:'vol-ffffeeee',root:false,status:'attached'}
]}
const exampleSnap={id:'snap-aabbccdd',volume:rootVol,status:'pending',progress:'10%',startedAt:'2026-01-01T12:00:00Z'}
test('snapshots filtram disco raiz e conta, detectam pendência e não repetem criação de resultado incerto',async()=>{
  let now=1000, mode='pending', calls=[], release
  const latch=new Promise(resolve=>{release=resolve})
  const done=async output=>({stdout:JSON.stringify(output)})
  const snaps=createEbsSnapshots({now:()=>now,readEc2:async()=>({state:'metadata_ok',identity:local,resources:rootDisks}),
    inventory:async()=>rootDisks,
    cliOptions:{cli:()=>'/usr/bin/aws',execute:async(_,args,{env})=>{
      calls.push(args)
      assert.equal(env.AWS_MAX_ATTEMPTS,'1')
      assert.ok(args.includes(local.region))
      if(args[1]==='describe-snapshots'){
        assert.deepEqual(args.slice(2,7),['--owner-ids','self','--filters','Name=volume-id,Values='+rootVol,
          args.includes('Name=status,Values=pending')?'Name=status,Values=pending':'--page-size'])
        assert.equal(args.includes('--no-paginate'),false)
        if(args.includes('Name=status,Values=pending'))return done({items:mode==='pending'?[exampleSnap]:[]})
        return done({items:[{...exampleSnap,volume:'vol-ffffeeee'},exampleSnap],next:'CONT_TOKEN'})
      }
      assert.deepEqual(args.slice(0,4),['ec2','create-snapshot','--volume-id',rootVol])
      if(mode==='uncertain')throw {stderr:'Timed out INTERNAL'}
      await latch
      return done(exampleSnap)
    }}})
  const list=await snaps.list()
  assert.deepEqual(list,{state:'ok',volume:rootVol,more:true,snapshots:[{
    id:exampleSnap.id,status:'pending',progress:'10%',startedAt:'2026-01-01T12:00:00.000Z'}]})
  assert.deepEqual(await snaps.create(),{state:'pending'})
  assert.equal(calls.some(args=>args[1]==='create-snapshot'),false)
  mode='ok'
  const first=snaps.create()
  assert.deepEqual(await snaps.create(),{state:'busy'})
  release()
  assert.deepEqual(await first,{state:'accepted',snapshot:list.snapshots[0]})
  assert.deepEqual(await snaps.create(),{state:'busy'})
  now+=60_001
  mode='uncertain'
  assert.deepEqual(await snaps.create(),{state:'unconfirmed'})
  assert.deepEqual(await snaps.create(),{state:'busy'})
  assert.equal(calls.filter(args=>args[1]==='create-snapshot').length,2)
})
test('criação usa inventário atual e recusa raiz ausente ou ambígua antes de chamar a AWS',async()=>{
  for(const disks of [[],[{id:rootVol,root:true,status:'detaching'}],
    [{id:rootVol,root:true,status:'attached'},{id:'vol-11223344',root:true,status:'attached'}]]){
    const service=createEbsSnapshots({readEc2:async()=>({state:'metadata_ok',identity:local,resources:rootDisks}),
      inventory:async()=>({state:'ok',volumes:disks}),cliOptions:{cli:()=>assert.fail('Não consulta snapshots sem alvo') }})
    assert.deepEqual(await service.create(),{state:'no_root'})
  }
})
test('rota snapshots exige sessão, origem, CSRF e confirmação sem seleção de recurso',async()=>{
  const token='1'.repeat(64), csrf='2'.repeat(64)
  const key=createHash('sha256').update(token).digest('hex')
  await writeFile(join(root,'sessions.json'),JSON.stringify({[key]:{csrf,expires:Date.now()+50000}}))
  let writes=0, reboots=false
  const server=createServer({hostStatus:()=>({state:reboots?'scheduled':'idle'}),
    ebsSnapshots:{list:async()=>({state:'ok',snapshots:[]}),create:async()=>{writes++;return {state:'accepted',snapshot:{id:'snap-aabbccdd'}}}}})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const endpoint='http://127.0.0.1:'+server.address().port+'/api/host/ec2/snapshots'
  const headers={cookie:'als_session='+token}
  const post=(props={},confirmation={confirm:'CRIAR_SNAPSHOT'},suffix='')=>fetch(endpoint+suffix,{method:'POST',
    headers:{...headers,origin:'http://localhost:8181','x-csrf-token':csrf,'content-type':'application/json',...props},
    body:JSON.stringify(confirmation)})
  try{
    assert.equal((await fetch(endpoint)).status,401)
    assert.equal((await fetch(endpoint,{headers})).status,200)
    assert.equal((await post({origin:'https://forged.invalid'})).status,403)
    assert.equal((await post({'x-csrf-token':'x'})).status,403)
    assert.equal((await post({},{})).status,400)
    assert.equal((await post({},{confirm:'CRIAR_SNAPSHOT',volume:'vol-12345678'})).status,400)
    assert.equal((await post({},undefined,'?volume=vol-12345678')).status,400)
    reboots=true
    assert.equal((await post()).status,409)
    reboots=false
    assert.equal(writes,0)
    const ack=await post()
    assert.equal(ack.status,202)
    assert.equal((await ack.json()).snapshot.id,'snap-aabbccdd')
    assert.equal(writes,1)
  }finally{await new Promise(r=>server.close(r))}
})
