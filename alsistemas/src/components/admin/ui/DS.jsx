/**
 * DS.jsx — Componentes reutilizáveis do Design System do AL Sistemas.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Importe SEMPRE deste arquivo, nunca recrie estes primitivos.   │
 * │  import { DSCard, DSBadge, DSAlert, DSModal, ... } from 'DS'    │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Componentes exportados:
 *   Estrutura:   DSPageHeader, DSCard, DSSectionTitle
 *   Tabs:        DSTabs, DSTab
 *   Formulário:  DSField, DSInput, DSLabel, DSHint, DSToggle
 *   Feedback:    DSBadge, DSAlert, DSEmptyState, DSLoadingRow
 *   Ações:       DSBtn (substitui adm-btn inline)
 *   Overlay:     DSModal
 *   Tabela:      DSTableHeader, DSTable
 */

import { useState } from 'react'
import { T, SPACE, RADIUS, FONT, SHADOW, badgeStyle, alertBoxStyle, cardStyle } from '../../../themes/tokens'
import AdminIcon from './AdminIcon'

// ─────────────────────────────────────────────────────────────────
// ESTRUTURA DE PÁGINA
// ─────────────────────────────────────────────────────────────────

/**
 * DSPageHeader — cabeçalho padrão de página com título, subtítulo e ações.
 *
 * @example
 * <DSPageHeader
 *   title="Notícias"
 *   sub="Gerencie o conteúdo editorial"
 *   actions={<DSBtn onClick={...}>Nova notícia</DSBtn>}
 * />
 */
export function DSPageHeader({ title, sub, actions, style }) {
  return (
    <div className="adm-page-header" style={style}>
      <div>
        <h1 className="adm-page-title">{title}</h1>
        {sub && <p className="adm-page-sub">{sub}</p>}
      </div>
      {actions && <div className="adm-page-actions">{actions}</div>}
    </div>
  )
}

/**
 * DSCard — card de superfície padrão.
 * Usa a classe .adm-card e aceita estilo extra via prop `style`.
 *
 * @example
 * <DSCard style={{ marginBottom: 16 }}>
 *   <DSCard.Section>...</DSCard.Section>
 * </DSCard>
 */
export function DSCard({ children, style, className = '' }) {
  return (
    <div className={`adm-card ${className}`} style={style}>
      {children}
    </div>
  )
}

/** Sub-seção de card com borda inferior. */
DSCard.Section = function DSCardSection({ children, style }) {
  return (
    <div className="adm-card-section" style={style}>
      {children}
    </div>
  )
}

/**
 * DSSectionTitle — título de seção interna com ícone opcional.
 * Substitui os múltiplos SectionHead / SectionTitle espalhados por páginas.
 *
 * @example
 * <DSSectionTitle icon={<IconGear />} actions={<DSBtn size="sm">...</DSBtn>}>
 *   Configurações
 * </DSSectionTitle>
 */
export function DSSectionTitle({ icon, children, actions, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: SPACE.lg, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        {icon && <span style={{ color: T.muted, display: 'flex' }}>{icon}</span>}
        <span style={{
          fontSize: FONT.sm, fontWeight: 700, color: T.text,
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>
          {children}
        </span>
      </div>
      {actions}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ABAS
// ─────────────────────────────────────────────────────────────────

/**
 * DSTabs — wrapper de grupo de abas.
 * Usa a classe .adm-tabs para estilo e scroll horizontal.
 *
 * @example
 * const [aba, setAba] = useState('geral')
 * <DSTabs>
 *   <DSTab id="geral"    ativo={aba} onClick={setAba}>Geral</DSTab>
 *   <DSTab id="avancado" ativo={aba} onClick={setAba}>Avançado</DSTab>
 * </DSTabs>
 */
export function DSTabs({ children, style }) {
  return (
    <div className="adm-tabs" style={style}>
      {children}
    </div>
  )
}

/**
 * DSTab — botão de aba individual.
 * @param {string} id        — identificador da aba
 * @param {string} ativo     — id da aba atualmente ativa
 * @param {function} onClick — callback(id)
 */
export function DSTab({ id, ativo, onClick, icon, children }) {
  return (
    <button
      className={`adm-tab-btn${ativo === id ? ' active' : ''}`}
      onClick={() => onClick(id)}
    >
      {icon && icon}
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// BOTÕES
// ─────────────────────────────────────────────────────────────────

/**
 * DSBtn — botão padronizado que encapsula as variantes .adm-btn-*.
 *
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'icon'}                       size
 *
 * @example
 * <DSBtn variant="primary" loading={salvando} onClick={salvar}>
 *   Salvar
 * </DSBtn>
 * <DSBtn variant="danger" size="sm" onClick={excluir}>Excluir</DSBtn>
 */
export function DSBtn({
  variant = 'secondary',
  size,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
  style,
  className = '',
  title,
}) {
  const variantClass = {
    primary:   'adm-btn-primary',
    secondary: 'adm-btn-secondary',
    ghost:     'adm-btn-ghost',
    danger:    'adm-btn-danger',
  }[variant] || 'adm-btn-secondary'

  const sizeClass = size === 'sm' ? ' adm-btn-sm' : size === 'icon' ? ' adm-btn-icon' : ''

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`adm-btn ${variantClass}${sizeClass} ${className}`}
      style={style}
      title={title}
    >
      {loading
        ? <><AdminIcon name="spinSm" size={14} /> {children}</>
        : children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// FORMULÁRIOS
// ─────────────────────────────────────────────────────────────────

/**
 * DSField — wrapper de campo com label, hint e mensagem de erro.
 *
 * @example
 * <DSField label="E-mail" required hint="Será usado no login" error={erros.email}>
 *   <DSInput type="email" value={form.email} onChange={...} />
 * </DSField>
 */
export function DSField({ label, hint, error, required, children, style }) {
  return (
    <div className="adm-field" style={style}>
      {label && (
        <label className="adm-label">
          {label}{required && <span style={{ color: T.red, marginLeft: 2 }}>*</span>}
        </label>
      )}
      {children}
      {error  && <p className="adm-hint" style={{ color: T.red, marginTop: 4 }}>{error}</p>}
      {!error && hint && <p className="adm-hint">{hint}</p>}
    </div>
  )
}

/**
 * DSInput — input/textarea/select padronizado.
 *
 * @param {'input'|'textarea'|'select'} as — tipo de elemento
 * @param {boolean} mono — usa fonte monospace
 * @param {boolean} error — aplica borda de erro
 */
export function DSInput({
  as: Tag = 'input',
  mono = false,
  error = false,
  className = '',
  ...props
}) {
  const cls = [
    'adm-input',
    mono  ? 'adm-input-mono'  : '',
    error ? 'adm-input-error' : '',
    className,
  ].filter(Boolean).join(' ')

  return <Tag className={cls} {...props} />
}

/**
 * DSToggle — interruptor on/off acessível.
 *
 * @example
 * <DSToggle checked={ativo} onChange={setAtivo} label="Publicado" desc="Visível no site" />
 */
export function DSToggle({ checked, onChange, label, desc, disabled = false }) {
  return (
    <div className="adm-toggle-row">
      <div>
        {label && <div className="adm-toggle-label">{label}</div>}
        {desc  && <div className="adm-toggle-desc">{desc}</div>}
      </div>
      <button
        type="button"
        className={`adm-toggle${checked ? ' on' : ''}`}
        aria-checked={checked}
        role="switch"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────────

/**
 * DSBadge — pílula de status/tipo colorida e consistente.
 * Substitui TipoBadge, StatusBadge, Badge (InfraBase) e .adm-badge-*.
 *
 * @param {'red'|'amber'|'blue'|'green'|'gray'|'purple'|'orange'} variant
 * @param {ReactNode} icon — ícone opcional à esquerda do texto
 *
 * @example
 * <DSBadge variant="red">Erro</DSBadge>
 * <DSBadge variant="green" icon={<CheckIcon />}>Publicado</DSBadge>
 */
export function DSBadge({ variant = 'gray', icon, children, style }) {
  return (
    <span style={{ ...badgeStyle(variant), ...style }}>
      {icon && icon}
      {children}
    </span>
  )
}

/**
 * DSAlert — caixa de alerta/informação padronizada.
 * Substitui os múltiplos `infoBox()` inline espalhados pelo código.
 *
 * @param {'red'|'amber'|'blue'|'green'} variant
 * @param {ReactNode} icon — ícone à esquerda (opcional)
 *
 * @example
 * <DSAlert variant="amber" icon={<WarningIcon />}>
 *   Atenção: esta ação é irreversível.
 * </DSAlert>
 */
export function DSAlert({ variant = 'blue', icon, children, style }) {
  const iconColor = {
    red:   T.red,
    amber: T.amber,
    blue:  T.blue,
    green: T.greenSolid,
  }[variant] || T.blue

  return (
    <div style={{ ...alertBoxStyle(variant), ...style }}>
      {icon && (
        <span style={{ color: iconColor, flexShrink: 0, marginTop: 1, display: 'flex' }}>
          {icon}
        </span>
      )}
      <div style={{ fontSize: FONT.base, color: T.text, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  )
}

/**
 * DSEmptyState — estado vazio padronizado para tabelas e listas.
 *
 * @example
 * <DSEmptyState icon={<SearchIcon />} title="Nenhum resultado" desc="Tente outros filtros." />
 */
export function DSEmptyState({ icon, title, desc, action }) {
  return (
    <div className="adm-empty">
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACE.lg }}>{icon}</div>}
      {title && <p style={{ fontSize: FONT.md, fontWeight: 600, color: T.text, margin: '0 0 6px' }}>{title}</p>}
      {desc  && <p style={{ fontSize: FONT.base, color: T.muted, margin: '0 0 12px' }}>{desc}</p>}
      {action}
    </div>
  )
}

/**
 * DSLoadingRow — linha de loading para tabelas.
 * @param {number} cols — número de colunas para calcular colspan
 */
export function DSLoadingRow({ cols = 4 }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', padding: `${SPACE.xl2}px`, color: T.muted, fontSize: FONT.base }}>
        <AdminIcon name="spinSm" size={16} />
        <span style={{ marginLeft: SPACE.sm }}>Carregando…</span>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────
// TABELA
// ─────────────────────────────────────────────────────────────────

/**
 * DSTableHeader — barra de filtros/busca acima de tabelas.
 *
 * @example
 * <DSTableHeader
 *   title="Usuários"
 *   search={{ value: busca, onChange: setBusca, placeholder: 'Buscar...' }}
 *   actions={<DSBtn variant="primary">Novo</DSBtn>}
 * />
 */
export function DSTableHeader({ title, search, actions, children }) {
  return (
    <div className="adm-table-header">
      {title && <span className="adm-table-title">{title}</span>}
      {search && (
        <div className="adm-search">
          <AdminIcon name="search" size={13} />
          <input
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder || 'Buscar…'}
          />
        </div>
      )}
      {children}
      {actions}
    </div>
  )
}

/**
 * DSTable — table padronizada com scroll horizontal em mobile.
 *
 * @example
 * <DSTable>
 *   <thead><tr><th>Nome</th><th>Status</th></tr></thead>
 *   <tbody>...</tbody>
 * </DSTable>
 */
export function DSTable({ children, style, minWidth }) {
  return (
    <div className="adm-table-scroll">
      <table className="adm-table" style={{ minWidth, ...style }}>
        {children}
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────

/**
 * DSModal — modal de overlay padronizado.
 * Substitui os modais construídos inline com position:fixed em cada página.
 *
 * @param {boolean}   open      — controla visibilidade
 * @param {function}  onClose   — callback ao fechar (ESC ou clique no overlay)
 * @param {string}    title     — título do modal
 * @param {ReactNode} footer    — área de botões (rodapé)
 * @param {'sm'|'md'|'lg'|'xl'} size
 *
 * @example
 * <DSModal open={aberto} onClose={() => setAberto(false)} title="Confirmar ação"
 *   footer={<><DSBtn variant="danger" onClick={confirmar}>Excluir</DSBtn>
 *              <DSBtn onClick={() => setAberto(false)}>Cancelar</DSBtn></>}>
 *   <p>Tem certeza que deseja excluir este item?</p>
 * </DSModal>
 */
export function DSModal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null

  const widths = { sm: 400, md: 520, lg: 700, xl: 900 }
  const maxW = widths[size] || 520

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: SPACE.xl,
      }}
    >
      <div style={{
        ...cardStyle({ padding: 0, radius: RADIUS.xl }),
        width: '100%', maxWidth: maxW, boxShadow: SHADOW.md,
        display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 80px)',
      }}>
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${SPACE.lg}px ${SPACE.xl}px`,
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: FONT.lg, fontWeight: 700, color: T.text }}>{title}</span>
          <DSBtn variant="ghost" size="icon" onClick={onClose} title="Fechar">
            <AdminIcon name="x" size={16} />
          </DSBtn>
        </div>

        {/* Corpo */}
        <div style={{
          padding: `${SPACE.xl}px`,
          overflowY: 'auto',
          flex: 1,
        }}>
          {children}
        </div>

        {/* Rodapé */}
        {footer && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.sm,
            padding: `${SPACE.lg}px ${SPACE.xl}px`,
            borderTop: `1px solid ${T.border}`,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────

/**
 * DSStatCard — card de métrica padronizado.
 * Substitui MetricCard (AdminDashboard) e .adm-stat-card (admin.css).
 *
 * @example
 * <DSStatCard icon={<UsersIcon />} label="Usuários" value={2481} accent={T.blue}
 *   sub="↑ 12 este mês" loading={isLoading} />
 */
export function DSStatCard({ icon, label, value, sub, accent, loading }) {
  const ac = accent || T.accent
  return (
    <div className="adm-stat-card">
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ac, borderRadius: `${RADIUS.lg}px ${RADIUS.lg}px 0 0` }} />
      <div className="adm-stat-card-row">
        <div className="adm-stat-icon" style={{ background: `${ac}22`, color: ac }}>{icon}</div>
        <span className="adm-stat-label">{label}</span>
      </div>
      <div className="adm-stat-value">
        {loading
          ? <span style={{ opacity: .3, fontSize: FONT.xl }}>···</span>
          : typeof value === 'string' ? value : (value ?? 0).toLocaleString('pt-BR')}
      </div>
      {sub && <div className="adm-stat-delta neutral">{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SERVICE CHIP (indicador de saúde)
// ─────────────────────────────────────────────────────────────────

/**
 * DSServiceChip — indicador de status de serviço (online / offline / loading).
 * Substitui ServiceChip (AdminDashboard) e padrões similares em AdminInfraestrutura.
 *
 * @example
 * <DSServiceChip label="MongoDB" ok={mongo.ok} loading={mongo.loading} detalhe={mongo.latency} />
 */
export function DSServiceChip({ label, ok, loading, detalhe }) {
  const cor = loading ? T.amber : ok ? T.greenSolid : T.red

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACE.md,
      padding: `${SPACE.md}px 14px`,
      borderRadius: RADIUS.lg,
      background: `${cor}12`,
      border: `1px solid ${cor}30`,
    }}>
      <div style={{ flexShrink: 0 }}>
        {loading
          ? <AdminIcon name="spinSm" size={14} />
          : <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: cor, boxShadow: `0 0 6px ${cor}88`,
            }} />}
      </div>
      <div>
        <div style={{ fontSize: FONT.base, fontWeight: 700, color: cor }}>{label}</div>
        {detalhe && <div style={{ fontSize: FONT.xs, color: T.muted, marginTop: 1 }}>{detalhe}</div>}
      </div>
    </div>
  )
}
