import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { authService } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const concluido = useRef(false)

  useEffect(() => {
    // Timeout de segurança: se /api/auth/me não responder em 6s (SW travado,
    // API offline, etc.) desbloqueamos o render mesmo sem sessão confirmada.
    const timeout = setTimeout(() => {
      if (!concluido.current) {
        concluido.current = true
        setLoading(false)
      }
    }, 6000)

    authService.getSession()
      .then(({ data }) => {
        if (!concluido.current) {
          concluido.current = true
          clearTimeout(timeout)
          setUser(data.session?.user ?? null)
          setLoading(false)
        }
      })
      .catch(() => {
        // Erro de rede ou SW corrompido: libera o render sem sessão
        if (!concluido.current) {
          concluido.current = true
          clearTimeout(timeout)
          setLoading(false)
        }
      })

    return () => clearTimeout(timeout)
  }, [])

  async function login(email, senha) {
    const { data, error } = await authService.login(email, senha)
    if (error) throw error
    setUser(data.user)
    return data
  }

  async function logout() {
    await authService.logout()
    setUser(null)
  }

  /**
   * Verifica se o usuário logado tem uma permissão específica.
   * Superadmin (role legado) e perfis com '*' têm acesso a tudo.
   */
  function temPermissao(permissao) {
    if (!user) return false
    if (user.role === 'superadmin') return true
    const perms = user.perfil_id?.permissoes || []
    return perms.includes('*') || perms.includes(permissao)
  }

  /**
   * Retorna true se o usuário tem permissão para acessar o painel admin.
   * Usuários comuns (perfil "Usuário", sem permissões) retornam false.
   */
  function podeAcessarAdmin() {
    if (!user) return false
    if (user.role === 'superadmin') return true
    const perms = user.perfil_id?.permissoes || []
    return perms.length > 0
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, temPermissao, podeAcessarAdmin }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro do AuthProvider')
  return ctx
}
