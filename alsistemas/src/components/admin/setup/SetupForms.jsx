/**
 * SetupForms.jsx — Componentes de UI primitivos do instalador.
 *
 * MIGRADO: DS Sprint — todas as cores, espaçamentos e border-radius
 * agora usam tokens de design. Funções de estilo delegam para helpers
 * do tokens.js para garantir consistência multi-tema.
 *
 * Exporta:
 *   estilos:       wrap, card, labelSty, inputSty, errMsg, btnSty,
 *                  infoBox, divider, secTitle
 *   primitivos:    Campo, Check, StatusBadge, CampoAcessoFixo
 *   dados:         OPCOES_SEED, REGRAS_SENHA
 *   compostos:     SeletorDados, RegrasSenha
 */
import { useState } from 'react'
import { T as C, SPACE, RADIUS, FONT, cardStyle, alertBoxStyle } from '../../../themes/tokens'
import AdminIcon     from '../ui/AdminIcon'
import ForcaSenha    from '../ui/ForcaSenha'

// Setup roda standalone (fora do .admin-shell) com fundo escuro fixo.
// O verde do instalador é o verde hardcoded — não usa var(--adm-accent).
const GREEN_SETUP = C.accent

// ── Ícones ────────────────────────────────────────────────────
export const Ico = {
  shield:  <AdminIcon name="shield"  size={24} />,
  check:   <AdminIcon name="checkLg" size={38} />,
  arrow:   <AdminIcon name="arrow"   size={14} />,
  info:    <AdminIcon name="info"    size={14} />,
  warn:    <AdminIcon name="warn"    size={14} />,
  db:      <AdminIcon name="db"      size={14} />,
  seed:    <AdminIcon name="seed"    size={14} />,
  trash:   <AdminIcon name="trash"   size={14} />,
  refresh: <AdminIcon name="refresh" size={14} />,
  eye:     <AdminIcon name="eye"     size={15} />,
  eyeOff:  <AdminIcon name="eyeOff"  size={15} />,
  gear:    <AdminIcon name="gear"    size={14} />,
  chev:    (up) => <AdminIcon name={up ? 'chevUp' : 'chevDown'} size={13} style={{ transition: 'transform .2s' }} />,
  save:    <AdminIcon name="save"    size={14} />,
}

export function Spin({ size = 14 }) {
  return <AdminIcon name="spinSm" size={size} />
}

// Exporta C para uso nos componentes do instalador
export { C }

// ── Tokens de layout do instalador (standalone dark) ──────────
export const wrap = {
  minHeight: '100vh',
  background: `radial-gradient(circle at 15% 0%, ${C.accent}18, transparent 34%), ${C.pageBg}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${SPACE.xl}px ${SPACE.md}px`,
  fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
}

// card() — usa cardStyle() do tokens como base, sobrepõe fundo escuro
export const card = (extra = {}) => ({
  ...cardStyle({ padding: `${SPACE.xl}px`, radius: RADIUS.xl }),
  background: C.surface,
  ...extra,
})

export const labelSty = {
  display: 'block',
  fontSize: FONT.sm,
  fontWeight: 700,
  color: C.subtle,
  marginBottom: SPACE.sm,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
}

export const inputSty = (err = false, foc = false) => ({
  width: '100%',
  padding: `10px 13px`,
  borderRadius: RADIUS.md,
  fontSize: FONT.md,
  background: C.pageBg,
  border: `1.5px solid ${err ? C.red : foc ? C.borderFoc : C.border}`,
  color: C.text,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border .15s',
})

export const errMsg = {
  color: '#f87171',
  fontSize: FONT.sm,
  marginTop: SPACE.xs,
}

export const divider = {
  border: 'none',
  borderTop: `1px solid ${C.border}`,
  margin: `${SPACE.xl2}px 0`,
}

export const secTitle = {
  fontSize: FONT.xs,
  fontWeight: 800,
  color: C.muted,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  marginBottom: SPACE.lg,
}

// infoBox() — usa alertBoxStyle() do tokens como base
export const infoBox = (color = C.blue) => ({
  ...alertBoxStyle('blue'),
  background: `${color}1a`,
  border: `1px solid ${color}40`,
  borderRadius: RADIUS.lg,
  padding: `${SPACE.md}px 14px`,
  marginBottom: SPACE.xl2 - 2,
})

export const btnSty = (variant = 'green', disabled = false) => {
  const bg = disabled
    ? C.elevated
    : variant === 'green'  ? GREEN_SETUP
    : variant === 'blue'   ? '#1d4ed8'
    : variant === 'danger' ? C.redDim
    : C.elevated
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    width: '100%',
    padding: `11px ${SPACE.xl}px`,
    borderRadius: RADIUS.lg,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: FONT.md,
    fontWeight: 700,
    transition: 'opacity .15s',
    background: bg,
    color: disabled ? C.muted : C.text,
    opacity: disabled ? .55 : 1,
  }
}

// ── Regras de senha ───────────────────────────────────────────
export const REGRAS_SENHA = [
  { id: 'len',     label: 'Mínimo 8 caracteres',                     test: s => s.length >= 8 },
  { id: 'upper',   label: 'Pelo menos uma letra maiúscula',           test: s => /[A-Z]/.test(s) },
  { id: 'number',  label: 'Pelo menos um número',                     test: s => /[0-9]/.test(s) },
  { id: 'special', label: 'Pelo menos um caractere especial (!@#$…)', test: s => /[^A-Za-z0-9]/.test(s) },
]

export function RegrasSenha({ senha }) {
  if (!senha) return null
  return (
    <div style={{
      background: C.elevated,
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.md,
      padding: `${SPACE.md}px ${SPACE.lg}px`,
      marginTop: SPACE.md,
      display: 'flex',
      flexDirection: 'column',
      gap: SPACE.xs + 1,
    }}>
      {REGRAS_SENHA.map(r => {
        const ok = r.test(senha)
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm + 1 }}>
            <svg viewBox="0 0 12 12" fill="none"
              stroke={ok ? C.greenAcc : C.border}
              strokeWidth="2.5" width="11" height="11">
              {ok
                ? <polyline points="1 6 4.5 9.5 11 2" />
                : <line x1="6" y1="1" x2="6" y2="11" />}
            </svg>
            <span style={{ fontSize: FONT.sm, color: ok ? C.greenAcc : C.muted, transition: 'color .15s' }}>
              {r.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── CampoAcessoFixo ───────────────────────────────────────────
export function CampoAcessoFixo() {
  return (
    <div style={{ marginBottom: SPACE.xl }}>
      <label style={labelSty}>Nível de acesso</label>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.md + 2,
        padding: `10px 13px`,
        borderRadius: RADIUS.md,
        fontSize: FONT.md,
        background: C.pageBg,
        border: `1.5px solid ${C.border}`,
        color: C.muted,
        boxSizing: 'border-box',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={C.greenAcc} strokeWidth="2" width="14" height="14">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={{ color: C.text, fontWeight: 600 }}>Superadmin</span>
        <span style={{ color: C.muted, fontSize: FONT.sm }}>— Acesso total ao sistema</span>
        <svg viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" width="13" height="13"
          style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p style={{ fontSize: FONT.xs, color: C.muted, marginTop: SPACE.xs }}>
        O primeiro usuário recebe automaticamente acesso total. Outros perfis podem ser criados depois.
      </p>
    </div>
  )
}

// ── Campo com toggle de senha ─────────────────────────────────
export function Campo({ label: lbl, type = 'text', placeholder, value, onChange, erro, autoComplete, mostrarForca }) {
  const [foc,     setFoc]     = useState(false)
  const [visivel, setVisivel] = useState(false)
  const eSenha = type === 'password'
  return (
    <div style={{ marginBottom: SPACE.xl }}>
      <label style={labelSty}>{lbl}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={eSenha ? (visivel ? 'text' : 'password') : type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFoc(true)}
          onBlur={() => setFoc(false)}
          style={{ ...inputSty(!!erro, foc), paddingRight: eSenha ? 38 : 13 }}
        />
        {eSenha && (
          <button
            type="button"
            onClick={() => setVisivel(v => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, padding: 2, display: 'flex', alignItems: 'center',
            }}
            title={visivel ? 'Ocultar senha' : 'Ver senha'}
          >
            {visivel ? Ico.eyeOff : Ico.eye}
          </button>
        )}
      </div>
      {erro && <p style={errMsg}>{erro}</p>}
      {eSenha && mostrarForca && <ForcaSenha senha={value} />}
    </div>
  )
}

// ── Check estilizado ──────────────────────────────────────────
export function Check({ checked, onChange, label: lbl, desc, color = C.greenAcc, warnMode = false }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        cursor: 'pointer',
        padding: `11px 13px`,
        borderRadius: RADIUS.lg,
        marginBottom: SPACE.md + 2,
        background: checked ? (warnMode ? '#7f1d1d22' : '#16653422') : C.elevated,
        border: `1.5px solid ${checked ? `${color}55` : C.border}`,
        transition: 'all .15s',
      }}
    >
      <div style={{
        width: 17, height: 17,
        borderRadius: RADIUS.xs + 1,
        flexShrink: 0, marginTop: 1,
        border: `2px solid ${checked ? color : C.border}`,
        background: checked ? color : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s',
      }}>
        {checked && (
          <svg viewBox="0 0 12 12" fill="none"
            stroke={warnMode ? 'white' : '#0f172a'}
            strokeWidth="2.5" width="10" height="10">
            <polyline points="1 6 4.5 9.5 11 2" />
          </svg>
        )}
      </div>
      <div>
        <p style={{ fontSize: FONT.md, fontWeight: 600, color: C.text, margin: `0 0 2px` }}>{lbl}</p>
        {desc && <p style={{ fontSize: FONT.sm, color: C.muted, lineHeight: 1.55, margin: 0 }}>{desc}</p>}
      </div>
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────
export function StatusBadge({ status }) {
  if (!status) return null
  const ok = status.ok
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: SPACE.sm,
      padding: `7px ${SPACE.lg}px`,
      borderRadius: RADIUS.md,
      marginTop: SPACE.md + 2,
      background: ok ? '#16653422' : '#7f1d1d22',
      border: `1px solid ${ok ? `${C.greenAcc}44` : `${C.red}44`}`,
    }}>
      {ok
        ? <svg viewBox="0 0 24 24" fill="none" stroke={C.greenAcc} strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      }
      <span style={{ fontSize: FONT.sm, fontWeight: 600, color: ok ? C.greenAcc : '#f87171', lineHeight: 1.4 }}>
        {status.mensagem || status.erro}
      </span>
    </div>
  )
}

// ── Opções de seed e seletor ──────────────────────────────────
export const OPCOES_SEED = [
  { id: 'categorias',        label: 'Categorias',         desc: '15 categorias (Política, Saúde, Esportes, Turismo…)' },
  { id: 'noticias',          label: 'Notícias',           desc: '12 notícias de exemplo publicadas' },
  { id: 'fontes',            label: 'Fontes',             desc: '8 fontes jornalísticas (Prefeitura, Câmara, PM…)' },
  { id: 'topicos',           label: 'Tópicos da Faixa',   desc: '5 tópicos para a faixa rolante da home' },
  { id: 'eventos',           label: 'Eventos',            desc: '3 eventos futuros na agenda' },
  { id: 'onibus',            label: 'Horários de Ônibus', desc: '2 linhas com horários semanais' },
  { id: 'modulos',           label: 'Módulos da Home',    desc: 'História da cidade, Belezas naturais, Eventos, Horário de ônibus' },
  { id: 'noticias_externas', label: 'Notícias Externas',  desc: '3 links de portais nacionais (G1, UOL, BBC)' },
]

export function SeletorDados({ selecionados, onChange }) {
  const toggle = (id) => {
    onChange(selecionados.includes(id)
      ? selecionados.filter(x => x !== id)
      : [...selecionados, id])
  }
  const todos = selecionados.length === OPCOES_SEED.length
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md + 2 }}>
        <p style={secTitle}>Dados a instalar</p>
        <button
          type="button"
          onClick={() => onChange(todos ? [] : OPCOES_SEED.map(o => o.id))}
          style={{
            fontSize: FONT.sm,
            fontWeight: 600,
            color: C.blue,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: `2px ${SPACE.sm}px`,
          }}
        >
          {todos ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        {OPCOES_SEED.map(op => (
          <Check
            key={op.id}
            checked={selecionados.includes(op.id)}
            onChange={() => toggle(op.id)}
            label={op.label}
            desc={op.desc}
          />
        ))}
      </div>
      {selecionados.length === 0 && (
        <p style={{ fontSize: FONT.sm, color: C.orange, marginTop: SPACE.xs }}>
          Nenhum dado selecionado — apenas a conta admin será criada.
        </p>
      )}
    </div>
  )
}
