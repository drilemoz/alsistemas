import mongoose from 'mongoose'
import SecurityEvent from '../models/SecurityEvent.js'
import { logger } from '../utils/logger.js'

const janela = new Map()
const WINDOW_MS = 10 * 60 * 1000
const THRESHOLDS = { 401: 8, 403: 6, 404: 35, 429: 3 }

function limpar(now) {
  if (janela.size < 1000) return
  for (const [key, item] of janela) if (now - item.inicio > WINDOW_MS) janela.delete(key)
}

async function registrar(req, status, count) {
  if (mongoose.connection.readyState !== 1) return
  const severidade = status === 429 ? 'alta' : status === 403 ? 'alta' : 'media'
  try {
    await SecurityEvent.create({
      tipo: `http_${status}_repetido`, severidade,
      mensagem: `Padrão suspeito: ${count} respostas HTTP ${status} em até 10 minutos.`,
      ip: req.ip, rota: req.originalUrl, metodo: req.method, status,
      usuario_id: req.usuario?._id || null,
      usuario_email: req.usuario?.email || null,
      request_id: req.requestId || null,
      dados: { userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
    })
  } catch (err) {
    logger.warn({ err: err.message }, 'Falha ao registrar evento de segurança')
  }
}

export function securityMonitor(req, res, next) {
  res.on('finish', () => {
    const status = res.statusCode
    const limite = THRESHOLDS[status]
    if (!limite) return
    const now = Date.now()
    limpar(now)
    const key = `${req.ip}|${status}`
    let item = janela.get(key)
    if (!item || now - item.inicio > WINDOW_MS) item = { inicio: now, count: 0, alertado: false }
    item.count += 1
    if (item.count >= limite && !item.alertado) {
      item.alertado = true
      void registrar(req, status, item.count)
    }
    janela.set(key, item)
  })
  next()
}
