import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { TEMAS_MAP, TEMA_PADRAO_ID } from '../themes'

const STORAGE_KEY = 'alsistemas_adm_tema'

const ThemeContext = createContext(null)

/**
 * Aplica as variáveis CSS no elemento .admin-shell.
 * As vars são definidas lá no CSS, então precisamos sobrescrever no mesmo elemento
 * para ter especificidade igual (inline style > class style).
 */
function aplicarVars(vars) {
  const shell = document.querySelector('.admin-shell') ?? document.documentElement
  Object.entries(vars).forEach(([k, v]) => shell.style.setProperty(k, v))
}

export function ThemeProvider({ children }) {
  const [temaId, setTemaId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || TEMA_PADRAO_ID } catch { return TEMA_PADRAO_ID }
  })

  const tema = TEMAS_MAP[temaId] ?? TEMAS_MAP[TEMA_PADRAO_ID]

  useEffect(() => {
    // Tenta aplicar imediatamente e re-tenta após render (caso .admin-shell ainda não exista no DOM)
    aplicarVars(tema.vars)
    document.documentElement.setAttribute('data-adm-tema', temaId)

    // Re-aplica após um tick para garantir que .admin-shell já está montado
    const t = setTimeout(() => aplicarVars(tema.vars), 0)
    return () => clearTimeout(t)
  }, [tema, temaId])

  const mudarTema = useCallback((id) => {
    if (!TEMAS_MAP[id]) return
    setTemaId(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
  }, [])

  return (
    <ThemeContext.Provider value={{ temaId, tema, mudarTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}
