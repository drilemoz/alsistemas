/**
 * AbaConfiguracoes.jsx — Aba de credenciais MongoDB e Cloudinary.
 */
import { useState, useEffect } from 'react'
import { setupService, infraestruturaService } from '../../../services/api'
import toast from 'react-hot-toast'
import {
  C, Ico, Spin, PageCard, SectionTitle, Btn, Input, StatusDot,
} from './InfraBase'

export default function AbaConfiguracoes() {
  const [form, setForm] = useState({
    mongo_uri: '', cloudinary_cloud_name: '', cloudinary_api_key: '', cloudinary_api_secret: '',
  })
  const [carregando,  setCarregando]  = useState(true)
  const [salvando,    setSalvando]    = useState(false)
  const [testando,    setTestando]    = useState(false)
  const [resultTeste, setResultTeste] = useState(null)

  useEffect(() => {
    setCarregando(true)
    setupService.lerEnvConfig()
      .then(d => setForm({
        mongo_uri:              d.mongo_uri              || '',
        cloudinary_cloud_name:  d.cloudinary_cloud_name  || '',
        cloudinary_api_key:     d.cloudinary_api_key     || '',
        cloudinary_api_secret:  d.cloudinary_api_secret  || '',
      }))
      .catch(() => toast.error('Erro ao carregar configurações'))
      .finally(() => setCarregando(false))
  }, [])

  async function handleSalvar() {
    setSalvando(true)
    try {
      await setupService.salvarEnvConfig(form)
      toast.success('Configurações salvas! As conexões serão usadas na próxima requisição.')
    } catch (e) { toast.error(e.message || 'Erro ao salvar') }
    finally { setSalvando(false) }
  }

  async function handleTestar() {
    setTestando(true); setResultTeste(null)
    try { setResultTeste(await infraestruturaService.testarConexoes()) }
    catch (e) { toast.error(e.message || 'Erro ao testar conexões') }
    finally { setTestando(false) }
  }

  if (carregando) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size={24} /></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: C.blue + '18', border: `1px solid ${C.blue}40`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10 }}>
        <span style={{ color: C.blue, flexShrink: 0, marginTop: 1 }}>{Ico.info}</span>
        <div style={{ fontSize: 13, color: C.subtle, lineHeight: 1.6 }}>
          <b style={{ color: C.text }}>Onde obter as credenciais?</b><br/>
          <b>MongoDB:</b>{' '}
          <a href="https://cloud.mongodb.com" target="_blank" rel="noreferrer" style={{ color: C.blue }}>
            cloud.mongodb.com
          </a>{' '}→ Database → Connect → Drivers → copie a Connection String.<br/>
          <b>Cloudinary:</b>{' '}
          <a href="https://console.cloudinary.com/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: C.blue }}>
            console.cloudinary.com
          </a>{' '}→ Settings → API Keys.
        </div>
      </div>

      <PageCard>
        <SectionTitle icon={Ico.db}>MongoDB</SectionTitle>
        <Input
          label="Connection String (URI)"
          value={form.mongo_uri}
          onChange={v => setForm(p => ({ ...p, mongo_uri: v }))}
          showToggle
          placeholder="mongodb+srv://usuario:senha@cluster.mongodb.net/alsistemas"
        />
      </PageCard>

      <PageCard>
        <SectionTitle icon={Ico.cloud}>Cloudinary</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <Input
            label="Cloud Name"
            value={form.cloudinary_cloud_name}
            onChange={v => setForm(p => ({ ...p, cloudinary_cloud_name: v }))}
            placeholder="meu-cloud"
          />
          <Input
            label="API Key"
            value={form.cloudinary_api_key}
            onChange={v => setForm(p => ({ ...p, cloudinary_api_key: v }))}
            placeholder="123456789012345"
          />
        </div>
        <Input
          label="API Secret"
          value={form.cloudinary_api_secret}
          onChange={v => setForm(p => ({ ...p, cloudinary_api_secret: v }))}
          showToggle
          placeholder="••••••••••••••••••••••"
          helper="Nunca compartilhe o API Secret."
        />
      </PageCard>

      {resultTeste && (
        <PageCard>
          <SectionTitle icon={Ico.check}>Resultado do Teste</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { key: 'mongodb',    label: 'MongoDB',    info: `Estado: ${resultTeste.mongodb?.estado} · Banco: ${resultTeste.mongodb?.db}` },
              { key: 'cloudinary', label: 'Cloudinary', info: resultTeste.cloudinary?.ok ? 'Conectado ✓' : `Erro: ${resultTeste.cloudinary?.erro}` },
            ].map(({ key, label, info }) => (
              <div key={key} style={{ background: C.surf2, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <StatusDot ok={resultTeste[key]?.ok} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{label}</span>
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{info}</p>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <Btn onClick={handleSalvar} loading={salvando} variant="success">{Ico.save} Salvar Configurações</Btn>
        <Btn onClick={handleTestar} loading={testando} variant="ghost">{Ico.refresh} Testar Conexões</Btn>
      </div>
    </div>
  )
}
