/**
 * PrivateRoute.jsx
 *
 * Mudança em relação ao original:
 * - AdminRoute: redireciona usuários sem permissão para /login
 *   (antes redirecionava para "/" que era a home pública — não existe mais)
 */
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Rota que exige apenas login (qualquer usuário autenticado). */
export default function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

/**
 * Rota exclusiva do painel admin.
 * Usuários sem permissões de admin são redirecionados para /login.
 */
export function AdminRoute({ children }) {
  const { user, podeAcessarAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!podeAcessarAdmin()) return <Navigate to="/login" replace />
  return children
}
