import { domainError, domainHost, ensureProjectPointer, getDomain, redirectSource } from './domains.js'
import { listSpaceshipDns } from './integrations.js'
import { publicIPv4, dnsDiagnostics } from './dns_diagnostics.js'
import { readJson, writeJson } from './store.js'

export function validateHosting(input, panelHost) {
  if (Object.keys(input).sort().join(',') !== 'displayName,host,mode,name,publicIp,type,zone' ||
      typeof input.name !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(input.name) || input.name.includes('--') ||
      ['iguatamaonline','iguatama-teste','alsistemas'].includes(input.name) ||
      typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.trim().length > 70 ||
      /[\x00-\x1f\x7f]/.test(input.displayName) || !['static','php'].includes(input.type) ||
      !['none','existing','subdomain'].includes(input.mode)) throw domainError('Confira o nome, a pasta e o tipo do projeto.')
  const { name, type, mode } = input
  const displayName = input.displayName.trim()
  if (mode === 'none') {
    if (input.host || input.zone || input.publicIp) throw domainError('Limpe o endereço para criar sem domínio.')
    return { name,type,displayName,mode,domain:null,zone:null,publicIp:null }
  }
  const domain = domainHost(input.host)
  if (domain === panelHost) throw domainError('O endereço do painel não pode ser associado a um projeto.',409)
  if (!publicIPv4(input.publicIp)) throw domainError('Confirme o IPv4 público fixo da VPS.')
  const zone = mode === 'subdomain' ? redirectSource(input.zone,domain,panelHost).domain : null
  if (!/\.[a-z]{2,63}$/.test(domain)) throw domainError('O endereço não é compatível com o servidor web.')
  return { name,type,displayName,mode,domain,zone,publicIp:input.publicIp }
}

export async function ipv4Hint(zone, options) {
  if (publicIPv4(process.env.ALS_VPS_PUBLIC_IPV4)) return {ip:process.env.ALS_VPS_PUBLIC_IPV4,source:'config'}
  if (!zone) return {ip:null}
  const account = await getDomain(zone,options)
  if (account.nameservers?.provider !== 'basic') return {ip:null}
  const result = await listSpaceshipDns(account.name,options)
  if (result.items.length !== result.total) return {ip:null}
  const values = [...new Set(result.items.filter(item => item.type === 'A' && (item.name === '@' || item.name === account.name)).map(item => item.address).filter(publicIPv4))]
  return values.length === 1 ? {ip:values[0],source:'apex'} : {ip:null}
}

const initial = plan => ({
  dns: {state:plan.domain ? 'pending' : 'skipped',message:plan.domain ? 'DNS ainda não verificado.' : 'Sem endereço público.'},
  tls: {state:plan.domain ? 'pending' : 'skipped',message:plan.domain ? 'Aguardando DNS público.' : 'Sem endereço público.'}
})
const file = name => 'hosting-' + name + '.json'
export function hostingWorkflow({runner, provider, diagnosticOptions, catalog, note = () => {}, retryDelay = 22000}) {
  const jobs = new Set(), creating = new Set()
  const get = name => readJson(file(name))
  const set = (name,value) => writeJson(file(name),value)
  const eligible = name => catalog().find(project => project.name === name && project.capabilities?.hosting)
  const verify = (data,item) => {
    if (!data || !item || item.hostingDomain !== data.plan.domain) throw domainError('Projeto não disponível para publicação.',404)
  }
  const runQuery = (plan, type) => dnsDiagnostics(plan.zone || plan.domain,{host:plan.domain,type},diagnosticOptions)
  async function run(name, data) {
    const {plan} = data
    try {
      const item = eligible(name)
      verify(data,item)
      if (!plan.domain) return
      if (item.enabled === false) throw domainError('Ative o site antes de retomar DNS e HTTPS.')
      const previous = data.dns
      if (plan.mode === 'subdomain') {
        try {
          const pointed = await ensureProjectPointer(plan.zone,plan.domain,plan.publicIp,provider)
          if (pointed.state === 'manual' || pointed.state === 'pending') data.dns = pointed
          else data.dns = {state:'pending',message:pointed.message + ' Aguardando resposta pública.'}
        } catch (error) {
          data.dns = {state:'failed',message:error.status ? error.message : 'Falha ao configurar DNS na Spaceship.'}
          set(name,data)
          return
        }
      }
      set(name,data)
      let resolved = false
      for (let attempt = 0; attempt < 3; attempt++) {
        const [a,aaaa] = await Promise.all([runQuery(plan,'A'),runQuery(plan,'AAAA')])
        const publicRows = result => result.sources.filter(row => ['google','cloudflare'].includes(row.id))
        resolved = publicRows(a).length === 2 && publicRows(a).every(row => row.state === 'answered' && row.values.length === 1 && row.values[0] === plan.publicIp) &&
          publicRows(aaaa).length === 2 && publicRows(aaaa).every(row => row.state === 'empty')
        if (resolved) break
        if (publicRows(aaaa).some(row => row.state === 'answered' && row.values.length)) {
          data.dns = {state:'pending',message:'Foi encontrado IPv6 (AAAA). Hospedagem automática usa IPv4. Confira o AAAA antes de emitir HTTPS.'}
          set(name,data)
          return
        }
        if (data.dns.state === 'manual' || attempt === 2) break
        await new Promise(resolve => { const t = setTimeout(resolve,retryDelay); t.unref() })
      }
      if (!resolved) {
        if (data.dns.state !== 'manual') data.dns = {state:'pending',message:'O IPv4 informado ainda não foi confirmado nos resolvedores consultados.'}
        if (previous.state === 'confirmed' && data.tls.state === 'active') data.tls = {state:'active',message:'HTTPS permanece configurado. Confira o DNS antes de abrir.'}
        set(name,data)
        return
      }
      data.dns = {state:'confirmed',message:'Google e Cloudflare resolveram o endereço para o IPv4 da VPS.'}
      data.tls = {state:'working',message:'Solicitando HTTPS para este endereço…'}
      set(name,data)
      try {
        const result = await runner({action:'enable_project_tls',name,domain:plan.domain})
        if (!result.httpsConfigured) throw new Error('O servidor não confirmou HTTPS.')
        data.tls = {state:'active',message:'HTTPS configurado e Nginx recarregado.'}
      } catch (error) { data.tls = {state:'failed',message:error.message} }
      set(name,data)
      note('project_hosting_checked', {name,success:data.tls.state === 'active'})
    } catch (error) {
      data.tls = {state:'failed',message:error.status ? error.message : 'Não foi possível concluir o provisionamento.'}
      set(name,data)
    }
  }
  function start(name,data) {
    if (!data.plan.domain || jobs.has(name)) return false
    jobs.add(name)
    void run(name,data).catch(() => {}).finally(() => jobs.delete(name))
    return true
  }
  return {
    eligible,
    status(name) {
      const item = eligible(name)
      if (!item) throw domainError('Projeto não disponível para publicação.',404)
      const data = get(name)
      return { plan:data?.plan || null, dns:data?.dns || null,
        tls: data?.tls?.state === 'working' && !jobs.has(name) ? {state:'pending',message:'Confira novamente o HTTPS.'} : data?.tls || null,
        release:item.release || null, working:jobs.has(name), enabled:item.enabled }
    },
    async create(plan, ip) {
      const name = plan.name
      if (creating.has(name) || eligible(name)) throw domainError('Este projeto já existe ou está sendo criado.',409)
      creating.add(name)
      try {
        if (plan.mode === 'subdomain') await ensureProjectPointer(plan.zone,plan.domain,plan.publicIp,{...provider,dryRun:true})
        const data = {plan,...initial(plan)}
        set(name,data)
        const {type,domain,displayName} = plan
        let result
        try { result = await runner({action:'create_project',name,type,domain,displayName}) }
        catch (error) { throw domainError(error.message,422) }
        note('project_hosting_created',{ip,name,success:true})
        start(name,data)
        return {name,displayName,domain,path:result.path}
      } finally { creating.delete(name) }
    },
    retry(name) {
      const data = get(name)
      verify(data,eligible(name))
      if (!data.plan.domain) throw domainError('O projeto não tem endereço público.')
      return {started:start(name,data)}
    },
    async test(name) {
      const data = get(name)
      verify(data,eligible(name))
      if (!data.plan.domain) throw domainError('O projeto não tem endereço público.')
      return {...await runQuery(data.plan,'A'),expected:[data.plan.publicIp]}
    }
  }
}
