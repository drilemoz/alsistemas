import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { isChunkLoadError, recoverFromChunkError } from './utils/lazyWithRetry'
import { errosService } from './services/api'
import App from './App.jsx'
import './index.css'

// ─── Deduplicação de erros ───────────────────────────────────
let ultimoErro = ''
let ultimoTs   = 0

function deveEnviar(msg) {
  const agora = Date.now()
  const chave = msg?.slice(0, 100)
  if (chave === ultimoErro && agora - ultimoTs < 5000) return false
  ultimoErro = chave
  ultimoTs   = agora
  return true
}

// ─── ChunkLoadError: recuperação automática após deploy ──────
window.addEventListener('unhandledrejection', async (event) => {
  const razao = event.reason

  if (isChunkLoadError(razao)) {
    event.preventDefault()
    await recoverFromChunkError(razao)
    return
  }

  const mensagem = razao?.message || String(razao) || 'Promise rejeitada sem motivo'
  if (!deveEnviar(mensagem)) return
  errosService.capturar({
    tipo: 'unhandled_rejection',
    mensagem,
    stack: razao?.stack || null,
    dados: { type: typeof razao },
  })
})

// ─── Erros JS síncronos ──────────────────────────────────────
window.onerror = function (mensagem, fonte, linha, coluna, erroObj) {
  const msg = erroObj?.message || String(mensagem)
  if (!deveEnviar(msg)) return false
  errosService.capturar({
    tipo: 'js_error',
    mensagem: msg,
    stack: erroObj?.stack || `${fonte}:${linha}:${coluna}`,
    dados: { fonte, linha, coluna },
  })
  return false
}

// Remove apenas o parâmetro técnico após a recuperação, sem nova navegação.
const currentUrl = new URL(window.location.href)
if (currentUrl.searchParams.has('__als_update')) {
  currentUrl.searchParams.delete('__als_update')
  window.history.replaceState({}, document.title, currentUrl.toString())
}

// ═══════════════════════════════════════════════════════════════
// Service Worker + Banner de nova versão
// ═══════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  // ── Captura o estado ANTES de qualquer operação async ──────
  // Se já havia um controller quando a página carregou, é uma
  // atualização real. Se não havia, é primeira instalação —
  // e o banner NÃO deve aparecer.
  const hadControllerOnLoad = !!navigator.serviceWorker.controller

  // ── Banner DOM nativo (fora do React tree) ─────────────────
  function mostrarBannerUpdate(onConfirm) {
    // Evita duplicata (pode ser chamada por Case 1 e Case 2)
    if (document.getElementById('sw-update-banner')) return
    const banner = document.createElement('div')
    banner.id = 'sw-update-banner'
    Object.assign(banner.style, {
      position: 'fixed', bottom: '20px', left: '50%',
      transform: 'translateX(-50%)',
      background: '#1e293b', color: '#f1f5f9',
      padding: '10px 16px', borderRadius: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,.4)',
      display: 'flex', alignItems: 'center', gap: '12px',
      fontSize: '13px', fontFamily: 'system-ui,sans-serif',
      zIndex: '99999', border: '1px solid #334155',
      animation: 'swSlideUp .3s ease',
      whiteSpace: 'nowrap',
    })
    banner.innerHTML = `
      <style>@keyframes swSlideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}</style>
      <span>🚀 Nova versão disponível</span>
      <button id="sw-update-btn" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;font-size:12px">Atualizar</button>
      <button id="sw-dismiss-btn" style="background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:14px;padding:2px 6px">✕</button>
    `
    document.body.appendChild(banner)
    document.getElementById('sw-update-btn').onclick = () => { banner.remove(); onConfirm() }
    document.getElementById('sw-dismiss-btn').onclick = () => banner.remove()
  }

  // ── Listener registrado CEDO — antes de qualquer await ─────
  // Caso 1: SW ativo manda SW_UPDATED após claim().
  // Registrar aqui (e não dentro do .then()) evita a race condition
  // onde o SW ativa rápido e envia a mensagem antes do listener existir.
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'SW_UPDATED') return

    // Primeira instalação: hadControllerOnLoad é false.
    // Não exibimos o banner — o SW ainda não controlava a página.
    if (!hadControllerOnLoad) return

    // Atraso curto para não exibir imediatamente após o claim()
    setTimeout(() => mostrarBannerUpdate(() => window.location.reload()), 1000)
  })

  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          // Caso 2: novo SW instalado enquanto a aba está aberta.
          // Detectamos via updatefound + statechange.
          // Só mostramos o banner se já havia um controller (atualização real).
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing
            if (!sw) return
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                mostrarBannerUpdate(() => {
                  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
                  window.location.reload()
                })
              }
            })
          })
        })
        .catch(err => console.warn('SW registration failed:', err))
    })
  } else {
    // Em desenvolvimento: remove qualquer SW residual para evitar cache stale
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister())
    })
  }
}

// ─── Router ──────────────────────────────────────────────────
const router = createBrowserRouter([{ path: '*', element: <App /> }])

// ─── Render ──────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          /**
           * containerStyle.top: empurra os toasts para baixo da nav fixa do admin.
           * A .adm-topnav tem height: 48px + position: fixed.
           * Sem esse offset, os toasts (top: 8px padrão) ficam parcialmente
           * atrás da barra de navegação nas páginas admin.
           */
          containerStyle={{ top: 60 }}
          toastOptions={{
            duration: 4000,
            style: { fontSize: '14px' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
