/**
 * useSystemLogs.js — Sprint 2
 *
 * Consolida logs do sistema a partir de:
 *   - GET /erros          → erros capturados (ErroLog)
 *   - GET /audit-logs     → ações administrativas (AuditLog)
 *
 * Reutiliza serviços existentes. Nenhum endpoint novo criado.
 */
import { useState, useEffect, useCallback } from 'react'
import { errosService, auditLogsService } from '../services/api'

export function useSystemLogs({ limitErros = 10, limitAudit = 10 } = {}) {
  const [erros,      setErros]      = useState([])
  const [auditLogs,  setAuditLogs]  = useState([])
  const [contagemErros, setContagemErros] = useState({ nao_lidos: 0, total: 0 })
  const [loading,    setLoading]    = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [e, a, c] = await Promise.allSettled([
      errosService.listar({ limit: limitErros }),
      auditLogsService.listar({ limit: limitAudit }),
      errosService.contagem(),
    ])
    if (e.status === 'fulfilled') setErros(e.value.erros ?? [])
    if (a.status === 'fulfilled') setAuditLogs(a.value.logs ?? [])
    if (c.status === 'fulfilled') setContagemErros(c.value)
    setLoading(false)
  }, [limitErros, limitAudit])

  useEffect(() => { carregar() }, [carregar])

  return { erros, auditLogs, contagemErros, loading, atualizar: carregar }
}
