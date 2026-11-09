/**
 * ConfigMongo.jsx — Painel de configuração da URI do MongoDB.
 * Usado tanto na tela de instalação quanto no PainelBanco.
 */
import { useState, useEffect }                          from 'react'
import { setupService }                                  from '../../../services/api'
import toast                                             from 'react-hot-toast'
import { C, Ico, Spin, card, labelSty, inputSty,
         infoBox, btnSty, StatusBadge }                  from './SetupForms'

export default function ConfigMongo({ initialUri = '' }) {
  const [aberta,       setAberta]       = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [testando,     setTestando]     = useState(false)
  const [uri,          setUri]          = useState(initialUri)
  const [statusConexao, setStatusConexao] = useState(null)
  const configurado = !!uri.trim()

  useEffect(() => { if (initialUri) setUri(initialUri) }, [initialUri])

  async function salvar() {
    setLoading(true)
    setStatusConexao(null)
    try {
      await setupService.salvarEnvConfig({ mongo_uri: uri })
      toast.success('URI do MongoDB salva!')
    } catch { toast.error('Erro ao salvar configuração') }
    finally { setLoading(false) }
  }

  async function testar() {
    if (!uri.trim()) { toast.error('Informe a URI antes de testar'); return }
    setTestando(true)
    setStatusConexao(null)
    try {
      const data = await setupService.testarMongo(uri)
      setStatusConexao(data)
    } catch { setStatusConexao({ ok: false, erro: 'Erro ao comunicar com o servidor' }) }
    finally { setTestando(false) }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setAberta(a => !a)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          background: C.elevated, border: `1px solid ${configurado ? C.greenAcc + '55' : C.border}`,
          color: C.subtle, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', letterSpacing: '.04em', transition: 'border-color .2s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: configurado ? C.greenAcc : C.muted }}>{Ico.db}</span>
          CONFIGURAÇÃO — MongoDB
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {configurado && (
            <span style={{ fontSize: 10, fontWeight: 700, color: C.greenAcc, background: C.greenAcc + '22', padding: '2px 8px', borderRadius: 20 }}>
              ✓ Configurado
            </span>
          )}
          {Ico.chev(aberta)}
        </span>
      </button>

      {aberta && (
        <div style={{ ...card({ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', paddingTop: 20 }) }}>
          <div style={infoBox(C.blue)}>
            <span style={{ color: C.blue, flexShrink: 0 }}>{Ico.info}</span>
            <span style={{ fontSize: 12, color: '#93c5fd', lineHeight: 1.5 }}>
              Lido do arquivo <code>.env</code> do servidor. Altere aqui para atualizar a conexão.
            </span>
          </div>

          <label style={labelSty}>URI de conexão</label>
          <input
            value={uri}
            onChange={e => { setUri(e.target.value); setStatusConexao(null) }}
            placeholder="mongodb+srv://usuario:senha@cluster.mongodb.net/banco"
            style={{ ...inputSty(), marginBottom: 10 }}
          />

          <StatusBadge status={statusConexao} />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={testar} disabled={testando || loading} style={{ ...btnSty('blue', testando || loading), flex: 1 }}>
              {testando ? <><Spin/> Testando…</> : 'Testar Conexão'}
            </button>
            <button onClick={salvar} disabled={loading || testando} style={{ ...btnSty('green', loading || testando), flex: 1 }}>
              {loading ? <><Spin/> Salvando…</> : <>{Ico.save} Salvar</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
