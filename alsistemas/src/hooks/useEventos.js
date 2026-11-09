/**
 * useEventos.js
 *
 * Encapsula fetch e CRUD de eventos de AdminEventos.
 * O estado de UI (editando, confirm) permanece no componente.
 *
 * Retorna:
 *   eventos, loading
 *   eventosDatas    — array de strings ISO (yyyy-mm-dd) para o mini calendário
 *   futuros         — eventos >= hoje, ordenados crescente
 *   passados        — eventos < hoje, ordenados decrescente
 *   carregar()      — re-fetch manual
 *   salvarEvento(editandoId, form) — 'novo' → criar; id → editar
 *   excluirEvento(id)
 */
import { useState, useEffect } from 'react'
import { eventosService } from '../services/api'
import toast from 'react-hot-toast'

export function useEventos() {
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    try {
      setLoading(true)
      const data = await eventosService.listarTodos()
      setEventos(data)
    } catch {
      toast.error('Erro ao carregar eventos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  /**
   * @param {string} editandoId  — 'novo' para criação ou ID para edição
   * @param {object} form        — dados do formulário
   */
  async function salvarEvento(editandoId, form) {
    if (editandoId === 'novo') {
      await eventosService.criar(form)
      toast.success('Evento criado!')
    } else {
      await eventosService.editar(editandoId, form)
      toast.success('Evento atualizado!')
    }
    await carregar()
  }

  async function excluirEvento(id) {
    await eventosService.excluir(id)
    toast.success('Evento excluído')
    await carregar()
  }

  // Pré-computados para o componente
  const eventosDatas = eventos.map(e =>
    new Date(e.data).toISOString().split('T')[0]
  )

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const futuros = eventos
    .filter(e => new Date(e.data) >= hoje)
    .sort((a, b) => new Date(a.data) - new Date(b.data))

  const passados = eventos
    .filter(e => new Date(e.data) < hoje)
    .sort((a, b) => new Date(b.data) - new Date(a.data))

  return {
    eventos,
    loading,
    eventosDatas,
    futuros,
    passados,
    carregar,
    salvarEvento,
    excluirEvento,
  }
}
