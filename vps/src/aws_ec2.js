import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { isIPv4 } from 'node:net'
import { promisify } from 'node:util'

const imds = 'http://169.254.169.254'
const instancePattern = /^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/
const regionPattern = /^[a-z]{2}(?:-[a-z0-9]+){1,4}-[0-9]+$/
const ec2States = new Set(['pending','running','shutting-down','terminated','stopping','stopped'])
const checkStates = new Set(['ok','impaired','initializing','insufficient-data','not-applicable'])
const run = promisify(execFile)

async function limitedText(response, max) {
  if (Number(response.headers.get('content-length') || 0) > max || !response.body) throw new Error('Resposta inválida')
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const {done,value} = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > max) throw new Error('Resposta inválida')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(()=>{})
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

function normalizeIdentity(document) {
  if (!document || !instancePattern.test(document.instanceId || '') || !regionPattern.test(document.region || ''))
    throw new Error('Identidade EC2 inválida')
  const {instanceId,region,availabilityZone,instanceType,architecture,privateIp,pendingTime}=document
  return {
    instanceId, region,
    zone: typeof availabilityZone==='string' && /^[a-z0-9-]{1,48}$/.test(availabilityZone) && availabilityZone.startsWith(region) ? availabilityZone : null,
    instanceType: typeof instanceType==='string' && /^[a-z0-9-]+\.[a-z0-9-]+$/.test(instanceType) && instanceType.length<=48 ? instanceType : null,
    architecture: ['x86_64','arm64','i386'].includes(architecture) ? architecture : null,
    privateIp: isIPv4(privateIp||'') ? privateIp : null,
    launchedAt: typeof pendingTime==='string' && Number.isFinite(Date.parse(pendingTime)) ? new Date(pendingTime).toISOString() : null
  }
}

function awsCliPath() {
  for (const path of ['/usr/local/bin/aws','/usr/bin/aws']) {
    try {
      const status=statSync(path)
      if (status.isFile() && status.uid===0 && !(status.mode & 0o022) && status.mode & 0o111) return path
    } catch {}
  }
  return null
}

const resourceId=(prefix,value)=>typeof value==='string' && value.startsWith(prefix+'-') &&
  /^(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(value.slice(prefix.length+1)) ? value : null
const consoleLink=({region,instanceId})=>region.startsWith('cn-') ? null : region.startsWith('us-gov-')
  ? `https://console.amazonaws-us-gov.com/ec2/home?region=${region}#InstanceDetails:instanceId=${instanceId}`
  : `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${instanceId}`

async function callOwnEc2({instanceId,region},operation,args,{cli=awsCliPath,execute=run,paginate=false}={}) {
  if (!instancePattern.test(instanceId||'') || !regionPattern.test(region||''))
    return {state:'unavailable'}
  const binary=cli()
  if (!binary) return {state:'cli_missing'}
  try {
    const {stdout}=await execute(binary,[
      'ec2',operation,...args,
      '--region',region,'--no-cli-pager',...(paginate?[]:['--no-paginate']),'--output','json',
      '--cli-connect-timeout','2','--cli-read-timeout','3'
    ],{
      timeout:9000,maxBuffer:65536,encoding:'utf8',
      env:{
        PATH:'/usr/bin:/bin:/usr/local/bin',HOME:'/var/lib/alsistemas',LANG:'C.UTF-8',
        AWS_CONFIG_FILE:'/dev/null',AWS_SHARED_CREDENTIALS_FILE:'/dev/null',
        AWS_EC2_METADATA_SERVICE_ENDPOINT:imds,AWS_EC2_METADATA_V1_DISABLED:'true',
        AWS_METADATA_SERVICE_TIMEOUT:'1',AWS_METADATA_SERVICE_NUM_ATTEMPTS:'1',
        AWS_CLI_AUTO_PROMPT:'off',AWS_PAGER:'',AWS_MAX_ATTEMPTS:'1',AWS_IGNORE_CONFIGURED_ENDPOINT_URLS:'true'
      }
    })
    return {state:'ok',output:JSON.parse(stdout)}
  } catch(error) {
    const output=String(error?.stderr||'')
    if (/UnauthorizedOperation|AccessDenied/i.test(output)) return {state:'access_denied'}
    if (/Unable to locate credentials|could not find credentials|NoCredentialsError/i.test(output)) return {state:'role_missing'}
    return {state:'unavailable'}
  }
}

export async function describeSelf(identity,options) {
  const {state,output}=await callOwnEc2(identity,'describe-instance-status',['--instance-ids',identity.instanceId,'--include-all-instances'],options)
  if(state!=='ok')return {state}
  const row=Array.isArray(output?.InstanceStatuses) ? output.InstanceStatuses.find(item=>item?.InstanceId===identity.instanceId) : null
  if (!row)return {state:'not_reported'}
  const check=value=>checkStates.has(value)?value:null
  return {state:'ok',instanceState:ec2States.has(row.InstanceState?.Name)?row.InstanceState.Name:null,
    system:check(row.SystemStatus?.Status),instance:check(row.InstanceStatus?.Status),ebs:check(row.AttachedEbsStatus?.Status)}
}

export async function describeInventory(identity,options) {
  const query='Reservations[].Instances[].{id:InstanceId,vpc:VpcId,subnet:SubnetId,root:RootDeviceName,groups:SecurityGroups[].GroupId,disks:BlockDeviceMappings[].{device:DeviceName,id:Ebs.VolumeId,status:Ebs.Status}}'
  const {state,output}=await callOwnEc2(identity,'describe-instances',['--instance-ids',identity.instanceId,'--query',query],options)
  if(state!=='ok')return {state}
  const row=Array.isArray(output) ? output.find(item=>item?.id===identity.instanceId) : null
  if(!row)return {state:'not_reported'}
  const groups=(Array.isArray(row.groups)?row.groups:[]).slice(0,20).map(value=>resourceId('sg',value)).filter(Boolean)
  const volumes=(Array.isArray(row.disks)?row.disks:[]).slice(0,24).flatMap(item=>{
    const id=resourceId('vol',item?.id)
    if(!id)return []
    const device=typeof item.device==='string'&&/^\/dev\/[a-z0-9_-]{1,50}$/.test(item.device)?item.device:null
    return [{id,device,root:!!device&&device===row.root,
      status:['attaching','attached','detaching','detached'].includes(item.status)?item.status:null}]
  })
  return {state:'ok',vpc:resourceId('vpc',row.vpc),subnet:resourceId('subnet',row.subnet),groups,volumes}
}

const snapshotStates=new Set(['pending','completed','error','recoverable','recovering'])
const snapshotFields='{id:SnapshotId,volume:VolumeId,status:State,progress:Progress,startedAt:StartTime}'
function normalizeSnapshot(row,volume){
  const id=resourceId('snap',row?.id)
  if(!id || row.volume!==volume)return null
  const time=typeof row.startedAt==='string'?Date.parse(row.startedAt):NaN
  const progress=typeof row.progress==='string'&&/^(?:100|[0-9]{1,2})%$/.test(row.progress)?row.progress:null
  return {id,status:snapshotStates.has(row.status)?row.status:null,progress,
    startedAt:Number.isFinite(time)?new Date(time).toISOString():null}
}
async function snapshotList(identity,volume,onlyPending,options){
  if(!resourceId('vol',volume))return {state:'no_root'}
  const {state,output}=await callOwnEc2(identity,'describe-snapshots',[
    '--owner-ids','self','--filters','Name=volume-id,Values='+volume,
    ...(onlyPending?['Name=status,Values=pending']:[]),
    '--page-size','50','--max-items',onlyPending?'1':'50',
    '--query','{items:Snapshots[].'+snapshotFields+',next:NextToken}'
  ],{...options,paginate:true})
  if(state!=='ok')return {state}
  if(!Array.isArray(output?.items))return {state:'unavailable'}
  const snapshots=output.items.slice(0,50).map(row=>normalizeSnapshot(row,volume)).filter(Boolean)
    .sort((a,b)=>(b.startedAt??'').localeCompare(a.startedAt??''))
  if(onlyPending&&(output.items.length>0||output.next))return {state:'pending'}
  return {state:'ok',snapshots,more:typeof output.next==='string'&&!!output.next}
}

export function createEbsSnapshots({readEc2,inventory=describeInventory,cliOptions,now=Date.now}){
  let creating=false,nextCreateAt=0
  async function target(fresh){
    const data=await readEc2()
    if(data.state!=='metadata_ok'||!data.identity)return {state:'metadata_unavailable'}
    const resources=fresh?await inventory(data.identity,cliOptions):data.resources
    if(resources?.state!=='ok')return {state:resources?.state||'unavailable'}
    const roots=resources.volumes.filter(volume=>volume.root&&volume.status==='attached'&&resourceId('vol',volume.id))
    return roots.length===1?{state:'ok',identity:data.identity,volume:roots[0].id}:{state:'no_root'}
  }
  return {
    async list(){
      const dest=await target(false)
      if(dest.state!=='ok')return dest
      return {...await snapshotList(dest.identity,dest.volume,false,cliOptions),volume:dest.volume}
    },
    async create(){
      if(creating||now()<nextCreateAt)return {state:'busy'}
      creating=true
      try{
        const dest=await target(true)
        if(dest.state!=='ok')return dest
        const {identity,volume}=dest
        const check=await snapshotList(identity,volume,true,cliOptions)
        if(check.state!=='ok')return {state:check.state}
        // CreateSnapshot não aceita ClientToken. Não repetir uma chamada de resultado incerto.
        nextCreateAt=now()+60_000
        const {state,output}=await callOwnEc2(identity,'create-snapshot',[
          '--volume-id',volume,'--description','AL Sistemas VPS | Disco raiz da instância '+identity.instanceId,
          '--query',snapshotFields
        ],cliOptions)
        const snapshot=state==='ok'?normalizeSnapshot(output,volume):null
        if(snapshot)return {state:'accepted',snapshot}
        return {state:['access_denied','role_missing','cli_missing'].includes(state)?state:'unconfirmed'}
      } finally {creating=false}
    }
  }
}

export function createEc2Reader({fetcher=fetch,describe=describeSelf,inventory=describeInventory,now=Date.now}={}) {
  let cached=null, next=0, inFlight=null
  const stamp=()=>new Date(now()).toISOString()
  const request=(path,options)=>fetcher(imds+path,{...options,redirect:'error',signal:AbortSignal.timeout(1200)})
  async function read() {
    let token, identity
    try {
      const tokenResult=await request('/latest/api/token',{method:'PUT',headers:{'X-aws-ec2-metadata-token-ttl-seconds':'60'}})
      if(!tokenResult.ok) return {state:'metadata_unavailable',checkedAt:stamp()}
      token=await limitedText(tokenResult,4096)
      if(!token || /\s/.test(token)) return {state:'metadata_unavailable',checkedAt:stamp()}
      const headers={'X-aws-ec2-metadata-token':token}
      const doc=await request('/latest/dynamic/instance-identity/document',{headers})
      if(!doc.ok) return {state:'metadata_unavailable',checkedAt:stamp()}
      identity=normalizeIdentity(JSON.parse(await limitedText(doc,16384)))
    } catch {
      return {state:'metadata_unavailable',checkedAt:stamp()}
    }
    const address=async()=>{
      try {
        const res=await request('/latest/meta-data/public-ipv4',{headers:{'X-aws-ec2-metadata-token':token}})
        if(res.status===404) return {publicIp:null,publicIpState:'not_assigned'}
        if(res.ok) {
          const value=await limitedText(res,64)
          if(isIPv4(value)) return {publicIp:value,publicIpState:'ok'}
        }
      } catch {}
      return {publicIp:null,publicIpState:'unavailable'}
    }
    const safe=operation=>Promise.resolve().then(()=>operation(identity)).catch(()=>({state:'unavailable'}))
    const [network,checks,resources]=await Promise.all([address(),safe(describe),safe(inventory)])
    return {state:'metadata_ok',checkedAt:stamp(),identity:{...identity,...network},checks,resources,consoleUrl:consoleLink(identity)}
  }
  return async ()=> {
    if(inFlight) return inFlight
    if(cached && now()<next) return cached
    inFlight=read().then(result=>{
      cached=result
      next=now()+(result.state==='metadata_ok'?60_000:20_000)
      return result
    }).finally(()=>{inFlight=null})
    return inFlight
  }
}
