'use strict'
const el=id=>document.getElementById(id)
let tracked=null
try {
  const row=JSON.parse(localStorage.getItem('als-host-reboot-v1')||'null')
  if(row && Number.isFinite(row.deadline)&&Date.now()<row.deadline+86400_000) tracked=row
} catch {}
const deadline=tracked?.deadline||Date.now()+240_000
let timer, checking=false, ready=false
function paint() {
  if(ready)return
  const remaining=tracked?.target ? Math.max(0,Math.ceil((tracked.target-Date.now())/1000)) : 0
  const expired=Date.now()>=deadline
  const state=expired ? 'Ainda sem resposta da VPS' : remaining ? 'Reinício previsto em'
    : tracked?.requestedAt ? 'Aguardando a VPS voltar' : tracked ? 'Confirmando o pedido' : 'Painel temporariamente indisponível'
  const detail=expired ? 'Confira no console da AWS ou pelo SSH. Nenhum novo pedido será enviado.'
    : 'A conexão será verificada automaticamente. O novo boot será confirmado no seu painel.'
  if(el('state').textContent!==state)el('state').textContent=state
  if(el('detail').textContent!==detail)el('detail').textContent=detail
  el('clock').hidden=!remaining||expired
  if(!el('clock').hidden)el('clock').textContent='00:'+String(Math.min(59,remaining)).padStart(2,'0')
}
const clock=setInterval(paint,250)
paint()
async function probe() {
  if(checking||ready)return
  clearTimeout(timer)
  checking=true
  el('retry').disabled=true
  try {
    const response=await fetch('/api/health',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(4500)})
    const health=response.ok?await response.json():null
    if(health?.ok===true) {
      ready=true
      clearInterval(clock)
      el('state').textContent='Painel respondeu'
      el('clock').hidden=true
      el('detail').textContent='Voltando ao painel para conferir o estado do servidor…'
      // Reabra o endereço real; nunca declare um reboot só pelo health-check.
      if(location.pathname==='/')location.reload()
      else location.replace('/'+location.hash)
    }
  } catch { /* mantém a tela offline */ }
  finally {
    checking=false
    if(!ready) {
      el('retry').disabled=false
      paint()
      if(Date.now()<deadline)timer=setTimeout(probe,3200)
    }
  }
}
el('retry').addEventListener('click',()=>void probe())
window.addEventListener('online',()=>void probe())
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void probe()})
void probe()
