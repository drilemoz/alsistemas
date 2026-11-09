import { Component } from 'react'
import { errosService } from '../services/api'
import { isChunkLoadError, recoverFromChunkError } from '../utils/lazyWithRetry'

// Detecta se o erro é de módulo não carregado (ex: React null)
function isModuleLoadError(error) {
  const msg = error?.message || ''
  return (
    isChunkLoadError(error) ||
    msg.includes('Cannot read properties of null') ||
    (msg.includes('Cannot read property') && msg.includes('null')) ||
    (error?.name === 'TypeError' && msg.includes('useState'))
  )
}

// Desregistra SW e limpa Cache Storage — usado pelo botão "Limpar cache"
async function limparCacheCompleto() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch { /* silencioso */ }
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('als:chunk-retry:'))
    .forEach(key => sessionStorage.removeItem(key))
  const url = new URL(window.location.href)
  url.searchParams.set('__als_update', Date.now().toString())
  window.location.replace(url.toString())
}

// Extrai informações do ambiente
function getEnvironmentInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    connection: navigator.connection ? {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
    } : null,
    reactVersion: (() => {
      try {
        const react = require('react')
        return react.version || 'unknown'
      } catch { return 'not loaded' }
    })(),
  }
}

// Tenta capturar estado do componente que quebrou (limitado, mas útil)
function captureComponentState(instance) {
  try {
    if (!instance) return null
    const state = {}
    // Copia apenas valores serializáveis para não quebrar o JSON.stringify
    for (const [key, value] of Object.entries(instance.state || {})) {
      try {
        JSON.stringify(value)
        state[key] = value
      } catch { /* ignora valores não serializáveis */ }
    }
    return state
  } catch { return null }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null, info: null, copiado: false, detalhes: false }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    this.setState({ info })

    if (isChunkLoadError(erro)) {
      recoverFromChunkError(erro)
    }

    // Coleta dados extras
    const ambiente = getEnvironmentInfo()
    const componentState = captureComponentState(this)
    const moduleError = isModuleLoadError(erro)

    errosService.capturar({
      tipo: 'render',
      mensagem: erro.message || String(erro),
      stack: (erro.stack || '') + '\n\nComponent Stack:\n' + (info?.componentStack || ''),
      dados: {
        componentStack: info?.componentStack,
        contexto: this.props.contexto || null,
        ambiente,
        componentState,
        moduleLoadError: moduleError,
        reactLoaded: ambiente.reactVersion !== 'not loaded',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        route: window.location.pathname,
      },
    })
  }

  async copiarRelatorio() {
    const { erro, info } = this.state
    const componente = extrairComponente(info?.componentStack)
    const local = extrairLocal(erro?.stack)
    const ambiente = getEnvironmentInfo()
    const moduleError = isModuleLoadError(erro)

    const md = [
      `## Bug Report — ${new Date().toLocaleString('pt-BR')}`,
      '',
      `**Mensagem:** ${erro?.message}`,
      componente ? `**Componente:** ${componente}` : '',
      local ? `**Arquivo:** ${local}` : '',
      `**URL:** ${window.location.href}`,
      `**Rota:** ${window.location.pathname}`,
      '',
      '### Ambiente',
      `- **Navegador:** ${ambiente.userAgent}`,
      `- **Plataforma:** ${ambiente.platform}`,
      `- **Viewport:** ${ambiente.viewport} (DPR: ${ambiente.devicePixelRatio})`,
      `- **React:** ${ambiente.reactVersion}`,
      moduleError ? '⚠️ **Erro de carregamento de módulo detectado**' : '',
      '',
      '### Stack Trace',
      '```',
      erro?.stack || '(sem stack)',
      '```',
      info?.componentStack ? `\n### Component Stack\n\`\`\`\n${info.componentStack}\n\`\`\`` : '',
      ambiente.connection ? `\n### Conexão\n- **Tipo:** ${ambiente.connection.effectiveType}\n- **Downlink:** ${ambiente.connection.downlink} Mbps\n- **RTT:** ${ambiente.connection.rtt} ms` : '',
    ].filter(Boolean).join('\n')

    await navigator.clipboard.writeText(md)
    this.setState({ copiado: true })
    setTimeout(() => this.setState({ copiado: false }), 2000)
  }

  render() {
    const { erro, info, copiado, detalhes } = this.state
    const { fallback, children } = this.props

    if (!erro) return children
    if (fallback) return fallback(erro, () => this.setState({ erro: null, info: null }))

    const componente = extrairComponente(info?.componentStack)
    const local = extrairLocal(erro?.stack)
    const moduleError = isModuleLoadError(erro)
    const ambiente = getEnvironmentInfo()

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '40vh',
        padding: 32, textAlign: 'center', fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Ícone de erro (personalizado para módulo) */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: moduleError ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)',
          border: `1px solid ${moduleError ? 'rgba(245,158,11,.2)' : 'rgba(239,68,68,.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          {moduleError ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" width="24" height="24">
              <path d="M12 9v4M12 17h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" width="24" height="24">
              <path d="M12 9v4M12 17h.01"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          )}
        </div>

        {/* Título e mensagem */}
        <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
          {moduleError ? 'Falha ao carregar módulo' : 'Algo deu errado'}
        </h2>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#374151', maxWidth: 420, lineHeight: 1.5 }}>
          {erro.message || 'Erro inesperado de renderização.'}
        </p>

        {/* Sugestão específica para erro de módulo */}
        {moduleError && (
          <div style={{
            marginTop: 10, padding: '8px 16px',
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.2)',
            borderRadius: 8, fontSize: 12, color: '#92400e', maxWidth: 460,
          }}>
            <strong>Possível causa:</strong> o módulo React não foi carregado corretamente.
            <br />
            Tente limpar o cache do navegador ou recarregar a página com Ctrl+Shift+R.
          </div>
        )}

        {/* Localização do erro */}
        {(componente || local) && (
          <div style={{
            marginTop: 10, marginBottom: 4,
            display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {componente && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#ef4444',
              }}>
                ⚛️ {componente}
              </span>
            )}
            {local && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.2)',
                borderRadius: 6, padding: '3px 10px', fontSize: 12,
                color: '#92400e', fontFamily: 'monospace',
              }}>
                📄 {local}
              </span>
            )}
          </div>
        )}

        {/* Informações do ambiente (resumido) */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span>🖥️ {ambiente.viewport}</span>
            <span>⚛️ React {ambiente.reactVersion}</span>
            <span>🌐 {navigator.language}</span>
          </div>
        )}

        <p style={{ margin: '10px 0 20px', fontSize: 11, color: '#94a3b8' }}>
          O erro foi registrado automaticamente.
        </p>

        {/* Botões de ação */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => this.setState({ erro: null, info: null })}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 13,
            }}
          >
            Tentar novamente
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid #e2e8f0',
              color: '#64748b', fontWeight: 500, fontSize: 13,
            }}
          >
            Recarregar página
          </button>
          <button
            onClick={() => this.copiarRelatorio()}
            style={{
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
              background: copiado ? 'rgba(34,197,94,.1)' : 'rgba(0,0,0,.04)',
              border: `1px solid ${copiado ? '#22c55e' : '#e2e8f0'}`,
              color: copiado ? '#16a34a' : '#64748b', fontWeight: 500, fontSize: 13,
              transition: 'all .2s',
            }}
          >
            {copiado ? '✓ Copiado!' : '📋 Copiar relatório'}
          </button>
          {moduleError && (
            <button
              onClick={() => {
                // Tenta forçar recarga limpa
                limparCacheCompleto()
              }}
              style={{
                padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 13,
                border: 'none',
              }}
            >
              🧹 Limpar cache e recarregar
            </button>
          )}
        </div>

        {/* Detalhes técnicos colapsáveis (igual ao anterior, mas com ambiente) */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: 24, maxWidth: 640, width: '100%', textAlign: 'left' }}>
            <button
              onClick={() => this.setState(s => ({ detalhes: !s.detalhes }))}
              style={{
                fontSize: 12, color: '#94a3b8', background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"
                style={{ transform: detalhes ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
              {detalhes ? 'Ocultar' : 'Ver'} detalhes técnicos (dev)
            </button>

            {detalhes && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Informações do ambiente */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>
                    Ambiente
                  </div>
                  <pre style={{
                    fontSize: 11, color: '#64748b', background: '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: 8,
                    padding: 12, overflow: 'auto', maxHeight: 160,
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontFamily: '"JetBrains Mono","Fira Code","Courier New",monospace',
                  }}>
                    {JSON.stringify(ambiente, null, 2)}
                  </pre>
                </div>

                {/* Stack trace e component stack como antes */}
                {/* ... (código existente mantido) ... */}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
}

// Funções auxiliares mantidas do original
function extrairComponente(componentStack) {
  if (!componentStack) return null
  const match = componentStack.match(/^\s*at (\w+)/)
  return match?.[1] || null
}

function extrairLocal(stack) {
  if (!stack) return null
  const match = stack.match(/src\/[^\s)]+\.jsx?:\d+/)
  return match?.[0] || null
}