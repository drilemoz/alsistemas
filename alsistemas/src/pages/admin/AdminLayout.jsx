import { useState, useRef, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { errosService } from '../../services/api'
import { useTheme } from '../../context/ThemeContext'
import toast from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

/**
 * Estrutura de navegação.
 *
 * Item simples:  { to, label, icon, perm }
 * Grupo/submenu: { group: true, label, icon, perm, children: [ item, ... ] }
 *
 * perm: null  → visível para qualquer usuário autenticado.
 * perm: 'x.y' → só aparece se o usuário tiver a permissão (ou for superadmin).
 * Num grupo, se NENHUM filho for visível o grupo inteiro some.
 */
// Sprint 1 — NAV reorganizado para SaaS admin-only.
// Itens core do SaaS ficam no nível raiz para acesso rápido.
// Módulo Portal agrupado em seção colapsável — rotas preservadas intactas.
const NAV = [
  // ── Core SaaS ────────────────────────────────────────────────
  { to: '/admin',                label: 'Dashboard',      icon: IconGrid,      perm: null                          },
  { to: '/admin/erros',          label: 'Erros & Logs',   icon: IconAlerta,    perm: 'erros.ver'                   },
  { to: '/admin/usuarios',       label: 'Usuários',       icon: IconUsers,     perm: 'usuarios.gerenciar'          },
  { to: '/admin/mongo',          label: 'MongoDB',        icon: IconMongo,     perm: 'mongodb.gerenciar'           },
  { to: '/admin/cloudinary',     label: 'Cloudinary',     icon: IconCloud,     perm: 'cloudinary.gerenciar'        },
  { to: '/admin/sistema',        label: 'Sistema',        icon: IconCpu,       perm: 'sistema.gerenciar'           },
  { to: '/admin/monitor',        label: 'Monitor',        icon: IconMonitor,   perm: 'sistema.gerenciar'           },
  { to: '/admin/seguranca',      label: 'Segurança',      icon: IconShield,    perm: 'seguranca.gerenciar'          },
  { to: '/admin/github',         label: 'GitHub',         icon: IconGitHub,    perm: 'github.gerenciar'            },
  { to: '/admin/cloudflare',     label: 'Cloudflare',     icon: IconCF,        perm: 'cloudflare.gerenciar'        },
  { to: '/admin/projetos',       label: 'Projetos',       icon: IconFolderCode,perm: 'projetos.ver'                },
  { to: '/admin/plataformas',    label: 'Plataformas',    icon: IconPlatform,  perm: 'plataformas.gerenciar'       },
  { to: '/admin/ai-assistant',   label: 'IA Assistant',   icon: IconIA,        perm: 'ia.usar'                     },
  { to: '/admin/backup',         label: 'Backup',         icon: IconBackup,    perm: 'backup.gerenciar'            },
  { to: '/admin/arquivos',       label: 'Arquivos',       icon: IconFileEdit,  perm: 'arquivos.gerenciar'          },
  { to: '/admin/setup',          label: 'Setup',          icon: IconSetup,     perm: 'configuracoes.gerenciar'     },
  { to: '/admin/temas',          label: 'Temas',          icon: IconPalette,   perm: 'temas.gerenciar'             },

  // ── Portal público / CMS ────────────────────────────────────
  {
    group: true,
    label: 'Portal do Site',
    icon: IconGlobe,
    perm: null,
    children: [
      { to: '/',                   label: 'Ver site',          icon: IconGlobe,  perm: null,                         external: true },
      { to: '/admin/noticias',     label: 'Notícias',          icon: IconDoc,    perm: 'noticias.ver'               },
      { to: '/admin/nova-noticia', label: 'Nova notícia',      icon: IconPlus,   perm: 'noticias.criar'             },
      { to: '/admin/categorias',   label: 'Categorias',        icon: IconTag,    perm: 'categorias.gerenciar'        },
      { to: '/admin/modulos',      label: 'Módulos',           icon: IconLayers, perm: 'modulos.gerenciar'           },
      { to: '/admin/onibus',       label: 'Horários de ônibus',icon: IconBus,    perm: 'onibus.gerenciar'            },
      { to: '/admin/eventos',      label: 'Eventos',           icon: IconCal,    perm: 'eventos.gerenciar'           },
      { to: '/admin/newsletter',   label: 'Newsletter',        icon: IconMail,   perm: 'newsletter.gerenciar'        },
      { to: '/admin/seo',          label: 'SEO',               icon: IconSearch, perm: 'seo.gerenciar'               },
      { to: '/admin/rss-import',   label: 'Importar RSS',      icon: IconRss,    perm: 'rss.gerenciar'               },
      { to: '/admin/fontes',       label: 'Fontes',            icon: IconGlobe,  perm: 'fontes.gerenciar'            },
    ],
  },
]

/* ── helpers ────────────────────────────────────────────────── */
function isActive(pathname, to) {
  if (to === '/admin') return pathname === '/admin'
  return pathname.startsWith(to)
}

function groupHasActive(pathname, group) {
  return group.children.some(c => isActive(pathname, c.to))
}

/** Percorre NAV e devolve o label do item/filho que está ativo */
function labelAtualFromNav(pathname, navItems) {
  for (const item of navItems) {
    if (item.group) {
      const filho = item.children.find(c => isActive(pathname, c.to))
      if (filho) return filho.label
    } else {
      if (isActive(pathname, item.to)) return item.label
    }
  }
  return 'Admin'
}

/* ── Componente principal ───────────────────────────────────── */
export default function AdminLayout() {
  const { pathname }                             = useLocation()
  const { user, logout: doLogout, temPermissao } = useAuth()
  const nav                                      = useNavigate()
  const { tema }                                 = useTheme()

  // Aplica variáveis do tema ao shell
  useEffect(() => {
    const shell = document.querySelector('.admin-shell')
    if (!shell) return
    Object.entries(tema.vars).forEach(([k, v]) => shell.style.setProperty(k, v))
  }, [tema])

  // Filtra itens pelo perfil do usuário
  function podeVer(perm) { return perm === null || temPermissao(perm) }
  const navVisivel = NAV.filter(item => {
    if (item.group) return item.children.some(c => podeVer(c.perm))
    return podeVer(item.perm)
  })

  const [drawerAberto,   setDrawerAberto]   = useState(false)
  const [avatarAberto,   setAvatarAberto]   = useState(false)
  const [confirmLogout,  setConfirmLogout]  = useState(false)
  const [saindo,         setSaindo]         = useState(false)
  const [naoLidos,       setNaoLidos]       = useState(0)
  // Submenus abertos no drawer (por label do grupo)
  const [gruposAbertos,  setGruposAbertos]  = useState(() => {
    // abre automaticamente grupos que têm filho ativo
    const init = {}
    NAV.forEach(item => { if (item.group && groupHasActive(pathname, item)) init[item.label] = true })
    return init
  })
  // Dropdown do top nav para grupos
  const [topDropdown, setTopDropdown] = useState(null) // label do grupo aberto
  const topDropdownRef = useRef(null)

  const avatarRef = useRef(null)

  useEffect(() => {
    if (!avatarAberto) return
    function h(e) { if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarAberto(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [avatarAberto])

  useEffect(() => {
    if (!topDropdown) return
    function h(e) { if (topDropdownRef.current && !topDropdownRef.current.contains(e.target)) setTopDropdown(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [topDropdown])

  useEffect(() => { setDrawerAberto(false); setTopDropdown(null) }, [pathname])

  useEffect(() => {
    errosService.contagem().then(r => setNaoLidos(r.nao_lidos ?? 0)).catch(() => {})
  }, [pathname])

  async function handleLogout() {
    setSaindo(true)
    try { await doLogout(); toast.success('Até logo!'); nav('/login') }
    catch { toast.error('Erro ao sair') }
    finally { setSaindo(false); setConfirmLogout(false); setAvatarAberto(false) }
  }

  function toggleGrupo(label) {
    setGruposAbertos(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const initials   = user?.email?.[0]?.toUpperCase() ?? 'A'
  const labelAtual = labelAtualFromNav(pathname, navVisivel)

  useEffect(() => {
    const appName = import.meta.env.VITE_APP_NAME || 'Admin'
    document.title = `${labelAtual} | ${appName}`
    return () => { document.title = appName }
  }, [labelAtual])

  /* ── helpers de renderização ── */
  function badgeErros(style = {}) {
    if (!naoLidos) return null
    return (
      <span style={{ background:C.red, color:'#fff', borderRadius:RADIUS.lg, fontSize:FONT.xs,
        fontWeight:800, padding:'1px 6px', lineHeight:1.4, ...style }}>
        {naoLidos > 99 ? '99+' : naoLidos}
      </span>
    )
  }

  /** Item simples no drawer */
  function DrawerLink({ item }) {
    const active = isActive(pathname, item.to)
    return (
      <Link to={item.to} aria-current={active ? 'page' : undefined}
        style={{
          display:'flex', alignItems:'center', gap:10,
          padding:'9px 12px', borderRadius:RADIUS.md, marginBottom:2,
          fontSize:13, fontWeight:500, textDecoration:'none',
          color: active ? 'var(--adm-text)' : 'var(--adm-muted)',
          background: active ? 'var(--adm-surface2)' : 'transparent',
          transition:'all .15s',
        }}
      >
        <span style={{ width:16, height:16, display:'flex', alignItems:'center', flexShrink:0 }}>
          <item.icon />
        </span>
        <span style={{ flex:1 }}>{item.label}</span>
        {item.to === '/admin/erros' ? badgeErros({ marginLeft: active ? 0 : 'auto' }) : null}
        {active && item.to !== '/admin/erros' && (
          <span style={{ width:6, height:6, borderRadius:3, background:'var(--adm-accent)', flexShrink:0 }}/>
        )}
      </Link>
    )
  }

  /** Grupo colapsável no drawer */
  function DrawerGroup({ item }) {
    const aberto  = !!gruposAbertos[item.label]
    const temAtivo = groupHasActive(pathname, item)
    const filhosVisiveis = item.children.filter(c => podeVer(c.perm))
    if (!filhosVisiveis.length) return null

    // conta erros dentro do grupo
    const errosNoGrupo = item.children.some(c => c.to === '/admin/erros') && naoLidos > 0

    return (
      <div style={{ marginBottom:2 }}>
        {/* Cabeçalho do grupo */}
        <button onClick={() => toggleGrupo(item.label)}
          style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding:'9px 12px', borderRadius:RADIUS.md,
            fontSize:13, fontWeight:500, textAlign:'left',
            background: temAtivo ? 'var(--adm-surface2)' : 'transparent',
            border:'none', cursor:'pointer',
            color: temAtivo ? 'var(--adm-text)' : 'var(--adm-muted)',
            transition:'all .15s',
          }}
        >
          <span style={{ width:16, height:16, display:'flex', alignItems:'center', flexShrink:0 }}>
            <item.icon />
          </span>
          <span style={{ flex:1 }}>{item.label}</span>
          {errosNoGrupo && !aberto && badgeErros({ marginRight:4 })}
          {/* Chevron */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            width="12" height="12" style={{ flexShrink:0, transition:'transform .2s',
              transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Filhos — animação por max-height */}
        <div style={{
          overflow:'hidden', maxHeight: aberto ? `${filhosVisiveis.length * 48}px` : '0px',
          transition:'max-height .22s cubic-bezier(.4,0,.2,1)',
        }}>
          <div style={{ paddingLeft:12, paddingTop:2 }}>
            {filhosVisiveis.map(child => {
              const childActive = isActive(pathname, child.to)
              const ChildLink = child.external ? 'a' : Link
              const childProps = child.external
                ? { href: child.to, target: '_blank', rel: 'noopener noreferrer' }
                : { to: child.to }
              return (
                <ChildLink key={child.to} {...childProps}
                  aria-current={childActive ? 'page' : undefined}
                  style={{
                    display:'flex', alignItems:'center', gap:9,
                    padding:'8px 12px', borderRadius:7, marginBottom:1,
                    fontSize:12.5, fontWeight:500, textDecoration:'none',
                    color: childActive ? 'var(--adm-text)' : 'var(--adm-muted)',
                    background: childActive ? 'var(--adm-surface2)' : 'transparent',
                    transition:'all .15s',
                    borderLeft:'2px solid',
                    borderLeftColor: childActive ? 'var(--adm-accent)' : 'transparent',
                  }}
                >
                  <span style={{ width:14, height:14, display:'flex', alignItems:'center', flexShrink:0 }}>
                    <child.icon />
                  </span>
                  <span style={{ flex:1 }}>{child.label}</span>
                  {child.to === '/admin/erros' ? badgeErros({ marginLeft:0 }) : null}
                </ChildLink>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <style>{`
        .adm-top-group-btn {
          display:flex; align-items:center; gap:5px;
          padding:0 8px; height:100%; border:none; cursor:pointer;
          background:transparent; font-size:12px; font-weight:500;
          color:var(--adm-muted); border-radius:6px; transition:all .15s;
          position:relative; white-space:nowrap;
        }
        .adm-top-group-btn:hover { color:var(--adm-text); }
        .adm-top-group-btn.active { color:var(--adm-text); }
        .adm-top-group-btn.active::after {
          content:''; position:absolute; bottom:0; left:8px; right:8px;
          height:2px; background:var(--adm-accent); border-radius:2px;
        }
        .adm-top-dropdown {
          position:absolute; top:calc(100% + 4px); left:50%;
          transform:translateX(-50%);
          background:var(--adm-surface); border:1px solid var(--adm-border);
          border-radius:10px; box-shadow:var(--adm-shadow-md);
          overflow:hidden; z-index:400; min-width:180px;
          animation: adm-dd-in .12s ease;
        }
        @keyframes adm-dd-in { from{opacity:0;transform:translateX(-50%) translateY(-4px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .adm-top-dd-item {
          display:flex; align-items:center; gap:9px;
          padding:9px 14px; font-size:13px; font-weight:500;
          color:var(--adm-muted); text-decoration:none; transition:all .12s;
        }
        .adm-top-dd-item:hover { background:var(--adm-surface2); color:var(--adm-text); }
        .adm-top-dd-item.active { color:var(--adm-text); background:var(--adm-surface2); }
      `}</style>

      {/* ── Modal logout ── */}
      {confirmLogout && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.65)',
          backdropFilter:'blur(4px)', display:'flex', alignItems:'center',
          justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmLogout(false) }}>
          <div style={{ background:'var(--adm-surface)', border:'1px solid var(--adm-border)',
            borderRadius:RADIUS.xl2, padding:24, width:'100%', maxWidth:340,
            boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--adm-text)', marginBottom:8 }}>Sair da conta?</div>
            <div style={{ fontSize:13, color:'var(--adm-muted)', marginBottom:20, lineHeight:1.5 }}>
              Você será redirecionado para a página de login.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmLogout(false)} className="adm-btn adm-btn-secondary" disabled={saindo}>
                Cancelar
              </button>
              <button onClick={handleLogout} className="adm-btn adm-btn-danger" disabled={saindo}>
                {saindo
                  ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" className="adm-spin"><path d="M21 12a9 9 0 11-18 0"/></svg> Saindo...</>
                  : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg> Sair</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay drawer ── */}
      {drawerAberto && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.5)',
          backdropFilter:'blur(2px)' }}
          onClick={() => setDrawerAberto(false)} aria-hidden="true" />
      )}

      {/* ── Drawer mobile ── */}
      <aside style={{ position:'fixed', top:0, left:0, bottom:0, zIndex:201,
        width:264, background:'var(--adm-surface)', borderRight:'1px solid var(--adm-border)',
        display:'flex', flexDirection:'column',
        transform: drawerAberto ? 'translateX(0)' : 'translateX(-100%)',
        transition:'transform .22s cubic-bezier(.4,0,.2,1)' }}
        aria-label="Menu de navegação">

        {/* Cabeçalho */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px',
          borderBottom:'1px solid var(--adm-border)', flexShrink:0 }}>
          <div className="adm-topnav-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>
            </svg>
          </div>
          <span style={{ fontWeight:700, fontSize:14, color:'var(--adm-text)', flex:1 }}>{import.meta.env.VITE_APP_NAME || 'SaaS Admin'}</span>
          <button onClick={() => setDrawerAberto(false)}
            className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" aria-label="Fechar menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Links */}
        <nav style={{ flex:1, overflowY:'auto', padding:'8px 8px' }}>
          {navVisivel.map(item =>
            item.group
              ? <DrawerGroup key={item.label} item={item} />
              : <DrawerLink key={item.to} item={item} />
          )}
        </nav>

        {/* Rodapé */}
        <div style={{ borderTop:'1px solid var(--adm-border)', padding:'10px 8px', flexShrink:0 }}>
          <div style={{ padding:'6px 12px', fontSize:11, color:'var(--adm-muted)', wordBreak:'break-all', lineHeight:1.4 }}>
            {user?.email}
          </div>
          <button onClick={() => { setDrawerAberto(false); setConfirmLogout(true) }}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:RADIUS.md,
              width:'100%', fontSize:13, fontWeight:500, textAlign:'left',
              background:'none', border:'none', cursor:'pointer',
              color:'var(--adm-red)', transition:'all .15s' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sair da conta
          </button>
        </div>
      </aside>

      {/* ── Top Nav ── */}
      <nav className="adm-topnav" aria-label="Navegação do painel admin">
        {/* Hamburguer mobile */}
        <button className="adm-hamburger" onClick={() => setDrawerAberto(true)}
          aria-label="Abrir menu" aria-expanded={drawerAberto}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>

        {/* Logo desktop */}
        <Link to="/admin" className="adm-topnav-logo adm-only-desktop" title="Dashboard">
          <div className="adm-topnav-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>
            </svg>
          </div>
          <span>{import.meta.env.VITE_APP_NAME || 'SaaS Admin'}</span>
        </Link>

        <div className="adm-nav-divider adm-only-desktop" aria-hidden="true"/>

        {/* Abas desktop */}
        <div className="adm-nav-tabs adm-only-desktop" role="tablist">
          {navVisivel.map(item => {
            if (item.group) {
              const grupoAtivo = groupHasActive(pathname, item)
              const aberto = topDropdown === item.label
              const filhosVisiveis = item.children.filter(c => podeVer(c.perm))
              const errosNoGrupo = item.children.some(c => c.to === '/admin/erros') && naoLidos > 0
              return (
                <div key={item.label} ref={aberto ? topDropdownRef : null}
                  style={{ position:'relative', display:'flex', alignItems:'stretch' }}>
                  <button
                    className={`adm-top-group-btn${grupoAtivo ? ' active' : ''}`}
                    onClick={() => setTopDropdown(v => v === item.label ? null : item.label)}
                    aria-haspopup="true" aria-expanded={aberto}
                  >
                    <span style={{ width:14, height:14, display:'flex', alignItems:'center' }}>
                      <item.icon />
                    </span>
                    <span>{item.label}</span>
                    {errosNoGrupo && badgeErros({ position:'relative', top:-1 })}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      width="11" height="11" style={{ transition:'transform .15s',
                        transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {aberto && (
                    <div className="adm-top-dropdown">
                      {filhosVisiveis.map(child => {
                        const childActive = isActive(pathname, child.to)
                        const TopChildLink = child.external ? 'a' : Link
                        const topChildProps = child.external
                          ? { href: child.to, target: '_blank', rel: 'noopener noreferrer' }
                          : { to: child.to }
                        return (
                          <TopChildLink key={child.to} {...topChildProps}
                            className={`adm-top-dd-item${childActive ? ' active' : ''}`}
                            onClick={() => setTopDropdown(null)}>
                            <span style={{ width:14, height:14, display:'flex', alignItems:'center', flexShrink:0 }}>
                              <child.icon />
                            </span>
                            <span style={{ flex:1 }}>{child.label}</span>
                            {child.to === '/admin/erros' && badgeErros()}
                          </TopChildLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // Item simples
            const active = isActive(pathname, item.to)
            return (
              <Link key={item.to} to={item.to} role="tab"
                aria-selected={active} aria-label={item.label}
                className={`adm-nav-tab${active ? ' active' : ''}`}
                style={{ position:'relative' }}>
                <item.icon />
                <span>{item.label}</span>
                {item.to === '/admin/erros' && naoLidos > 0 && (
                  <span style={{ position:'absolute', top:2, right:2, background:C.red, color:'#fff',
                    borderRadius:RADIUS.lg, fontSize:9, fontWeight:800, padding:'1px 4px',
                    lineHeight:1.4, minWidth:14, textAlign:'center' }}>
                    {naoLidos > 99 ? '99+' : naoLidos}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Título mobile */}
        <span className="adm-mobile-pagetitle">{labelAtual}</span>

        {/* Direita */}
        <div className="adm-nav-right">

          {/* Avatar */}
          <div ref={avatarRef} style={{ position:'relative' }}>
            <button onClick={() => setAvatarAberto(o => !o)} title={user?.email}
              className="adm-avatar" aria-label="Menu da conta"
              aria-expanded={avatarAberto} aria-haspopup="true">
              {initials}
            </button>
            {avatarAberto && (
              <div role="menu" style={{ position:'absolute', top:'calc(100% + 8px)', right:0,
                minWidth:200, background:'var(--adm-surface)', border:'1px solid var(--adm-border)',
                borderRadius:RADIUS.lg, boxShadow:'var(--adm-shadow-md)', zIndex:300, overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--adm-border)' }}>
                  <div style={{ fontSize:11, color:'var(--adm-muted)', marginBottom:3 }}>Logado como</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--adm-text)', wordBreak:'break-all' }}>
                    {user?.email}
                  </div>
                </div>
                <button role="menuitem"
                  onClick={() => { setAvatarAberto(false); setConfirmLogout(true) }}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 14px',
                    background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:500,
                    color:'var(--adm-red)', textAlign:'left', transition:'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.08)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Sair da conta
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Conteúdo ── */}
      <main id="admin-content" className="adm-main">
        <Outlet />
      </main>
    </div>
  )
}

/* ── Ícones ─────────────────────────────────────────────────── */
function IconShield()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> }
function IconGrid()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function IconPlus()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 5v14M5 12h14"/></svg> }
function IconDoc()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function IconTag()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M7 7h.01M7 3h5l7.586 7.586a2 2 0 010 2.828L14 19a2 2 0 01-2.828 0L3.586 11.414A2 2 0 013 10V5a2 2 0 012-2z"/></svg> }
function IconGlobe()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg> }
function IconLayers()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> }
function IconSearch()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> }
function IconBus()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 19v2M16 19v2"/></svg> }
function IconCal()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function IconMail()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> }
function IconAlerta()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
function IconUsers()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> }
function IconBackup()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function IconInfra()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }
function IconPlatform(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h2m2 0h2m2 0h2" strokeLinecap="round"/><path d="M7 11h10" strokeLinecap="round"/></svg> }
function IconServer()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> }
function IconPalette() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M5.5 14.5c2.5 3 11 3 13 0"/></svg> }
function IconRss()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1" fill="currentColor" stroke="none"/></svg> }
function IconFileEdit(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> }
function IconSetup()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
// ── Sprint 3: ícones das novas integrações ─────────────────────
function IconPlug()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 22v-5M9 8V2M15 8V2M18 8H6a1 1 0 00-1 1v3a7 7 0 0014 0V9a1 1 0 00-1-1z"/></svg> }
function IconGitHub()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg> }
function IconFolderCode(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><polyline points="10 14 8 16 10 18"/><polyline points="14 14 16 16 14 18"/></svg> }
function IconIA()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><circle cx="18" cy="6" r="3"/><path d="M21 3l-1.5 1.5"/></svg> }
function IconMongo()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }
function IconGear()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function IconCF()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/><path d="M13 11l-2 4h3l-2 4" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function IconCloud()     { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg> }
function IconCpu()       { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg> }
function IconMonitor()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{width:'100%',height:'100%'}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
