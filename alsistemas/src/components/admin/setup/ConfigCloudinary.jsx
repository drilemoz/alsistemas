/**
 * ConfigCloudinary.jsx — Painel de configuração das credenciais do Cloudinary.
 * Usado tanto na tela de instalação quanto no PainelBanco.
 */
import { useState, useEffect }                          from 'react'
import { setupService }                                  from '../../../services/api'
import toast                                             from 'react-hot-toast'
import { C, Ico, Spin, card, labelSty, inputSty,
         infoBox, btnSty, StatusBadge }                  from './SetupForms'

// Sentinel retornada pelo backend quando o secret já está configurado mas não
// deve ser exposto. Se o usuário não alterar o campo, reenviamos a sentinel e o
// backend a ignora — preservando o valor real no servidor.
const SECRET_PLACEHOLDER = '••••••••••••••••'

export default function ConfigCloudinary({ initialValues = {} }) {
  const [aberta,       setAberta]       = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [testando,     setTestando]     = useState(false)
  const [visSecret,    setVisSecret]    = useState(false)
  // secretAlterado rastreia se o usuário digitou um novo secret ou manteve o placeholder
  const [secretAlterado, setSecretAlterado] = useState(false)
  const [form, setForm] = useState({
    cloudinary_cloud_name:  initialValues.cloudinary_cloud_name  || '',
    cloudinary_api_key:     initialValues.cloudinary_api_key     || '',
    cloudinary_api_secret:  initialValues.cloudinary_api_secret  || '',
  })
  const [statusConexao, setStatusConexao] = useState(null)
  const configurado = !!form.cloudinary_cloud_name.trim()

  useEffect(() => {
    if (initialValues.cloudinary_cloud_name || initialValues.cloudinary_api_key) {
      setForm({
        cloudinary_cloud_name:  initialValues.cloudinary_cloud_name  || '',
        cloudinary_api_key:     initialValues.cloudinary_api_key     || '',
        // O backend retorna a sentinel quando configurado — não é o valor real
        cloudinary_api_secret:  initialValues.cloudinary_api_secret  || '',
      })
      // Se a sentinel veio do backend, o secret NÃO foi alterado pelo usuário
      setSecretAlterado(false)
    }
  }, [initialValues.cloudinary_cloud_name, initialValues.cloudinary_api_key, initialValues.cloudinary_api_secret])

  const set = k => v => { setForm(f => ({ ...f, [k]: v })); setStatusConexao(null) }

  // Handler específico para o campo secret: marca como alterado
  const setSecret = (v) => {
    set('cloudinary_api_secret')(v)
    setSecretAlterado(true)
  }

  async function salvar() {
    setLoading(true)
    setStatusConexao(null)
    try {
      await setupService.salvarEnvConfig({
        cloudinary_cloud_name:  form.cloudinary_cloud_name,
        cloudinary_api_key:     form.cloudinary_api_key,
        // Só envia o secret se o usuário realmente digitou um novo valor.
        // Caso contrário envia a sentinel e o backend preserva o valor existente.
        cloudinary_api_secret:  secretAlterado
          ? form.cloudinary_api_secret
          : SECRET_PLACEHOLDER,
      })
      toast.success('Configurações do Cloudinary salvas!')
    } catch { toast.error('Erro ao salvar configurações') }
    finally { setLoading(false) }
  }

  async function testar() {
    const { cloudinary_cloud_name, cloudinary_api_key, cloudinary_api_secret } = form
    if (!cloudinary_cloud_name || !cloudinary_api_key || !cloudinary_api_secret) {
      toast.error('Preencha todos os campos antes de testar'); return
    }
    setTestando(true)
    setStatusConexao(null)
    try {
      const data = await setupService.testarCloudinary(form)
      setStatusConexao(data)
    } catch { setStatusConexao({ ok: false, erro: 'Erro ao comunicar com o servidor' }) }
    finally { setTestando(false) }
  }

  return (
    <div style={{ marginTop: 12 }}>
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
          <span style={{ color: configurado ? C.greenAcc : C.muted }}>{Ico.gear}</span>
          CONFIGURAÇÃO — Cloudinary
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
              Credenciais para upload de imagens. Lidas do arquivo <code>.env</code> do servidor.
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelSty}>Cloud Name</label>
            <input value={form.cloudinary_cloud_name} onChange={e => set('cloudinary_cloud_name')(e.target.value)}
              placeholder="meu-cloud" style={inputSty()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSty}>API Key</label>
            <input value={form.cloudinary_api_key} onChange={e => set('cloudinary_api_key')(e.target.value)}
              placeholder="123456789012345" style={inputSty()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSty}>API Secret</label>
            <div style={{ position: 'relative' }}>
              <input
                type={visSecret ? 'text' : 'password'}
                value={form.cloudinary_api_secret}
                onChange={e => setSecret(e.target.value)}
                // Ao focar, limpa a sentinel para o usuário digitar do zero
                onFocus={() => {
                  if (form.cloudinary_api_secret === SECRET_PLACEHOLDER) {
                    setForm(f => ({ ...f, cloudinary_api_secret: '' }))
                    setSecretAlterado(true)
                  }
                }}
                placeholder="••••••••••••••••••••"
                style={{ ...inputSty(), paddingRight: 38 }}
              />
              <button type="button" onClick={() => setVisSecret(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
                  display: 'flex', alignItems: 'center' }}>
                {visSecret ? Ico.eyeOff : Ico.eye}
              </button>
            </div>
          </div>

          <StatusBadge status={statusConexao} />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={testar} disabled={testando || loading} style={{ ...btnSty('blue', testando || loading), flex: 1 }}>
              {testando ? <><Spin/> Testando…</> : 'Testar Credenciais'}
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
