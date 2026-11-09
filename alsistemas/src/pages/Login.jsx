/**
 * Login.jsx — SaaS Admin
 *
 * Diagnóstico expandido:
 *  - Pré-voo: browser, cookies, variáveis de ambiente
 *  - Latência por etapa em ms
 *  - Todos os serviços do health (MongoDB, Redis, Cloudinary, GitHub, Groq)
 *  - Header CORS real da resposta
 *  - Ambiente e latência interna do backend
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import {
  LayoutDashboard, Eye, EyeOff, LogIn,
  ChevronDown, ChevronUp, Clipboard, ClipboardCheck, RefreshCw,
  Wifi, WifiOff,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const APP_NAME    = import.meta.env.VITE_APP_NAME    || 'SaaS Admin'
const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE || 'Painel de Gerenciamento'

const API_BASE    = import.meta.env.VITE_API_URL || 'https://alsistemas.onrender.com/api'
const SERVER_ROOT = API_BASE.replace(/\/api\/?$/, '')

// ── Utilidades ────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false })
}

async function fetchTimed(url, opts = {}, timeoutMs = 8000) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const t0    = Date.now()
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'include' })
    clearTimeout(timer)
    return { res, ms: Date.now() - t0 }
  } catch (err) {
    clearTimeout(timer)
    const ms = Date.now() - t0
    if (err.name === 'AbortError')                         return { timedOut: true, ms }
    if (/failed to fetch|networkerror/i.test(err.message)) return { corsBlocked: true, ms, errMsg: err.message }
    return { networkError: true, ms, errMsg: err.message }
  }
}

async function readJson(res) {
  try { return await res.json() } catch { return {} }
}

function detectBrowser() {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua))     return 'Microsoft Edge'
  if (/OPR\//.test(ua))     return 'Opera'
  if (/Chrome\//.test(ua))  return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua))  return 'Safari'
  return 'Navegador desconhecido'
}

function browserVersion() {
  const ua = navigator.userAgent
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|OPR)\/(\d+)/)
  return m ? m[2] : '?'
}

const VITE_VARS = [
  'VITE_API_URL', 'VITE_APP_NAME', 'VITE_APP_TAGLINE',
  'VITE_APP_VERSION', 'VITE_APP_ENV',
]

// ─────────────────────────────────────────────────────────────
export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]          = useState('')
  const [senha, setSenha]          = useState('')
  const [mostrarSenha, setMostrar] = useState(false)
  const [loading, setLoading]      = useState(false)

  const [logEntries, setLogEntries]   = useState([])
  const [diagRunning, setDiagRunning] = useState(false)
  const [diagDone, setDiagDone]       = useState(false)
  const [diagOpen, setDiagOpen]       = useState(true)
  const [copied, setCopied]           = useState(false)
  const [apiOnline, setApiOnline]     = useState(null)

  const logEndRef  = useRef(null)
  const ranRef     = useRef(false)
  const entriesRef = useRef([])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries])

  const runDiagnostic = useCallback(async () => {
    entriesRef.current = []
    setLogEntries([])
    setDiagRunning(true)
    setDiagDone(false)
    setApiOnline(null)

    function add(icon, text, indent = false) {
      const entry = { ts: ts(), icon, text, indent }
      entriesRef.current = [...entriesRef.current, entry]
      setLogEntries([...entriesRef.current])
    }

    function sep(label) {
      add('─', label)
    }

    // ════════════════════════════════════════════════════════
    // A. Pré-voo — browser, cookies, variáveis de ambiente
    // ════════════════════════════════════════════════════════
    add('→', 'Iniciando diagnóstico de conexão…')
    add('→', `API base: ${API_BASE}`)
    add('→', `Origem:   ${window.location.origin}`)

    sep('Ambiente do browser')

    const browser = `${detectBrowser()} ${browserVersion()}`
    add('→', `Browser: ${browser}`)

    if (navigator.onLine) {
      add('✓', 'Rede: online')
    } else {
      add('✕', 'Rede: OFFLINE — sem conexão à internet')
    }

    if (navigator.cookieEnabled) {
      add('✓', 'Cookies: habilitados (necessário para autenticação)')
    } else {
      add('✕', 'Cookies: DESABILITADOS — autenticação não funcionará')
    }

    // Variáveis de ambiente
    const definidas = VITE_VARS.filter(k => !!import.meta.env[k])
    const faltando  = VITE_VARS.filter(k => !import.meta.env[k])
    if (definidas.length) add('✓', `Vars definidas: ${definidas.join(', ')}`, true)
    if (faltando.length)  add('⚠', `Vars ausentes: ${faltando.join(', ')} (serão usados defaults)`, true)

    const appVer = import.meta.env.VITE_APP_VERSION
    if (appVer) add('→', `Versão do frontend: ${appVer}`, true)

    // ════════════════════════════════════════════════════════
    // B. Servidor (raiz)
    // ════════════════════════════════════════════════════════
    sep('Servidor')
    add('→', `GET ${SERVER_ROOT}/`)

    let serverUp = false
    {
      const { res, ms, timedOut, corsBlocked, errMsg } = await fetchTimed(`${SERVER_ROOT}/`, {}, 8000)

      if (timedOut) {
        add('⚠', `Não respondeu em 8 s — servidor hibernando (Render free tier)`)
        add('→', 'Aguardando wake-up — nova tentativa em até 15 s…')
        const retry = await fetchTimed(`${SERVER_ROOT}/`, {}, 15000)
        if (retry.res) {
          serverUp = true
          setApiOnline(true)
          add('✓', `Servidor acordou (${retry.res.status}) após ${retry.ms}ms`)
        } else {
          setApiOnline(false)
          add('✕', `Servidor não respondeu após ~23 s — pode estar offline ou com erro`)
        }
      } else if (corsBlocked) {
        setApiOnline(false)
        add('✕', `CORS bloqueou GET ${SERVER_ROOT}/`)
        add('⚠', `FRONTEND_URL no Render não inclui ${window.location.origin}`, true)
      } else if (res) {
        serverUp = true
        setApiOnline(true)
        let versao = ''
        try { const j = await res.clone().json(); versao = j.versao || j.version || '' } catch { /* ok */ }
        const corsHeader = res.headers.get('access-control-allow-origin') || '(não enviado)'
        add('✓', `Servidor respondeu (${res.status}) em ${ms}ms${versao ? ` — versão: ${versao}` : ''}`)
        add('→', `CORS allow-origin: ${corsHeader}`, true)
      }
    }

    // ════════════════════════════════════════════════════════
    // C. Rota raiz da API
    // ════════════════════════════════════════════════════════
    sep('Endpoint /api')
    add('→', `GET ${API_BASE}`)
    {
      const { res, ms, timedOut } = await fetchTimed(API_BASE, {}, 6000)
      if (timedOut)          add('⚠', `/api não respondeu em 6 s (skip)`)
      else if (!res)         add('⚠', 'Não foi possível testar /api')
      else if (res.status === 404) add('⚠', `/api retornou 404 em ${ms}ms — rota raiz não existe (normal).`)
      else if (res.ok)       add('✓', `/api respondeu ${res.status} em ${ms}ms`)
      else                   add('⚠', `/api retornou ${res.status} em ${ms}ms`)
    }

    // ════════════════════════════════════════════════════════
    // D. Serviços (health detalhado)
    // ════════════════════════════════════════════════════════
    sep('Serviços (health)')
    add('→', `GET ${API_BASE}/health`)
    {
      const { res, ms, timedOut, errMsg } = await fetchTimed(`${API_BASE}/health`, {}, 10000)
      if (timedOut) {
        add('⚠', 'Health check não respondeu em 10 s')
      } else if (!res) {
        add('⚠', `Health inacessível: ${errMsg || 'erro desconhecido'}`)
      } else {
        const j = await readJson(res)
        const s = j?.servicos || {}

        // MongoDB
        if (s.mongodb)   add(s.mongodb.ok   ? '✓' : '✕', `MongoDB:    ${s.mongodb.status}`)
        // Redis
        if (s.redis)     add(s.redis.ok     ? '✓' : '⚠', `Redis:      ${s.redis.status}`)
        // Cloudinary
        if (s.cloudinary) add(s.cloudinary.ok ? '✓' : '✕', `Cloudinary: ${s.cloudinary.status}`)
        // GitHub
        if (s.github)    add(s.github.ok    ? '✓' : '⚠', `GitHub:     ${s.github.status}`)
        // Groq / IA
        if (s.groq)      add(s.groq.ok      ? '✓' : '⚠', `IA/Groq:    ${s.groq.status}`)

        // Metadados
        const partes = []
        if (j.env)         partes.push(`ambiente: ${j.env}`)
        if (j.latencia_ms) partes.push(`latência interna: ${j.latencia_ms}ms`)
        partes.push(`round-trip: ${ms}ms`)
        add('→', partes.join(' | '), true)

        if (res.status === 503) add('⚠', `Health retornou 503 — um ou mais serviços críticos offline`)
      }
    }

    // ════════════════════════════════════════════════════════
    // E. Autenticação
    // ════════════════════════════════════════════════════════
    sep('Autenticação')
    add('→', `POST ${API_BASE}/auth/login (credenciais vazias — apenas testa o endpoint)`)
    {
      const { res, ms, timedOut, corsBlocked, errMsg } = await fetchTimed(
        `${API_BASE}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: '', senha: '' }),
        },
        8000,
      )

      if (timedOut) {
        add('⚠', 'Auth não respondeu em 8 s')
      } else if (corsBlocked) {
        add('✕', `CORS bloqueou POST /api/auth/login`)
        add('⚠', `Adicione ${window.location.origin} em FRONTEND_URL no Render`, true)
      } else if (!res) {
        add('✕', `Erro ao testar auth: ${errMsg}`)
      } else {
        const j = await readJson(res)
        const msg        = j?.erro || j?.message || ''
        const corsHeader = res.headers.get('access-control-allow-origin') || '(não enviado)'
        const varyHeader = res.headers.get('vary') || ''

        if (res.status === 400 || res.status === 422) {
          add('✓', `Auth respondeu ${res.status} — validação OK (endpoint acessível) em ${ms}ms`)
        } else if (res.status === 401) {
          add('✓', `Auth respondeu 401 — endpoint acessível em ${ms}ms`)
        } else if (res.status === 404) {
          add('✕', `Auth retornou 404 — rota /api/auth/login não encontrada`)
        } else if (res.status === 500) {
          if (/cors/i.test(msg)) {
            add('✕', `Auth retornou 500: CORS bloqueado: ${window.location.origin}`)
          } else {
            add('✕', `Auth retornou 500${msg ? `: ${msg}` : ''} em ${ms}ms`)
            add('⚠', `Provável causa: utilizador não existe. Aceda a /admin/setup para criar.`, true)
          }
        } else {
          add('⚠', `Auth retornou ${res.status}${msg ? `: ${msg}` : ''} em ${ms}ms`)
        }

        // Headers de segurança/CORS
        add('→', `CORS allow-origin: ${corsHeader}`, true)
        if (varyHeader) add('→', `Vary: ${varyHeader}`, true)

        // Aviso se a origem atual não está no header CORS
        if (corsHeader !== window.location.origin &&
            corsHeader !== '*' &&
            corsHeader !== '(não enviado)') {
          add('⚠', `Origem atual (${window.location.origin}) ≠ CORS permitida (${corsHeader})`, true)
          add('⚠', `Login pode falhar em produção — revise FRONTEND_URL no Render`, true)
        }
      }
    }


    // ════════════════════════════════════════════════════════
    // F. Status das plataformas (Render + Vercel)
    //    Chamadas paralelas direto ao Statuspage.io (CORS público)
    // ════════════════════════════════════════════════════════
    sep('Plataformas')

    const STATUSPAGE = {
      render: 'https://status.render.com/api/v2',
      vercel:  'https://www.vercel-status.com/api/v2',
    }

    const COR_IND = { none: '✓', minor: '⚠', major: '✕', critical: '✕' }

    async function checkPlatform(nome, base) {
      add('→', `Verificando ${nome} → GET ${base}/status.json`)
      const { res, ms, timedOut, corsBlocked } = await fetchTimed(`${base}/status.json`, {}, 6000)
      if (timedOut)    { add('⚠', `${nome}: não respondeu em 6 s`); return }
      if (corsBlocked) { add('⚠', `${nome}: CORS bloqueou a requisição`); return }
      if (!res)        { add('⚠', `${nome}: inacessível`); return }
      let j = {}
      try { j = await res.json() } catch { add('⚠', `${nome}: resposta inválida`); return }

      const ind = j?.status?.indicator || 'none'
      const ico = COR_IND[ind] || '→'
      add(ico, `${nome}: ${j?.status?.description || ind} (${ms}ms)`)

      // Componentes com problema
      const { res: resC } = await fetchTimed(`${base}/components.json`, {}, 5000)
      if (resC) {
        let jc = {}
        try { jc = await resC.json() } catch { /* ok */ }
        const degradados = (jc.components || [])
          .filter(c => !c.group && c.status !== 'operational' && c.status !== 'under_maintenance')
        if (degradados.length) {
          degradados.forEach(c => add('⚠', `  ${c.name}: ${c.status}`, true))
        }
      }

      // Incidentes ativos
      const { res: resI } = await fetchTimed(`${base}/incidents/unresolved.json`, {}, 5000)
      if (resI) {
        let ji = {}
        try { ji = await resI.json() } catch { /* ok */ }
        const incs = ji.incidents || []
        if (incs.length) {
          incs.forEach(i => add('⚠', `  Incidente: ${i.name} [${i.impact}]`, true))
        } else if (ind === 'none') {
          add('✓', `  Sem incidentes ativos`, true)
        }
      }
    }

    // Roda as duas verificações em paralelo
    await Promise.all([
      checkPlatform('Render', STATUSPAGE.render),
      checkPlatform('Vercel',  STATUSPAGE.vercel),
    ])

    // ════════════════════════════════════════════════════════
    // Fim
    // ════════════════════════════════════════════════════════
    add('→', '─── Diagnóstico concluído. Usa 📋 Copiar para partilhar o log. ───')
    setDiagRunning(false)
    setDiagDone(true)
  }, [])

  // Uma única execução mesmo em React StrictMode (double-mount em dev)
  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    runDiagnostic()
  }, [runDiagnostic])

  function handleRerun() {
    ranRef.current = false
    runDiagnostic().then(() => { ranRef.current = true })
  }

  function handleCopy() {
    const text = entriesRef.current
      .map(e => `[${e.ts}] ${e.icon} ${e.indent ? '  ' : ''}${e.text}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function entryColor(icon) {
    if (icon === '✓') return 'text-green-400'
    if (icon === '✕') return 'text-red-400'
    if (icon === '⚠') return 'text-yellow-400'
    if (icon === '─') return 'text-blue-500'
    return 'text-blue-400'
  }

  if (user) return <Navigate to="/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !senha) { toast.error('Preencha email e senha'); return }
    try {
      setLoading(true)
      await login(email, senha)
      toast.success('Bem-vindo!')
      navigate('/admin')
    } catch (err) {
      toast.error(err.message || 'Falha ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50
                    flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Branding */}
        <div className="text-center mb-2">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center
                          mx-auto mb-3 shadow-lg">
            <LayoutDashboard size={26} className="text-white" />
          </div>
          <h1 className="font-heading text-2xl font-bold">{APP_NAME}</h1>
          <p className="text-gray-500 text-sm mt-1">{APP_TAGLINE}</p>
        </div>

        {/* ── Painel de diagnóstico ──────────────────────────── */}
        <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden shadow-xl">

          {/* Barra de título */}
          <button
            type="button"
            onClick={() => setDiagOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2
                       bg-gray-900 hover:bg-gray-800 transition-colors select-none"
          >
            <span className="flex items-center gap-2 text-xs font-mono">
              {diagRunning  && <RefreshCw size={12} className="animate-spin text-yellow-400" />}
              {!diagRunning && apiOnline === true  && <Wifi    size={12} className="text-green-400" />}
              {!diagRunning && apiOnline === false && <WifiOff size={12} className="text-red-400"   />}
              <span className="text-gray-500">diagnóstico de conexão</span>
              {diagDone && !diagRunning && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  apiOnline ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
                }`}>
                  {apiOnline ? 'API online' : 'API offline'}
                </span>
              )}
            </span>

            <span className="flex items-center gap-2">
              {diagDone && (
                <span
                  role="button" tabIndex={0} title="Copiar log"
                  onClick={e => { e.stopPropagation(); handleCopy() }}
                  onKeyDown={e => e.key === 'Enter' && handleCopy()}
                  className="text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                >
                  {copied
                    ? <ClipboardCheck size={13} className="text-green-400" />
                    : <Clipboard size={13} />
                  }
                </span>
              )}
              {diagDone && !diagRunning && (
                <span
                  role="button" tabIndex={0} title="Repetir diagnóstico"
                  onClick={e => { e.stopPropagation(); handleRerun() }}
                  onKeyDown={e => e.key === 'Enter' && handleRerun()}
                  className="text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                >
                  <RefreshCw size={13} />
                </span>
              )}
              {diagOpen
                ? <ChevronUp   size={13} className="text-gray-500" />
                : <ChevronDown size={13} className="text-gray-500" />
              }
            </span>
          </button>

          {/* Log */}
          {diagOpen && (
            <div className="px-3 py-2.5 max-h-64 overflow-y-auto font-mono text-[11px]
                            leading-relaxed space-y-px">
              {logEntries.length === 0 && diagRunning && (
                <div className="text-gray-500 animate-pulse">Iniciando…</div>
              )}
              {logEntries.map((entry, i) => {
                const isSep = entry.icon === '─'
                if (isSep) return (
                  <div key={i} className="flex items-center gap-1.5 pt-1.5 pb-0.5">
                    <span className="text-blue-700 shrink-0">──</span>
                    <span className="text-blue-400 font-semibold tracking-wide uppercase text-[10px]">
                      {entry.text}
                    </span>
                    <span className="flex-1 border-t border-blue-900/50" />
                  </div>
                )
                return (
                  <div key={i} className={`flex gap-2 items-start ${entry.indent ? 'pl-6' : ''}`}>
                    <span className="text-gray-600 shrink-0 select-none tabular-nums">[{entry.ts}]</span>
                    <span className={`shrink-0 w-4 text-center select-none ${entryColor(entry.icon)}`}>
                      {entry.icon}
                    </span>
                    <span className="text-gray-300 break-all">{entry.text}</span>
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7">
          <h2 className="font-heading font-bold text-xl text-gray-800 mb-5">Entrar</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email" type="email"
                className={`input transition-opacity${loading ? ' opacity-50 pointer-events-none' : ''}`}
                placeholder="admin@empresa.com"
                value={email} onChange={e => setEmail(e.target.value)} readOnly={loading}
              />
            </div>

            <div>
              <label className="label" htmlFor="senha">Senha</label>
              <div className="relative">
                <input
                  id="senha" type={mostrarSenha ? 'text' : 'password'}
                  className={`input pr-10 transition-opacity${loading ? ' opacity-50 pointer-events-none' : ''}`}
                  placeholder="••••••••"
                  value={senha} onChange={e => setSenha(e.target.value)} readOnly={loading}
                />
                <button
                  type="button"
                  onClick={() => setMostrar(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn size={16} /> Entrar
                </span>
              )}
            </button>

            <div className="text-center mt-3">
              <Link to="/esqueci-senha"
                className="text-xs text-gray-400 hover:text-green-600 transition-colors">
                Esqueceu sua senha?
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400">
          Acesso restrito a administradores
        </p>
      </div>
    </div>
  )
}
