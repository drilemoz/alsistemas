import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { securityService } from '../../services/api'

const box = { background:'var(--adm-surface)', border:'1px solid var(--adm-border)', borderRadius:14, padding:18 }

function tempo(data) {
  if (!data) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'medium' }).format(new Date(data))
}

export default function AdminSeguranca() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    try { setData(await securityService.resumo()) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  async function resolver(id) {
    try { await securityService.resolver(id, true); toast.success('Evento marcado como resolvido'); carregar() }
    catch (e) { toast.error(e.message) }
  }

  if (loading && !data) return <div style={{padding:24,color:'var(--adm-muted)'}}>Analisando segurança…</div>
  const checks = data?.checks || {}
  return (
    <div style={{padding:'24px',display:'grid',gap:18,color:'var(--adm-text)'}}>
      <div style={{...box,background:'linear-gradient(135deg,var(--adm-surface),var(--adm-surface2))'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <div><div style={{fontSize:12,fontWeight:800,letterSpacing:1,color:'var(--adm-accent)'}}>CENTRO DE SEGURANÇA</div><h1 style={{margin:'6px 0',fontSize:28}}>Proteção e detecção de riscos</h1><p style={{margin:0,color:'var(--adm-muted)'}}>Monitora padrões suspeitos sem registrar senhas, tokens ou conteúdo secreto.</p></div>
          <div style={{fontSize:42,fontWeight:900}}>{data?.score ?? 0}<span style={{fontSize:15,color:'var(--adm-muted)'}}>/100</span></div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>
        {[['Alertas abertos',data?.abertos],['Alta prioridade',data?.criticos],['Últimas 24h',data?.ultimas24h],['Alterações auditadas',data?.mutacoes24h]].map(([l,v])=><div key={l} style={box}><div style={{fontSize:12,color:'var(--adm-muted)'}}>{l}</div><div style={{fontSize:28,fontWeight:850,marginTop:5}}>{v ?? 0}</div></div>)}
      </div>

      <div style={box}>
        <h2 style={{marginTop:0,fontSize:18}}>Configuração preventiva</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:10}}>
          {Object.entries({masterKeyDedicada:'Chave mestra dedicada',setupDesativado:'Setup desativado',ambienteProducao:'Modo de produção',metricsProtegidas:'Métricas protegidas',redisConfigurado:'Redis configurado'}).map(([k,l])=><div key={k} style={{padding:12,borderRadius:10,background:'var(--adm-surface2)',display:'flex',justifyContent:'space-between',gap:10}}><span>{l}</span><strong>{checks[k]?'Protegido':'Revisar'}</strong></div>)}
        </div>
      </div>

      <div style={box}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2 style={{margin:0,fontSize:18}}>Eventos recentes</h2><button onClick={carregar} style={{padding:'8px 12px',borderRadius:9,border:'1px solid var(--adm-border)',background:'var(--adm-surface2)',color:'var(--adm-text)',cursor:'pointer'}}>Atualizar</button></div>
        <div style={{display:'grid',gap:9,marginTop:14}}>
          {!data?.eventos?.length && <div style={{color:'var(--adm-muted)'}}>Nenhum evento suspeito registrado.</div>}
          {data?.eventos?.map(e=><div key={e._id || e.id} style={{padding:13,border:'1px solid var(--adm-border)',borderRadius:10,display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',flexWrap:'wrap',opacity:e.resolvido?.7:1}}><div><strong>{e.mensagem}</strong><div style={{fontSize:12,color:'var(--adm-muted)',marginTop:4}}>{e.severidade} · {e.metodo} {e.rota} · {tempo(e.criado_em)}</div></div>{!e.resolvido&&<button onClick={()=>resolver(e._id || e.id)} style={{padding:'7px 10px',borderRadius:8,border:'none',background:'var(--adm-accent)',color:'#fff',cursor:'pointer'}}>Resolver</button>}</div>)}
        </div>
      </div>

      <div style={box}><h2 style={{marginTop:0,fontSize:18}}>Próxima evolução recomendada</h2><p style={{color:'var(--adm-muted)',lineHeight:1.6,marginBottom:0}}>Adicionar inventário de dados sensíveis, varredura de segredos em commits e uploads, alertas por e-mail/Telegram, sessões e dispositivos ativos, autenticação em dois fatores, regras de retenção, exportação forense e bloqueio automático configurável. O bloqueio deve permanecer opcional para evitar falsos positivos.</p></div>
    </div>
  )
}
