import { useState, useEffect, useCallback } from 'react'
import { noticiasService, categoriasService } from '../services/api'

// useNoticias({ categoriaSlug, q, page, limit, dataInicio, dataFim, ordem, status })
export function useNoticias({ categoriaSlug, q, page = 1, limit = 9, dataInicio, dataFim, ordem, status } = {}) {
  const [noticias, setNoticias] = useState([])
  const [total,    setTotal]    = useState(0)
  const [paginas,  setPaginas]  = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await noticiasService.listar({
        categoria: categoriaSlug, page, limit, q,
        dataInicio, dataFim, ordem,
        status,  // #20 — repassa o filtro de status para a API
      })
      setNoticias(data.noticias ?? [])
      setTotal(data.total    ?? 0)
      setPaginas(data.paginas ?? 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [categoriaSlug, q, page, limit, dataInicio, dataFim, ordem, status])

  useEffect(() => { carregar() }, [carregar])

  return { noticias, total, paginas, loading, error, recarregar: carregar }
}

export function useNoticia(id) {
  const [noticia, setNoticia] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await noticiasService.buscarPorId(id)
        setNoticia(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  return { noticia, loading, error }
}

export function useCategorias() {
  const [categorias, setCategorias] = useState([])
  const [loading,    setLoading]    = useState(true)

  const carregar = useCallback(async () => {
    try {
      setLoading(true)
      const data = await categoriasService.listar()
      setCategorias(data)
    } catch {
      setCategorias([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return { categorias, loading, recarregar: carregar }
}
