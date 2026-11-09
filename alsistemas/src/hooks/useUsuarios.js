/**
 * useUsuarios.js
 *
 * Encapsula todo o estado e lógica de fetch/CRUD de AdminUsuarios.
 *
 * Retorna:
 *   aba, setAba
 *   usuarios, perfis, loading
 *   busca, setBusca
 *   usuariosFiltrados   — lista já filtrada pela busca
 *   carregar            — re-fetch manual
 *   excluirUsuario(id)
 *   excluirPerfil(id)
 *   onSalvarUsuario(u)  — insere ou actualiza na lista local
 *   onSalvarPerfil(p)   — insere ou actualiza na lista local
 */
import { useState, useEffect, useCallback } from 'react'
import { usuariosService } from '../services/api'
import toast from 'react-hot-toast'

export function useUsuarios() {
  const [aba,      setAba]      = useState('usuarios')
  const [usuarios, setUsuarios] = useState([])
  const [perfis,   setPerfis]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [u, p] = await Promise.all([
        usuariosService.listar(),
        usuariosService.listarPerfis(),
      ])
      setUsuarios(u.usuarios || [])
      setPerfis(p.perfis || [])
    } catch (err) {
      toast.error('Erro ao carregar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function excluirUsuario(id) {
    try {
      await usuariosService.excluir(id)
      toast.success('Usuário excluído.')
      setUsuarios(prev => prev.filter(u => (u.id || u._id) !== id))
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function excluirPerfil(id) {
    try {
      await usuariosService.excluirPerfil(id)
      toast.success('Perfil excluído.')
      setPerfis(prev => prev.filter(p => (p.id || p._id) !== id))
    } catch (err) {
      toast.error(err.message)
    }
  }

  function onSalvarUsuario(u) {
    const id = u.id || u._id
    setUsuarios(prev => {
      const idx = prev.findIndex(x => (x.id || x._id) === id)
      return idx >= 0
        ? prev.map((x, i) => (i === idx ? u : x))
        : [u, ...prev]
    })
  }

  function onSalvarPerfil(p) {
    const id = p.id || p._id
    setPerfis(prev => {
      const idx = prev.findIndex(x => (x.id || x._id) === id)
      return idx >= 0
        ? prev.map((x, i) => (i === idx ? p : x))
        : [...prev, p]
    })
  }

  // Filtro de busca por nome ou email (case-insensitive)
  const usuariosFiltrados = usuarios.filter(u => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return u.nome?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  return {
    aba, setAba,
    usuarios, perfis, loading,
    busca, setBusca,
    usuariosFiltrados,
    carregar,
    excluirUsuario,
    excluirPerfil,
    onSalvarUsuario,
    onSalvarPerfil,
  }
}
