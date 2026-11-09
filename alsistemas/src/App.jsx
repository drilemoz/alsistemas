import { lazyWithRetry } from './utils/lazyWithRetry'
/**
 * App.jsx — SaaS Admin Panel (Sprint 1)
 *
 * Mudanças em relação ao original:
 * - Rotas públicas (home, notícia, ônibus, eventos) removidas do roteamento
 * - Raiz "/" redireciona para "/login"
 * - Módulo Portal agrupado sob /admin/* (rotas mantidas, sem quebrar links)
 * - Navbar e Footer públicos não são mais renderizados
 * - GlobalMeta removido (não há SEO em sistema admin-only)
 */
import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import PrivateRoute, { AdminRoute } from './components/PrivateRoute'
import LoadingSpinner from './components/LoadingSpinner'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import GlobalMeta from './components/GlobalMeta'
import { ThemeProvider } from './context/ThemeContext'

// ── Autenticação (carregadas no bundle principal — pequenas, sempre necessárias)
import Login          from './pages/Login'
import EsqueciSenha   from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'

// ── Portal público — lazy chunks
const Home            = lazyWithRetry(() => import('./pages/Home'))
const NoticiaDetalhe  = lazyWithRetry(() => import('./pages/NoticiaDetalhe'))
const Eventos         = lazyWithRetry(() => import('./pages/Eventos'))
const HorarioOnibus   = lazyWithRetry(() => import('./pages/HorarioOnibus'))

// ── Core SaaS — lazy chunks
const AdminLayout         = lazyWithRetry(() => import('./pages/admin/AdminLayout'))
const AdminDashboard      = lazyWithRetry(() => import('./pages/admin/AdminDashboard'))
const AdminErros          = lazyWithRetry(() => import('./pages/admin/AdminErros'))
const AdminUsuarios       = lazyWithRetry(() => import('./pages/admin/AdminUsuarios'))
const AdminBackup         = lazyWithRetry(() => import('./pages/admin/AdminBackup'))
const AdminSetup          = lazyWithRetry(() => import('./pages/admin/AdminSetup'))
const AdminCloudinary      = lazyWithRetry(() => import('./pages/admin/AdminCloudinary'))
const AdminSistema         = lazyWithRetry(() => import('./pages/admin/AdminSistema'))
const AdminPlataformas     = lazyWithRetry(() => import('./pages/admin/AdminPlataformas'))
const AdminArquivos       = lazyWithRetry(() => import('./pages/admin/AdminArquivos'))
const AdminTemas          = lazyWithRetry(() => import('./pages/admin/AdminTemas'))

// ── Módulo Portal (notícias/CMS) — mantido, apenas reagrupado na nav
// Estas páginas continuam funcionando em /admin/noticias, /admin/categorias etc.
// Em Sprint 3 serão movidas para src/modules/portal/
const AdminNoticias    = lazyWithRetry(() => import('./pages/admin/AdminNoticias'))
const AdminNoticiaForm = lazyWithRetry(() => import('./pages/admin/AdminNoticiaForm'))
const AdminCategorias  = lazyWithRetry(() => import('./pages/admin/AdminCategorias'))
const AdminModulos     = lazyWithRetry(() => import('./pages/admin/AdminModulos'))
const AdminOnibus      = lazyWithRetry(() => import('./pages/admin/AdminOnibus'))
const AdminEventos     = lazyWithRetry(() => import('./pages/admin/AdminEventos'))
const AdminNewsletter  = lazyWithRetry(() => import('./pages/admin/AdminNewsletter'))
const AdminSEO         = lazyWithRetry(() => import('./pages/admin/AdminSEO'))
const AdminRssImport   = lazyWithRetry(() => import('./pages/admin/AdminRssImport'))
const AdminFontes      = lazyWithRetry(() => import('./pages/admin/AdminFontes'))

// ── Sprint 3: Integrações ──────────────────────────────────────
const AdminGitHub      = lazyWithRetry(() => import('./pages/admin/AdminGitHub'))
const AdminProjetos    = lazyWithRetry(() => import('./pages/admin/AdminProjetos'))
// ── Sprint 4: Inteligência ─────────────────────────────────────
const AdminAIAssistant = lazyWithRetry(() => import('./pages/admin/AdminAIAssistant'))
// ── Sprint 5: Dados ────────────────────────────────────────────
const AdminMongo       = lazyWithRetry(() => import('./pages/admin/AdminMongo'))
// ── Monitor em Tempo Real ──────────────────────────────────────
const AdminMonitor     = lazyWithRetry(() => import('./pages/admin/AdminMonitor'))
const AdminSeguranca   = lazyWithRetry(() => import('./pages/admin/AdminSeguranca'))
const AdminCloudflare  = lazyWithRetry(() => import('./pages/admin/AdminCloudflare'))  // ☁️

// Wrapper de Suspense reutilizável
function S({ children }) {
  return (
    <Suspense fallback={<LoadingSpinner texto="Carregando painel..." />}>
      {children}
    </Suspense>
  )
}


function PublicLayout({ children }) {
  return (
    <>
      <GlobalMeta />
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      {/* ── Portal público ─────────────────────────────────────── */}
      <Route path="/" element={<PublicLayout><S><Home /></S></PublicLayout>} />
      <Route path="/noticia/:id" element={<PublicLayout><S><NoticiaDetalhe /></S></PublicLayout>} />
      <Route path="/eventos" element={<PublicLayout><S><Eventos /></S></PublicLayout>} />
      <Route path="/horario-onibus" element={<PublicLayout><S><HorarioOnibus /></S></PublicLayout>} />
      <Route path="/onibus" element={<Navigate to="/horario-onibus" replace />} />

      {/* ── Autenticação ──────────────────────────────────────── */}
      <Route path="/login"           element={<Login />} />
      <Route path="/esqueci-senha"   element={<EsqueciSenha />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {/* Setup inicial — sem auth, redireciona se já instalado */}
      <Route path="/admin/setup" element={<S><AdminSetup /></S>} />

      {/* ── Admin SaaS ────────────────────────────────────────── */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <ThemeProvider>
              <S><AdminLayout /></S>
            </ThemeProvider>
          </AdminRoute>
        }
      >
        {/* Core SaaS */}
        <Route index                 element={<S><AdminDashboard /></S>} />
        <Route path="erros"          element={<S><AdminErros /></S>} />
        <Route path="usuarios"       element={<S><AdminUsuarios /></S>} />
        <Route path="backup"         element={<S><AdminBackup /></S>} />
        <Route path="cloudinary"    element={<S><AdminCloudinary /></S>} />
        <Route path="sistema"        element={<S><AdminSistema /></S>} />
        <Route path="infraestrutura"  element={<Navigate to="/admin/sistema" replace />} />
        <Route path="plataformas"      element={<S><AdminPlataformas /></S>} />
        <Route path="arquivos"       element={<S><AdminArquivos /></S>} />
        <Route path="temas"          element={<S><AdminTemas /></S>} />

        {/* Módulo Portal — rotas preservadas para não quebrar bookmarks/links */}
        <Route path="noticias"       element={<S><AdminNoticias /></S>} />
        <Route path="nova-noticia"   element={<S><AdminNoticiaForm /></S>} />
        <Route path="editar/:id"     element={<S><AdminNoticiaForm /></S>} />
        <Route path="categorias"     element={<S><AdminCategorias /></S>} />
        <Route path="modulos"        element={<S><AdminModulos /></S>} />
        <Route path="onibus"         element={<S><AdminOnibus /></S>} />
        <Route path="eventos"        element={<S><AdminEventos /></S>} />
        <Route path="newsletter"     element={<S><AdminNewsletter /></S>} />
        <Route path="seo"            element={<S><AdminSEO /></S>} />
        <Route path="rss-import"     element={<S><AdminRssImport /></S>} />
        <Route path="fontes"         element={<S><AdminFontes /></S>} />

        {/* Sprint 3: Integrações */}
        <Route path="github"    element={<S><AdminGitHub /></S>} />
        <Route path="projetos"  element={<S><AdminProjetos /></S>} />
        {/* Sprint 4: Inteligência */}
        <Route path="ai-assistant" element={<S><AdminAIAssistant /></S>} />
        {/* Sprint 5: Dados */}
        <Route path="mongo"        element={<S><AdminMongo /></S>} />
        {/* Monitor em Tempo Real */}
        <Route path="monitor"      element={<S><AdminMonitor /></S>} />
        <Route path="seguranca"    element={<S><AdminSeguranca /></S>} />
        <Route path="cloudflare"   element={<S><AdminCloudflare /></S>} />  {/* ☁️ */}
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', gap: 12, fontFamily: 'system-ui, sans-serif',
          }}>
            <h1 style={{ fontSize: 72, fontWeight: 900, color: '#e5e7eb', margin: 0 }}>404</h1>
            <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>Página não encontrada</p>
            <a
              href="/"
              style={{
                marginTop: 8, color: '#16a34a', fontWeight: 600,
                fontSize: 14, textDecoration: 'none',
              }}
            >
              Voltar ao início →
            </a>
          </div>
        }
      />
    </Routes>
  )
}
