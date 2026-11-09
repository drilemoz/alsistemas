import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { infraestruturaService } from '../../../services/api'
import { T as C, SPACE, RADIUS, FONT } from '../../../themes/tokens'
import AdminIcon from '../ui/AdminIcon'

const DESCRICOES = {
  render: 'Serviços, deploys e status da conta Render.',
  vercel: 'Projetos e deploys hospedados na Vercel.',
  github: 'Repositórios, commits, branches e publicação de projetos.',
  groq: 'Assistente de IA com baixa latência.',
  anthropic: 'Modelos Claude como provedor alternativo de IA.',
}

function tempo(iso) {
  if (!iso) return 'Ainda não salvo no cofre'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'salvo agora'
  if (min < 60) return `salvo há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `salvo há ${h}h`
  return `salvo há ${Math.floor(h / 24)}d`
}

export default function ConfigIntegracoes() {
  const [items, setItems] = useState([])
  const [valores, setValores] = useState({})
  const [visiveis, setVisiveis] = useState({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState('')

  async function carregar() {
    setLoading(true)
    try { setItems((await infraestruturaService.credenciais()).items || []) }
    catch (e) { toast.error(e.message || 'Não foi possível carregar as integrações') }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  async function salvar(id) {
    const segredo = String(valores[id] || '').trim()
    if (!segredo) return toast.error('Digite uma credencial nova para salvar.')
    setSalvando(id)
    try {
      await infraestruturaService.salvarCredencial(id, segredo)
      setValores(v => ({ ...v, [id]: '' }))
      toast.success('Credencial salva no cofre criptografado.')
      await carregar()
    } catch (e) { toast.error(e.message || 'Erro ao salvar credencial') }
    finally { setSalvando('') }
  }

  async function remover(id) {
    setSalvando(id)
    try {
      await infraestruturaService.removerCredencial(id)
      toast.success('Credencial removida do cofre.')
      await carregar()
    } catch (e) { toast.error(e.message || 'Erro ao remover') }
    finally { setSalvando('') }
  }

  return (
    <section style={{ marginBottom: 20, border: `1px solid ${C.border}`, borderRadius: RADIUS.xl, background: C.surface, overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.accent}12, ${C.blue}0d)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.accent }}><AdminIcon name="shield" size={18}/></span>
          <div>
            <h3 style={{ margin: 0, color: C.text, fontSize: 15 }}>Cofre de integrações</h3>
            <p style={{ margin: '4px 0 0', color: C.muted, fontSize: FONT.sm, lineHeight: 1.5 }}>
              As chaves ficam criptografadas no MongoDB. O Render deixa de ser a única fonte das APIs operacionais.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 10 }}>
        {loading ? <p style={{ color: C.muted }}>Carregando integrações…</p> : items.map(item => (
          <div key={item.id} style={{ border: `1px solid ${item.configurado ? C.green + '55' : C.border}`, borderRadius: RADIUS.lg, padding: 14, background: C.elevated }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div>
                <strong style={{ color: C.text, fontSize: FONT.base }}>{item.label}</strong>
                <p style={{ color: C.muted, fontSize: FONT.xs, lineHeight: 1.45, margin: '4px 0 0' }}>{DESCRICOES[item.id]}</p>
              </div>
              <span style={{ flexShrink: 0, padding: '3px 7px', borderRadius: RADIUS.pill, fontSize: 10, fontWeight: 800, color: item.configurado ? C.greenAcc : C.muted, background: item.configurado ? C.green + '22' : C.pageBg, border: `1px solid ${item.configurado ? C.green + '55' : C.border}` }}>
                {item.configurado ? (item.origem === 'cofre' ? 'COFRE' : 'AMBIENTE') : 'AUSENTE'}
              </span>
            </div>
            <div style={{ marginTop: 11, position: 'relative' }}>
              <input type={visiveis[item.id] ? 'text' : 'password'} value={valores[item.id] || ''}
                onChange={e => setValores(v => ({ ...v, [item.id]: e.target.value }))}
                placeholder={item.configurado ? 'Digite apenas para substituir' : 'Cole a chave ou token'}
                autoComplete="new-password"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 38px 9px 10px', borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: C.pageBg, color: C.text, outline: 'none' }}/>
              <button type="button" onClick={() => setVisiveis(v => ({ ...v, [item.id]: !v[item.id] }))}
                style={{ position: 'absolute', right: 8, top: 7, border: 0, background: 'none', color: C.muted, cursor: 'pointer' }}>
                <AdminIcon name={visiveis[item.id] ? 'eyeOff' : 'eye'} size={15}/>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <small style={{ color: C.muted }}>{item.origem === 'cofre' ? tempo(item.atualizadoEm) : item.configurado ? 'lida do ambiente atual' : 'não configurada'}</small>
              <div style={{ display: 'flex', gap: 6 }}>
                {item.origem === 'cofre' && <button onClick={() => remover(item.id)} disabled={salvando === item.id} style={{ border: `1px solid ${C.red}55`, background: C.red + '12', color: C.red, borderRadius: RADIUS.md, padding: '6px 9px', cursor: 'pointer' }}>Remover</button>}
                <button onClick={() => salvar(item.id)} disabled={salvando === item.id || !valores[item.id]} style={{ border: 0, background: C.accent, color: '#fff', borderRadius: RADIUS.md, padding: '6px 10px', fontWeight: 700, cursor: 'pointer', opacity: salvando === item.id || !valores[item.id] ? .5 : 1 }}>
                  {salvando === item.id ? 'Salvando…' : item.configurado ? 'Substituir' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '11px 16px', borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: FONT.xs, lineHeight: 1.5 }}>
        O MongoDB e a chave mestra de criptografia ainda precisam existir no ambiente para iniciar o servidor. As demais APIs podem permanecer no cofre.
      </div>
    </section>
  )
}
