import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hostOverview, hostInterfaces } from '../src/host_dashboard.js'
import { monitor } from '../src/monitor.js'

test('falha de leitura de rede não apaga métricas nem estado de boot', async () => {
  const sample = await hostOverview({networkInterfaces() { throw new Error('uv_interface_addresses') }})
  assert.equal(sample.system.interfacesAvailable,false)
  assert.deepEqual(sample.system.interfaces,[])
  assert.ok(sample.ram.total>0 && sample.cpuCount>0 && sample.disk.total>0)
  assert.equal(typeof sample.reboot.canCheckBoot,'boolean')
})
test('interfaces lidas descartam loopback e a unidade permite AF_NETLINK',()=>{
  const response=hostInterfaces(()=>({
    lo:[{internal:true,address:'127.0.0.1',family:'IPv4'}],
    eth0:[{internal:false,address:'10.0.1.8',family:'IPv4'}]
  }))
  assert.deepEqual(response,{interfaces:[{name:'eth0',address:'10.0.1.8',family:'IPv4'}],interfacesAvailable:true})
  const installer=readFileSync(new URL('../../instalar.sh',import.meta.url),'utf8')
  const block=installer.split('\nDescription=AL Sistemas VPS (painel local)\n')[1].split('[Install]')[0]
  assert.match(block,/^User=alsistemas$/m)
  assert.match(block,/^RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK$/m)
})
test('sem proc ou statfs, o disco e a swap são desconhecidos e a RAM continua',()=>{
  const missing=()=>{ throw new Error('indisponível') }
  const m=monitor({read:missing,statfs:missing})
  assert.deepEqual(m.disk,{total:null,free:null,used:null})
  assert.deepEqual(m.swap,{total:null,free:null})
  assert.ok(m.ram.total>0)
  assert.equal(m.ram.source,'free')
  const realZero=monitor({read:()=> 'SwapTotal: 0 kB\nSwapFree: 0 kB',statfs:missing})
  assert.deepEqual(realZero.swap,{total:0,free:0})
})
test('dashboard coloca identidade, métricas e dados acima do resumo dos sites',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
  const part=html.slice(html.indexOf('id="page-overview"'),html.indexOf('id="page-projects"'))
  for(const id of ['overview-host','overview-uptime','overview-details-toggle']) assert.ok(part.indexOf(id)<part.indexOf('id="overview-sites-title"'))
  assert.match(part,/<dialog id="overview-sites-dialog"[\s\S]+?id="overview-sites"/)
})
