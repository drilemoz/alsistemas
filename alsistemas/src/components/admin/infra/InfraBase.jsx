/**
 * InfraBase.jsx — Primitivos compartilhados pelas abas do AdminInfraestrutura.
 *
 * MIGRADO: DS Sprint (Fase 4)
 *   - PageCard    → DSCard (re-export para compatibilidade)
 *   - Btn         → DSBtn  (re-export para compatibilidade)
 *   - Badge       → DSBadge (re-export para compatibilidade)
 *   - ModalConfirm → DSModal + DSBtn (re-export para compatibilidade)
 *   - StatusDot, BarraProgresso, Input → mantidos (sem equivalente no DS)
 *   - formatBytes, Ico, Spin, C → mantidos integralmente
 *
 * Os aliases de compatibilidade garantem zero breaking change nas 4 abas filhas.
 */
import { useState } from 'react'
import { T as C, SPACE, RADIUS, FONT }  from '../../../themes/tokens'
import AdminIcon                         from '../ui/AdminIcon'
import { DSCard, DSBtn, DSBadge, DSModal } from '../ui/DS'

export { C }

// ── Ícones ─────────────────────────────────────────────────────
export const Ico = {
  gear:    <AdminIcon name="gear"    size={16} />,
  db:      <AdminIcon name="db"      size={16} />,
  cloud:   <AdminIcon name="cloud"   size={16} />,
  eye:     <AdminIcon name="eye"     size={14} />,
  eyeOff:  <AdminIcon name="eyeOff"  size={14} />,
  trash:   <AdminIcon name="trash"   size={14} />,
  save:    <AdminIcon name="save"    size={14} />,
  refresh: <AdminIcon name="refresh" size={14} />,
  check:   <AdminIcon name="check"   size={14} />,
  x:       <AdminIcon name="x"       size={14} />,
  chevL:   <AdminIcon name="chevL"   size={14} />,
  chevR:   <AdminIcon name="chevR"   size={14} />,
  img:     <AdminIcon name="img"     size={14} />,
  video:   <AdminIcon name="video"   size={14} />,
  info:    <AdminIcon name="info"    size={14} />,
  copy:    <AdminIcon name="copy"    size={13} />,
  extLink: <AdminIcon name="extLink" size={12} />,
  cpu:     <AdminIcon name="cpu"     size={16} />,
  memory:  <AdminIcon name="memory"  size={16} />,
  clear:   <AdminIcon name="clear"   size={14} />,
  index:   <AdminIcon name="index"   size={14} />,
}

export function Spin({ size = 16 }) {
  return <AdminIcon name="spinSm" size={size} />
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++ }
  return `${bytes.toFixed(1)} ${units[i]}`
}

// ── Alias: PageCard → DSCard ────────────────────────────────────
export function PageCard({ children, style }) {
  return <DSCard style={{ padding: `${SPACE.xl2}px ${SPACE.lg + 2}px`, ...style }}>{children}</DSCard>
}

// ── Alias: SectionTitle → DSSectionTitle nativo ─────────────────
export function SectionTitle({ children, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.lg + 2 }}>
      <span style={{ color: C.blue }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: FONT.lg, fontWeight: 700, color: C.text }}>{children}</h2>
    </div>
  )
}

// ── Alias: Badge → DSBadge ──────────────────────────────────────
export function Badge({ color, children }) {
  return (
    <DSBadge style={{ background: color + '22', color }}>
      {children}
    </DSBadge>
  )
}

// ── Alias: Btn → DSBtn ──────────────────────────────────────────
export function Btn({ onClick, disabled, loading, variant = 'primary', small, children, style }) {
  const variantMap = {
    primary: 'primary',
    success: 'primary',
    danger:  'danger',
    ghost:   'ghost',
  }
  return (
    <DSBtn
      variant={variantMap[variant] || 'secondary'}
      size={small ? 'sm' : undefined}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      style={style}
    >
      {children}
    </DSBtn>
  )
}

// ── Input com toggle de senha ────────────────────────────────────
export function Input({ label, value, onChange, type = 'text', placeholder, helper, showToggle, style }) {
  const [vis, setVis] = useState(false)
  const inputType = showToggle ? (vis ? 'text' : 'password') : type
  return (
    <div style={{ marginBottom: SPACE.lg + 2, ...style }}>
      {label && (
        <label style={{
          display: 'block', fontSize: FONT.sm, fontWeight: 700,
          color: C.subtle, marginBottom: SPACE.sm,
          letterSpacing: '.04em', textTransform: 'uppercase',
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={inputType} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{
            width: '100%',
            padding: showToggle ? `9px 40px 9px ${SPACE.lg}px` : `9px ${SPACE.lg}px`,
            borderRadius: RADIUS.md, fontSize: FONT.md,
            background: C.bg, border: `1.5px solid ${C.border}`,
            color: C.text, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {showToggle && (
          <button type="button" onClick={() => setVis(!vis)}
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              background: 'none', border: 'none',
              cursor: 'pointer', color: C.muted, display: 'flex',
            }}>
            {vis ? Ico.eyeOff : Ico.eye}
          </button>
        )}
      </div>
      {helper && <p style={{ fontSize: FONT.sm, color: C.muted, marginTop: SPACE.xs }}>{helper}</p>}
    </div>
  )
}

// ── StatusDot ────────────────────────────────────────────────────
export function StatusDot({ ok }) {
  const cor = ok ? C.greenSolid : C.red
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: cor, boxShadow: `0 0 6px ${cor}88`,
    }} />
  )
}

// ── BarraProgresso ───────────────────────────────────────────────
export function BarraProgresso({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: RADIUS.xs, background: C.border, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, pct || 0)}%`, height: '100%',
        background: color, borderRadius: RADIUS.xs, transition: 'width .4s',
      }} />
    </div>
  )
}

// ── Alias: ModalConfirm → DSModal ────────────────────────────────
export function ModalConfirm({ titulo, descricao, loading, onConfirm, onCancel }) {
  return (
    <DSModal
      open
      onClose={onCancel}
      title={titulo}
      size="sm"
      footer={
        <>
          <DSBtn variant="danger" loading={loading} onClick={onConfirm}>Confirmar exclusão</DSBtn>
          <DSBtn onClick={onCancel} disabled={loading}>Cancelar</DSBtn>
        </>
      }
    >
      <p style={{ fontSize: FONT.md, color: C.muted, lineHeight: 1.55 }}>{descricao}</p>
    </DSModal>
  )
}
