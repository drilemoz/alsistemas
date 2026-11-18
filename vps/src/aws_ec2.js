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

export async function describeSelf({instanceId,region}, {cli=awsCliPath, execute=run}={}) {
  if (!instancePattern.test(instanceId||'') || !regionPattern.test(region||''))
    return {state:'unavailable'}
  const binary=cli()
  if (!binary) return {state:'cli_missing'}
  try {
    const {stdout}=await execute(binary,[
      'ec2','describe-instance-status','--instance-ids',instanceId,'--include-all-instances',
      '--region',region,'--no-cli-pager','--no-paginate','--output','json',
      '--cli-connect-timeout','2','--cli-read-timeout','3'
    ],{
      timeout:9000, maxBuffer:65536, encoding:'utf8',
      env:{
        PATH:'/usr/bin:/bin:/usr/local/bin', HOME:'/var/lib/alsistemas', LANG:'C.UTF-8',
        AWS_CONFIG_FILE:'/dev/null', AWS_SHARED_CREDENTIALS_FILE:'/dev/null',
        AWS_EC2_METADATA_SERVICE_ENDPOINT:imds, AWS_EC2_METADATA_V1_DISABLED:'true',
        AWS_METADATA_SERVICE_TIMEOUT:'1', AWS_METADATA_SERVICE_NUM_ATTEMPTS:'1',
        AWS_CLI_AUTO_PROMPT:'off', AWS_PAGER:'', AWS_MAX_ATTEMPTS:'1', AWS_IGNORE_CONFIGURED_ENDPOINT_URLS:'true'
      }
    })
    const result=JSON.parse(stdout)
    const row=Array.isArray(result.InstanceStatuses) ? result.InstanceStatuses.find(item=>item?.InstanceId===instanceId) : null
    if (!row) return {state:'not_reported'}
    const check=value=>checkStates.has(value)?value:null
    return { state:'ok', instanceState:ec2States.has(row.InstanceState?.Name)?row.InstanceState.Name:null,
      system:check(row.SystemStatus?.Status), instance:check(row.InstanceStatus?.Status),
      ebs:check(row.AttachedEbsStatus?.Status) }
  } catch(error) {
    // A CLI não repassa stderr, configuração nem credenciais ao navegador.
    const output=String(error?.stderr||'')
    if (/UnauthorizedOperation|AccessDenied/i.test(output)) return {state:'access_denied'}
    if (/Unable to locate credentials|could not find credentials|NoCredentialsError/i.test(output)) return {state:'role_missing'}
    return {state:'unavailable'}
  }
}

export function createEc2Reader({fetcher=fetch,describe=describeSelf,now=Date.now}={}) {
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
    const [network, checks]=await Promise.all([address(),Promise.resolve().then(()=>describe(identity)).catch(()=>({state:'unavailable'}))])
    return {state:'metadata_ok',checkedAt:stamp(),identity:{...identity,...network},checks}
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
