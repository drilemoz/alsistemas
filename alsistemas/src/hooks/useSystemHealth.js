/**
 * useSystemHealth.js — Sprint 2 (atualizado: inclui GitHub e Groq)
 *
 * Agrega saúde do sistema a partir de dois endpoints existentes:
 *   - GET /api/health          → MongoDB, Redis, Cloudinary, GitHub, Groq, latência
 *   - GET /admin/infraestrutura/sistema/metricas → CPU, memória, uptime
 *
 * Retorna um objeto único pronto para ser renderizado no dashboard.
 */
import { useState, useEffect, useCallback } from 'react'
import { healthService, infraestruturaService } from '../services/api'

const INTERVALO_MS = 30_000 // refresh a cada 30 s

export function useSystemHealth() {
  const [health,   setHealth]   = useState(null)
  const [metricas, setMetricas] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [erro,     setErro]     = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const [h, m] = await Promise.allSettled([
        healthService.status(),
        infraestruturaService.sistemaMetricas(),
      ])
      if (h.status === 'fulfilled') setHealth(h.value)
      else setErro(h.reason?.message || 'Falha no health check')

      if (m.status === 'fulfilled') setMetricas(m.value)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, INTERVALO_MS)
    return () => clearInterval(t)
  }, [carregar])

  /* ── Valores derivados ── */
  const servicos = health?.servicos ?? {}

  const mongodb = {
    ok:     servicos.mongodb?.ok     ?? false,
    status: servicos.mongodb?.status ?? 'desconhecido',
  }
  const redis = {
    ok:     servicos.redis?.ok       ?? false,
    status: servicos.redis?.status   ?? 'desconhecido',
  }
  const cloudinary = {
    ok:     servicos.cloudinary?.ok  ?? false,
    status: servicos.cloudinary?.status ?? 'desconhecido',
  }
  const github = {
    ok:     servicos.github?.ok      ?? false,
    status: servicos.github?.status  ?? 'não verificado',
  }
  const groq = {
    ok:     servicos.groq?.ok        ?? false,
    status: servicos.groq?.status    ?? 'não verificado',
  }
  const cloudflare = {
    ok:     servicos.cloudflare?.ok  ?? false,
    status: servicos.cloudflare?.status ?? 'não verificado',
  }

  const api = {
    ok:      health?.ok              ?? false,
    latencia: health?.latencia_ms    ?? null,
  }

  const uptime = metricas?.processo?.uptimeFormatado
    || metricas?.uptimeFormatado
    || null

  const cpu = metricas?.sistema?.cpuPercent
    ?? metricas?.cpuPercent
    ?? null

  const memoria = metricas?.processo?.memoriaHeapUsado
    ?? metricas?.memoriaHeapUsado
    ?? null

  const memoriaTotal = metricas?.processo?.memoriaTotal
    ?? metricas?.memoriaTotal
    ?? null

  return {
    loading,
    erro,
    mongodb,
    redis,
    cloudinary,
    github,
    groq,
    cloudflare,
    api,
    uptime,
    cpu,
    memoria,
    memoriaTotal,
    raw: { health, metricas },
    atualizar: carregar,
  }
}
