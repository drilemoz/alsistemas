/**
 * useUsersStats.js — Sprint 2
 *
 * Agrega estatísticas de usuários a partir de:
 *   - GET /admin/usuarios          → lista completa (usuariosService existente)
 *   - GET /admin/usuarios/perfis/todos → perfis de acesso
 *
 * Calcula métricas derivadas sem novos endpoints.
 */
import { useState, useEffect, useCallback } from 'react'
import { usuariosService } from '../services/api'

export function useUsersStats() {
  const [usuarios,  setUsuarios]  = useState([])
  const [perfis,    setPerfis]    = useState([])
  const [loading,   setLoading]   = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [u, p] = await Promise.allSettled([
      usuariosService.listar(),
      usuariosService.listarPerfis(),
    ])
    if (u.status === 'fulfilled') setUsuarios(u.value.usuarios ?? [])
    if (p.status === 'fulfilled') setPerfis(p.value.perfis ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  /* ── Métricas derivadas ── */
  const total         = usuarios.length
  const ativos        = usuarios.filter(u => u.ativo !== false).length
  const inativos      = total - ativos
  const totalPerfis   = perfis.length

  // Últimos 5 logins (campo ultimo_login, se existir)
  const ultimosLogins = [...usuarios]
    .filter(u => u.ultimo_login)
    .sort((a, b) => new Date(b.ultimo_login) - new Date(a.ultimo_login))
    .slice(0, 5)

  // Distribuição por perfil
  const porPerfil = perfis.map(p => ({
    ...p,
    count: usuarios.filter(u => {
      const pid = u.perfil_id?._id?.toString() || u.perfil_id?.toString()
      return pid === (p._id?.toString() || p.id)
    }).length,
  }))

  return {
    loading,
    total,
    ativos,
    inativos,
    totalPerfis,
    ultimosLogins,
    porPerfil,
    usuarios,
    perfis,
    atualizar: carregar,
  }
}
