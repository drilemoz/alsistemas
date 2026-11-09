import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import { Menu, X, ChevronDown, Search, ChevronRight, LogOut, LayoutDashboard } from 'lucide-react'
import { useCategorias } from '../hooks/useNoticias'
import { useAuth } from '../context/AuthContext'

const MAX_CATEGORIAS_VISIVEIS = 7

function LogoIcon({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" focusable="false">
      <rect width="44" height="44" rx="10" fill="#1B5E3B"/>
      <path d="M6 34 L16 18 L22 26 L28 20 L38 34 Z" fill="#2D6A4F"/>
      <rect x="19" y="12" width="6" height="14" fill="white" fillOpacity="0.9"/>
      <polygon points="22,6 19,12 25,12" fill="white" fillOpacity="0.9"/>
      <rect x="21" y="8" width="2" height="5" fill="#1B5E3B"/>
      <rect x="19.5" y="9.5" width="5" height="1.5" fill="#1B5E3B"/>
      <path d="M6 34 Q12 31 18 34 Q24 37 30 34 Q36 31 38 34 L38 38 L6 38 Z" fill="#52A846" fillOpacity="0.6"/>
    </svg>
  )
}

function MobileCategoriasExtras({ categorias, catAtual }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div>
      <button onClick={() => setAberto(o => !o)}
        className="flex items-center gap-1 py-2 px-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors w-full text-left">
        <ChevronRight size={13} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden="true" />
        Ver mais ({categorias.length})
      </button>
      {aberto && (
        <div className="pl-4 flex flex-col gap-0.5 animate-fade-in">
          {categorias.map(c => (
            <Link key={c.id} to={`/?categoria=${c.slug}`}
              aria-current={catAtual === c.slug ? 'page' : undefined}
              className={`py-2 px-3 rounded-xl text-sm font-bold transition-colors ${catAtual === c.slug ? 'text-brand-500 bg-brand-50' : 'text-gray-600 hover:bg-gray-50'}`}>
              {c.nome}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Navbar() {
  const { categorias = [] } = useCategorias() || {}
  const { user, logout, podeAcessarAdmin } = useAuth()
  const [open,         setOpen]         = useState(false)
  const [catOpen,      setCatOpen]      = useState(false)
  const [maisOpen,     setMaisOpen]     = useState(false)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [query,        setQuery]        = useState('')
  const { pathname }   = useLocation()
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const catAtual    = searchParams.get('categoria')
  const dropRef     = useRef(null)
  const searchRef   = useRef(null)
  const dropBtnRef  = useRef(null)
  const userMenuRef = useRef(null)

  const categoriasVisiveis = categorias.slice(0, MAX_CATEGORIAS_VISIVEIS)
  const categoriasMais     = categorias.slice(MAX_CATEGORIAS_VISIVEIS)
  const temMais            = categoriasMais.length > 0
  const catAtivaLabel      = categorias.find(c => c.slug === catAtual)?.nome

  useEffect(() => {
    function h(e) { if (dropRef.current && !dropRef.current.contains(e.target)) { setCatOpen(false); setMaisOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Fecha o menu do usuário ao clicar fora
  useEffect(() => {
    function h(e) { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!catOpen) return
    function onKey(e) { if (e.key === 'Escape') { setCatOpen(false); setMaisOpen(false); dropBtnRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [catOpen])

  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50) }, [searchOpen])
  useEffect(() => { setOpen(false); setCatOpen(false); setMaisOpen(false); setSearchOpen(false) }, [pathname, catAtual])

  function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate(`/?q=${encodeURIComponent(q)}`)
    setQuery('')
    setSearchOpen(false)
  }

  async function handleLogout() {
    setUserMenuOpen(false)
    await logout()
    navigate('/')
  }

  // Iniciais do usuário para o avatar
  const iniciais = user
    ? (user.nome || user.email || '?').trim().split(' ').slice(0, 2).map(s => s[0]?.toUpperCase()).join('')
    : ''

  // Cor do badge do perfil
  const corPerfil = user?.perfil_id?.cor || '#1B5E3B'

  return (
    <header className="bg-white sticky top-0 z-50 shadow-sm">
      <div className="wrap">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0"
            aria-label="AL Sistemas — Página inicial">
            <LogoIcon size={40} />
            <div className="leading-tight" aria-hidden="true">
              <span className="block font-display font-bold text-lg text-gray-900 leading-none">AL Sistemas</span>
              <span className="block font-grotesk text-xs font-semibold text-brand-500 leading-none mt-0.5">Notícias de Iguatama</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-5" aria-label="Navegação principal">
            <Link to="/"
              className={`text-sm font-bold transition-colors ${pathname === '/' && !catAtual ? 'text-brand-500' : 'text-gray-600 hover:text-gray-900'}`}
              aria-current={pathname === '/' && !catAtual ? 'page' : undefined}>
              Início
            </Link>

            {categorias.length > 0 && (
              <div className="relative" ref={dropRef}>
                <button ref={dropBtnRef}
                  onClick={() => { setCatOpen(o => !o); setMaisOpen(false) }}
                  aria-haspopup="true" aria-expanded={catOpen} aria-label="Categorias"
                  className={`flex items-center gap-1 text-sm font-bold transition-colors ${catAtual ? 'text-brand-500' : 'text-gray-600 hover:text-gray-900'}`}>
                  {catAtivaLabel
                    ? <span className="max-w-[100px] truncate">{catAtivaLabel}</span>
                    : 'Categorias'
                  }
                  <ChevronDown size={14} className={`transition-transform flex-shrink-0 ${catOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {catOpen && (
                  <div role="menu" aria-label="Categorias disponíveis"
                    className="absolute top-full mt-2 left-0 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 min-w-[200px] z-50 animate-fade-in">
                    <Link to="/" role="menuitem"
                      className={`block px-4 py-2 text-sm font-semibold transition-colors ${!catAtual ? 'text-brand-500 bg-brand-50' : 'text-gray-700 hover:bg-gray-50'}`}>
                      Todas as categorias
                    </Link>
                    <div className="border-t border-gray-100 my-1" aria-hidden="true" />

                    {categoriasVisiveis.map(c => (
                      <Link key={c.id} to={`/?categoria=${c.slug}`} role="menuitem"
                        className={`block px-4 py-2 text-sm font-semibold transition-colors ${catAtual === c.slug ? 'text-brand-500 bg-brand-50' : 'text-gray-700 hover:bg-gray-50'}`}>
                        {c.nome}
                      </Link>
                    ))}

                    {temMais && (
                      <div className="relative">
                        <button role="menuitem" aria-haspopup="true" aria-expanded={maisOpen}
                          onMouseEnter={() => setMaisOpen(true)}
                          onMouseLeave={() => setMaisOpen(false)}
                          onClick={() => setMaisOpen(o => !o)}
                          className="flex items-center justify-between w-full px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                          <span>Ver mais ({categoriasMais.length})</span>
                          <ChevronRight size={13} aria-hidden="true" />
                        </button>
                        {maisOpen && (
                          <div role="menu" aria-label="Mais categorias"
                            onMouseEnter={() => setMaisOpen(true)}
                            onMouseLeave={() => setMaisOpen(false)}
                            className="absolute left-full top-0 ml-1 bg-white border border-gray-100 rounded-2xl shadow-xl py-2 min-w-[180px] z-50 animate-fade-in max-h-64 overflow-y-auto">
                            {categoriasMais.map(c => (
                              <Link key={c.id} to={`/?categoria=${c.slug}`} role="menuitem"
                                className={`block px-4 py-2 text-sm font-semibold transition-colors ${catAtual === c.slug ? 'text-brand-500 bg-brand-50' : 'text-gray-700 hover:bg-gray-50'}`}>
                                {c.nome}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Link to="/eventos"
              className={`text-sm font-bold transition-colors ${pathname === '/eventos' ? 'text-brand-500' : 'text-gray-600 hover:text-gray-900'}`}
              aria-current={pathname === '/eventos' ? 'page' : undefined}>
              Eventos
            </Link>

            {searchOpen ? (
              <form onSubmit={handleSearch} className="flex items-center animate-fade-in" role="search">
                <label htmlFor="search-desktop" className="sr-only">Buscar notícias</label>
                <input id="search-desktop" ref={searchRef} type="search" value={query}
                  onChange={e => setQuery(e.target.value)} placeholder="Buscar notícias..."
                  className="w-48 text-sm border border-gray-200 rounded-l-full px-3 py-1.5 focus:outline-none focus:border-forest-400 focus:ring-1 focus:ring-forest-400" />
                <button type="submit" aria-label="Executar busca"
                  className="bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-r-full transition-colors">
                  <Search size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"
                  className="ml-1 p-1.5 text-gray-400 hover:text-gray-600">
                  <X size={14} aria-hidden="true" />
                </button>
              </form>
            ) : (
              <button onClick={() => setSearchOpen(true)} aria-label="Abrir busca"
                className="p-1.5 text-gray-500 hover:text-brand-500 hover:bg-brand-50 rounded-xl transition-colors">
                <Search size={17} aria-hidden="true" />
              </button>
            )}

            {/* ── Menu do usuário (desktop) ─────────────────────────────── */}
            {user ? (
              <div ref={userMenuRef} style={{ position: 'relative' }}>
                {/* Botão avatar */}
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  title={user.nome || user.email}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: `2px solid ${corPerfil}`,
                    borderRadius: 999, padding: '4px 12px 4px 4px',
                    cursor: 'pointer', transition: 'box-shadow .2s',
                    boxShadow: userMenuOpen ? `0 0 0 3px ${corPerfil}33` : 'none',
                  }}
                >
                  {/* Círculo com iniciais */}
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: corPerfil, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0, letterSpacing: '-.5px',
                  }}>
                    {iniciais}
                  </span>
                  {/* Nome curto */}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(user.nome || user.email).split(' ')[0]}
                  </span>
                  <ChevronDown size={13} style={{ color: '#6b7280', transition: 'transform .2s', transform: userMenuOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true" />
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 200,
                    background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.13)',
                    border: '1px solid #e5e7eb', overflow: 'hidden', zIndex: 100,
                    animation: 'fadeIn .15s ease',
                  }}>
                    {/* Cabeçalho do menu */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{user.nome || '—'}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{user.email}</div>
                      {user.perfil_id?.nome && (
                        <span style={{
                          display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 20,
                          background: corPerfil + '22', color: corPerfil, border: `1px solid ${corPerfil}44`,
                        }}>
                          {user.perfil_id.nome}
                        </span>
                      )}
                    </div>

                    {/* Link para o painel (só se tiver permissão) */}
                    {podeAcessarAdmin() && (
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 16px', fontSize: 13, fontWeight: 600,
                          color: '#1B5E3B', textDecoration: 'none',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <LayoutDashboard size={15} aria-hidden="true" />
                        Painel administrativo
                      </Link>
                    )}

                    {/* Sair */}
                    <button
                      onClick={handleLogout}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 16px', fontSize: 13, fontWeight: 600,
                        color: '#dc2626', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        borderTop: podeAcessarAdmin() ? '1px solid #f3f4f6' : 'none',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <LogOut size={15} aria-hidden="true" />
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/admin"
                className="text-sm font-bold text-white bg-brand-500 hover:bg-brand-600 px-4 py-1.5 rounded-full transition-colors"
                aria-current={pathname.startsWith('/admin') ? 'page' : undefined}>
                Admin
              </Link>
            )}
          </nav>

          <div className="md:hidden flex items-center gap-1">
            <button onClick={() => setSearchOpen(o => !o)} aria-label="Abrir busca" aria-expanded={searchOpen}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600">
              <Search size={20} aria-hidden="true" />
            </button>
            <button aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open}
              aria-controls="mobile-menu" className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              onClick={() => setOpen(o => !o)}>
              {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="md:hidden pb-3 animate-fade-in">
            <form onSubmit={handleSearch} className="flex items-center gap-2" role="search">
              <label htmlFor="search-mobile" className="sr-only">Buscar notícias</label>
              <input id="search-mobile" ref={searchRef} type="search" value={query}
                onChange={e => setQuery(e.target.value)} placeholder="Buscar notícias..."
                className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:border-forest-400 focus:ring-1 focus:ring-forest-400" />
              <button type="submit" className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors">
                Buscar
              </button>
            </form>
          </div>
        )}
      </div>

      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-gray-100 bg-white animate-fade-in">
          <nav className="wrap py-4 flex flex-col gap-1" aria-label="Navegação mobile">
            <Link to="/" className="py-2.5 px-3 rounded-xl text-sm font-bold text-gray-800 hover:bg-gray-50"
              aria-current={pathname === '/' && !catAtual ? 'page' : undefined}>
              Início
            </Link>
            <Link to="/eventos" className="py-2.5 px-3 rounded-xl text-sm font-bold text-gray-800 hover:bg-gray-50"
              aria-current={pathname === '/eventos' ? 'page' : undefined}>
              Eventos
            </Link>
            {categorias.length > 0 && (
              <>
                <p className="px-3 pt-3 pb-1 text-xs font-extrabold text-gray-400 uppercase tracking-widest" role="presentation">
                  Categorias
                </p>
                <Link to="/" className={`py-2 px-3 rounded-xl text-sm font-bold transition-colors ${!catAtual ? 'text-brand-500 bg-brand-50' : 'text-gray-600 hover:bg-gray-50'}`}>
                  Todas
                </Link>
                {categoriasVisiveis.map(c => (
                  <Link key={c.id} to={`/?categoria=${c.slug}`}
                    aria-current={catAtual === c.slug ? 'page' : undefined}
                    className={`py-2 px-3 rounded-xl text-sm font-bold transition-colors ${catAtual === c.slug ? 'text-brand-500 bg-brand-50' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {c.nome}
                  </Link>
                ))}
                {temMais && <MobileCategoriasExtras categorias={categoriasMais} catAtual={catAtual} />}
              </>
            )}
            {/* ── Área do usuário no mobile ───────────────────────────── */}
            {user ? (
              <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 8, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Info do usuário */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px' }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: corPerfil, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800,
                  }}>{iniciais}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{user.nome || '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{user.perfil_id?.nome || user.email}</div>
                  </div>
                </div>
                {/* Link painel */}
                {podeAcessarAdmin() && (
                  <Link to="/admin" className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold text-brand-500 hover:bg-brand-50 transition-colors">
                    <LayoutDashboard size={15} aria-hidden="true" />
                    Painel administrativo
                  </Link>
                )}
                {/* Sair */}
                <button onClick={handleLogout}
                  className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors w-full text-left">
                  <LogOut size={15} aria-hidden="true" />
                  Sair da conta
                </button>
              </div>
            ) : (
              <Link to="/admin" className="mt-2 py-2.5 px-3 rounded-full text-sm font-bold text-white bg-brand-500 text-center">
                Admin
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
