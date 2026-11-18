import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8')
const fragment=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end))
function renderers(){
  const elements=new Map()
  const make=tag=>({
    tag, attributes:{}, children:[], textContent:'',
    append(...children){this.children.push(...children)},
    replaceChildren(...children){this.children=[...children]},
    setAttribute(name,value){this.attributes[name]=value},
    hasChildNodes(){return this.children.length>0}
  })
  const $=id=>{
    if (!elements.has(id))elements.set(id,make(id))
    return elements.get(id)
  }
  const context={
    $,document:{createElement:make,createElementNS:(_ns,tag)=>make(tag)},
    renderHostAlerts(){},hostSample:null
  }
  const render=runInNewContext(
    fragment('function node(', 'function appendLine(')+
    fragment('const serviceVisuals =','let hostSample=null')+
    fragment('const hostUptime =','function renderHostAlerts(')+
    fragment('const ec2Lifecycle=','function resetEc2View(')+
    fragment('function paintEc2(', 'async function loadHostEc2(')+
    '\n;({renderMetrics,paintEc2})',
    context
  )
  return {...render,$}
}
function facts(container) {
  return Array.from(container.children,row=>{
    const [dt,dd]=row.children
    const [svg]=dt.children[0].children
    assert.equal(dt.tag,'dt')
    assert.equal(dd.tag,'dd')
    assert.equal(svg.attributes['aria-hidden'],'true')
    const ref=svg.children[0].attributes.href
    assert.ok(html.includes('id="'+ref.slice(1)+'"'),ref)
    return [dt.children[1].textContent,dd.textContent,ref]
  })
}

test('Dados da VPS tem ícones decorativos para host, kernel e interfaces, sem alterar conteúdo',()=>{
  const {renderMetrics,$}=renderers()
  renderMetrics({
    hostname:'vps-demo', system:{kernel:'7.0.0-aws',interfaces:[
      {name:'ens5',family:'IPv4',address:'192.0.2.28'},
      {name:'ens5',family:'IPv6',address:'2001:db8:100:200:300:400:500:abcd'}
    ]},uptimeSeconds:100,ram:{},disk:{},swap:{}
  })
  const rows=facts($('overview-system-info'))
  assert.deepEqual(rows[0],['Host','vps-demo','#i-server'])
  assert.deepEqual(rows[1],['Kernel Linux','7.0.0-aws','#i-terminal'])
  assert.deepEqual(rows.at(-1),['ens5 · IPv6','2001:db8:100:200:300:400:500:abcd','#i-network'])
  assert.match(html,/<dl id="overview-system-info"[^>]*>/)
})
test('Amazon EC2 exibe ícones coerentes na rede, no inventário e nos títulos',()=>{
  const {paintEc2,$}=renderers()
  paintEc2({
    identity:{instanceId:'i-0123456789abcdef0',region:'us-east-2',privateIp:'10.0.0.5',publicIp:'203.0.113.5'},
    checks:{state:'ok',instanceState:'running'},
    resources:{state:'ok',vpc:'vpc-aabbccdd',subnet:'subnet-aabbccdd',groups:['sg-aabbccdd']}
  })
  assert.deepEqual(facts($('host-ec2-network')),[
    ['IPv4 privado','10.0.0.5','#i-lock'],['IPv4 público','203.0.113.5','#i-globe'],
    ['VPC','vpc-aabbccdd','#i-cloud'],['Sub-rede','subnet-aabbccdd','#i-network'],
    ['Grupo de segurança','sg-aabbccdd','#i-shield']
  ])
  assert.equal(facts($('host-ec2-fields'))[0][2],'#i-list')
  assert.match(html,/<h3 class="ec2-section-title" id="host-ec2-network-title">.*?href="#i-network".*?Rede<\/h3>/)
  assert.match(html,/<span class="host-popup-icon">.*?href="#i-cloud".*?Amazon EC2<\/h2>/)
})
