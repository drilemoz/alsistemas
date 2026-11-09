/**
 * AdminIcon.jsx — Biblioteca centralizada de ícones SVG do painel admin.
 *
 * Uso:
 *   import AdminIcon from './AdminIcon'
 *   <AdminIcon name="edit" size={14} />
 *
 * Props:
 *   name       string   — chave do ícone (ver switch abaixo)
 *   size       number   — largura e altura em px (default: 16)
 *   style      object   — estilos extras passados ao <svg>
 *   className  string   — classes CSS extras
 *
 * Spinner animado:
 *   <AdminIcon name="spin" size={24} />   — spinner grande
 *   <AdminIcon name="spinSm" size={14} /> — spinner pequeno inline
 *
 * Chevron direcional:
 *   <AdminIcon name="chevUp" />   — aponta para cima
 *   <AdminIcon name="chevDown" /> — aponta para baixo (default)
 *   <AdminIcon name="chevL" />    — aponta para esquerda
 *   <AdminIcon name="chevR" />    — aponta para direita
 */

const SPIN_STYLE = { animation: 'adm-spin .7s linear infinite' }

export default function AdminIcon({ name, size = 16, style, className }) {
  const p = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    width: size,
    height: size,
    style,
    className,
  }

  switch (name) {
    // ── Conteúdo ───────────────────────────────────────────────
    case 'newspaper':
      return <svg {...p}><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>
    case 'news':
      return <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    case 'draft':
      return <svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'edit':
      return <svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    case 'tag':
      return <svg {...p}><path d="M7 7h.01M7 3h5l7.586 7.586a2 2 0 010 2.828L14 19a2 2 0 01-2.828 0L3.586 11.414A2 2 0 013 10V5a2 2 0 012-2z"/></svg>
    case 'cat':
      return <svg {...p}><path d="M7 7h.01M7 3h5l7.586 7.586a2 2 0 010 2.828L14 19a2 2 0 01-2.828 0L3.586 11.414A2 2 0 013 10V5a2 2 0 012-2z"/></svg>
    case 'tagEmpty':
      return <svg {...{ ...p, strokeWidth: '1.5' }}><path d="M7 7h.01M7 3h5l7.586 7.586a2 2 0 010 2.828L14 19a2 2 0 01-2.828 0L3.586 11.414A2 2 0 013 10V5a2 2 0 012-2z"/></svg>

    // ── Visibilidade ───────────────────────────────────────────
    case 'eye':
    case 'review':
      return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'eyeOff':
      return <svg {...p}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    case 'globe':
      return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
    case 'globeEmpty':
      return <svg {...{ ...p, strokeWidth: '1.5' }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>

    // ── Ações ──────────────────────────────────────────────────
    case 'plus':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><path d="M12 5v14M5 12h14"/></svg>
    case 'trash':
      return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
    case 'save':
      return <svg {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    case 'refresh':
      return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
    case 'copy':
      return <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>

    // ── Confirmação / estado ───────────────────────────────────
    case 'check':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><polyline points="20 6 9 17 4 12"/></svg>
    case 'x':
    case 'close':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    case 'alert':
      return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'warn':
      return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'info':
      return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    case 'archive':
      return <svg {...p}><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>

    // ── Infraestrutura ────────────────────────────────────────
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    case 'db':
      return <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
    case 'cloud':
      return <svg {...p}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>
    case 'cloudUp':
      return <svg {...p}><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
    case 'server':
      return <svg {...p}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
    case 'cpu':
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
    case 'memory':
      return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 6v12M16 6v12M12 6v12M22 12h-4M2 12h4"/></svg>
    case 'seed':
      return <svg {...p}><path d="M12 22V12"/><path d="M5 12c0-4.4 3.1-8 7-8s7 3.6 7 8"/><path d="M5 12s4-2 7 2 7-2 7-2"/></svg>

    // ── Mídia / ficheiros ──────────────────────────────────────
    case 'img':
    case 'image':
      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    case 'video':
      return <svg {...p}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
    case 'index':
      return <svg {...p}><path d="M4 4h16v16H4z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
    case 'clear':
      return <svg {...p}><path d="M3 6h18M9 6V4h6v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>

    // ── Comunicação / social ───────────────────────────────────
    case 'mail':
      return <svg {...p}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
    case 'share':
      return <svg {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
    case 'robot':
      return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M12 2a3 3 0 000 6"/><path d="M12 8v3"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>

    // ── Navegação / layout ─────────────────────────────────────
    case 'layers':
      return <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    case 'bus':
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 19v2M16 19v2"/></svg>
    case 'cal':
      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    case 'chart':
      return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    case 'map':
      return <svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
    case 'seo':
      return <svg {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    case 'id':
      return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
    case 'arrow':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>

    // ── Segurança ─────────────────────────────────────────────
    case 'shield':
      return <svg {...{ ...p, strokeWidth: '2.2' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

    // ── Chevrons ──────────────────────────────────────────────
    case 'chevL':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><polyline points="15 18 9 12 15 6"/></svg>
    case 'chevR':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><polyline points="9 18 15 12 9 6"/></svg>
    case 'chevUp':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><polyline points="18 15 12 9 6 15"/></svg>
    case 'chevDown':
      return <svg {...{ ...p, strokeWidth: '2.5' }}><polyline points="6 9 12 15 18 9"/></svg>

    // ── Spinners ──────────────────────────────────────────────
    case 'spin':
      return (
        <>
          <style>{`@keyframes adm-spin{to{transform:rotate(360deg)}}`}</style>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            width={size} height={size}
            style={{ margin: '0 auto', opacity: .4, ...SPIN_STYLE, ...style }}>
            <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/>
            <path d="M21 12a9 9 0 00-9-9"/>
          </svg>
        </>
      )
    case 'spinSm':
      return (
        <>
          <style>{`@keyframes adm-spin{to{transform:rotate(360deg)}}`}</style>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            width={size} height={size}
            style={{ ...SPIN_STYLE, ...style }}>
            <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/>
            <path d="M21 12a9 9 0 00-9-9"/>
          </svg>
        </>
      )
    case 'checkLg':
      return (
        <svg {...{ ...p, strokeWidth: '2.5' }}>
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      )

    // ── Sprint 2 ──────────────────────────────────────
    case 'palette':
      return (
        <svg {...p}>
          <circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/>
          <circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/>
          <path d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10 1.657 0 3-.672 3-1.5v-1c0-.828 1.343-1.5 3-1.5h2c.828 0 1.5-.672 1.5-1.5C21.5 7.201 17.299 2 12 2z"/>
        </svg>
      )
    case 'setup':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      )
    case 'rss':
      return (
        <svg {...p}>
          <path d="M4 11a9 9 0 019 9"/><path d="M4 4a16 16 0 0116 16"/>
          <circle cx="5" cy="19" r="1"/>
        </svg>
      )
    case 'key':
      return (
        <svg {...p}>
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      )
    case 'externalLink':
    case 'extLink':
    case 'ext':
      return (
        <svg {...p}>
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      )
    case 'git':
      return (
        <svg {...p}>
          <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
          <path d="M6 9v6M15.7 6.7L8.3 11.3M15.7 17.3L8.3 12.7"/>
        </svg>
      )
    case 'ia':
      return (
        <svg {...p}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          <line x1="9" y1="10" x2="9" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/>
        </svg>
      )

    default:
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[AdminIcon] ícone desconhecido: "${name}"`)
      }
      return null
  }
}
