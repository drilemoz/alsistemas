import { lazyWithRetry } from '../../utils/lazyWithRetry'
/**
 * AdminCloudinary.jsx — Galeria de mídia + modal de configuração de credenciais.
 * Botão ⚙ no header abre modal com Cloud Name, API Key e API Secret.
 *
 * DS Sprint (conformidade total):
 *   - DSModal      → substitui overlay position:fixed inline
 *   - DSPageHeader → substitui header div inline com button manual
 *   - DSBtn        → substitui s.btnCfg (3×) e botões inline em SecretField
 *   - DSAlert      → substitui s.erro, s.ok, s.info hardcoded (#ef4444, #22c55e, #3b82f6)
 *                    e o bloco "já configurado" inline
 *   - C.surface2   → corrige alias errado C.surf2 em s.resultado
 */
import { useState, useEffect, Suspense } from 'react'
import { T as C, SPACE, RADIUS, FONT }  from '../../themes/tokens'
import { setupService,
         infraestruturaService }        from '../../services/api'
import { Spin, StatusDot, Btn, Ico }   from '../../components/admin/infra/InfraBase'
import {
  DSPageHeader,
  DSBtn, DSAlert, DSModal,
} from '../../components/admin/ui/DS'

const AbaCloudinary = lazyWithRetry(() => import('../../components/admin/infra/AbaCloudinary'))

// ── Estilos sem equivalente no DS (grid, input, label) ─────────

const s = {
  label: {
    display: 'block', fontSize: FONT.xs, fontWeight: 700,
    color: C.muted, marginBottom: SPACE.xs,
    letterSpacing: '.04em', textTransform: 'uppercase',
  },
  input: {
    padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.md,
    border: `1.5px solid ${C.border}`,
    background: C.bg || C.surface,
    color: C.text, fontSize: FONT.base,
    width: '100%', boxSizing: 'border-box',
    outline: 'none',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `0 ${SPACE.md}px` },
  resultado: {
    background: C.surface2, border: `1px solid ${C.border}`,  /* ✅ C.surf2 → C.surface2 */
    borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.md,
  },
}

// ── Ícones inline ──────────────────────────────────────────────

function IcoCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ width: 22, height: 22, flexShrink: 0 }}>
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
    </svg>
  )
}
function IcoGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}
function IcoEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function IcoEyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ── Sentinela — backend nunca expõe segredos em texto puro ────

const SENTINEL = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
const isSentinel = (v) => v === SENTINEL

// ── Campo com toggle mostrar/ocultar ──────────────────────────

function SecretField({ label, value, onChange, placeholder }) {
  const [visivel, setVisivel] = useState(false)
  const configurado = isSentinel(value)

  if (configurado) {
    return (
      <div style={{ marginBottom: SPACE.md }}>
        <label style={s.label}>{label}</label>
        {/* ✅ DSAlert substitui bloco verde hardcoded (#22c55e55 / #22c55e11) */}
        <DSAlert variant="green" style={{ marginBottom: SPACE.xs }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: SPACE.sm }}>
            <span style={{ fontWeight: 600 }}>Valor já configurado</span>
            <DSBtn size="sm" variant="ghost" onClick={() => onChange('')}>Alterar</DSBtn>
          </div>
        </DSAlert>
        <p style={{ fontSize: FONT.xs, color: C.muted, marginTop: SPACE.xs }}>
          Clique em "Alterar" para definir um novo valor. O segredo não é exibido por segurança.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: SPACE.md }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
        <label style={s.label}>{label}</label>
        {/* ✅ DSBtn substitui button inline com hover manual */}
        <DSBtn size="sm" variant="ghost" onClick={() => setVisivel(v => !v)}>
          {visivel ? <><IcoEyeOff /> Ocultar</> : <><IcoEye /> Mostrar</>}
        </DSBtn>
      </div>
      <input
        type={visivel ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        spellCheck={false}
        style={{ ...s.input, fontFamily: visivel ? 'monospace' : 'inherit', fontSize: visivel ? FONT.sm : FONT.base, letterSpacing: visivel ? 'normal' : '2px' }}
      />
    </div>
  )
}

// Campo simples (sem segredo)
function Campo({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: SPACE.md }}>
      <label style={s.label}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={s.input}
      />
    </div>
  )
}

// ── Modal: Configurar Cloudinary ──────────────────────────────
// ✅ DSModal substitui overlay position:fixed inline (s.overlay + s.modal + s.modalH)

function ModalConfigCloudinary({ aoFechar }) {
  const [form, setForm] = useState({
    cloudinary_cloud_name: '',
    cloudinary_api_key:    '',
    cloudinary_api_secret: '',
  })
  const [carregando, setCarregando] = useState(true)
  const [salvando,   setSalvando]   = useState(false)
  const [testando,   setTestando]   = useState(false)
  const [resultado,  setResultado]  = useState(null)
  const [erro,       setErro]       = useState('')
  const [sucesso,    setSucesso]    = useState('')

  const campo = (k) => ({
    value:    form[k],
    onChange: v => setForm(p => ({ ...p, [k]: v })),
  })

  useEffect(() => {
    setupService.lerEnvConfig()
      .then(d => setForm({
        cloudinary_cloud_name: d.cloudinary_cloud_name || '',
        cloudinary_api_key:    d.cloudinary_api_key    || '',
        cloudinary_api_secret: d.cloudinary_api_secret || '',
      }))
      .catch(() => setErro('Não foi possível carregar as configurações atuais.'))
      .finally(() => setCarregando(false))
  }, [])

  const salvar = async () => {
    setSalvando(true); setErro(''); setSucesso(''); setResultado(null)
    try {
      const atual = await setupService.lerEnvConfig()
      await setupService.salvarEnvConfig({ ...atual, ...form })
      setSucesso('Credenciais salvas com sucesso!')
    } catch (e) { setErro(e.message || 'Erro ao salvar.') }
    finally     { setSalvando(false) }
  }

  const testar = async () => {
    setTestando(true); setErro(''); setResultado(null); setSucesso('')
    try   { setResultado(await infraestruturaService.testarConexoes()) }
    catch (e) { setErro(e.message || 'Erro ao testar.') }
    finally   { setTestando(false) }
  }

  return (
    <DSModal
      open
      onClose={aoFechar}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}><IcoCloud /> Configurar credenciais Cloudinary</span>}
      footer={
        <>
          {/* ✅ DSBtn substitui <button style={s.btnCfg}> */}
          <DSBtn variant="ghost" onClick={aoFechar}>Fechar</DSBtn>
          <Btn onClick={testar} loading={testando} variant="ghost">
            {Ico.refresh} Testar conexão
          </Btn>
          <Btn onClick={salvar} loading={salvando} variant="success">
            {Ico.save} Salvar credenciais
          </Btn>
        </>
      }
    >
      {carregando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2 }}>
          <Spin size={26} />
        </div>
      ) : (
        <>
          {/* ✅ DSAlert substitui s.info hardcoded (#3b82f618 / #3b82f640) */}
          <DSAlert variant="blue" style={{ marginBottom: SPACE.lg }}>
            Obtenha as credenciais em{' '}
            <a href="https://console.cloudinary.com/settings/api-keys" target="_blank" rel="noreferrer"
              style={{ color: C.blue }}>
              console.cloudinary.com
            </a>
            {' '}→ Settings → API Keys.
          </DSAlert>

          <div style={s.grid2}>
            <Campo
              label="Cloud Name"
              placeholder="meu-cloud"
              {...campo('cloudinary_cloud_name')}
            />
            <Campo
              label="API Key"
              placeholder="123456789012345"
              {...campo('cloudinary_api_key')}
            />
          </div>

          <SecretField
            label="API Secret"
            placeholder="••••••••••••••••••••••"
            ocultarPor={true}
            {...campo('cloudinary_api_secret')}
          />

          {/* ✅ DSAlert substitui s.erro (#ef444422) e s.ok (#22c55e22) hardcoded */}
          {erro    && <DSAlert variant="red"   style={{ marginTop: SPACE.md }}>{erro}</DSAlert>}
          {sucesso && <DSAlert variant="green" style={{ marginTop: SPACE.md }}>{sucesso}</DSAlert>}

          {resultado && (
            <div style={s.resultado}>
              <div style={{ fontWeight: 700, fontSize: FONT.sm, color: C.text, marginBottom: SPACE.sm }}>
                Resultado do teste
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                <StatusDot ok={resultado.cloudinary?.ok} />
                <span style={{ fontSize: FONT.sm, color: C.text, fontWeight: 600 }}>Cloudinary</span>
                <span style={{ fontSize: FONT.xs, color: C.muted, marginLeft: 'auto' }}>
                  {resultado.cloudinary?.ok ? 'Conectado ✓' : resultado.cloudinary?.erro || 'Falha'}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </DSModal>
  )
}

// ── Página Principal ───────────────────────────────────────────

export default function AdminCloudinary() {
  const [modalConfig, setModalConfig] = useState(false)

  return (
    <div className="adm-page">
      {/* ✅ DSPageHeader substitui div adm-page-header com button s.btnCfg manual */}
      <DSPageHeader
        title={<span style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}><IcoCloud /> Cloudinary</span>}
        sub="Galeria de mídia, uso de armazenamento e limpeza"
        actions={
          <DSBtn variant="secondary" onClick={() => setModalConfig(true)} title="Configurar credenciais Cloudinary">
            <IcoGear /> Configurar credenciais
          </DSBtn>
        }
      />

      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2 }}>
          <Spin size={24} />
        </div>
      }>
        <AbaCloudinary />
      </Suspense>

      {modalConfig && <ModalConfigCloudinary aoFechar={() => setModalConfig(false)} />}
    </div>
  )
}
