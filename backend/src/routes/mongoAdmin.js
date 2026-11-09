/**
 * mongoAdmin.js — Gerenciamento MongoDB via painel admin.
 * Permite listar coleções, navegar documentos, editar, excluir e executar aggregates.
 *
 * REGRAS DE SEGURANÇA:
 *  - Sem dropCollection, dropDatabase, deleteMany sem filtro
 *  - Campos 'senha' e 'password' mascarados em todos os retornos
 *  - Sem execução de JS arbitrário ($where, eval)
 *  - Aggregate: max 5 estágios, sem $out e $merge, timeout 5s
 *  - Todas as mutações registradas no AuditLog
 */
import express from 'express'
import mongoose from 'mongoose'
import { autenticar }         from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'
import AuditLog               from '../models/AuditLog.js'
import { logger }             from '../utils/logger.js'

const router = express.Router()

// ── Auth global ────────────────────────────────────────────────
router.use(autenticar)
router.use(verificarPermissao('admin'))

// ── Helpers ────────────────────────────────────────────────────

const EXCLUIR_COLECOES = ['sessions']

function mascarar(doc) {
  if (!doc || typeof doc !== 'object') return doc
  const copia = { ...doc }
  for (const k of Object.keys(copia)) {
    const kl = k.toLowerCase()
    if (kl === 'senha' || kl === 'password') {
      copia[k] = '••••••••'
    } else if (copia[k] && typeof copia[k] === 'object' && !Array.isArray(copia[k]) && !(copia[k] instanceof Date)) {
      copia[k] = mascarar(copia[k])
    }
  }
  return copia
}

function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function registrarAudit(req, acao, recurso, recurso_id) {
  try {
    if (!req.usuario) return
    await AuditLog.create({
      admin_id:    req.usuario._id,
      admin_email: req.usuario.email,
      acao,
      recurso,
      recurso_id:  recurso_id ? String(recurso_id) : null,
      payload:     null,
      ip:          req.ip,
      request_id:  req.requestId || null,
    })
  } catch (err) {
    logger.error({ err: err.message }, 'Falha ao gravar audit log (mongoAdmin)')
  }
}

// ── GET /admin/mongo/colecoes ──────────────────────────────────
router.get('/colecoes', async (req, res, next) => {
  try {
    const db     = mongoose.connection.db
    const todas  = await db.listCollections().toArray()

    const visiveis = todas.filter(c =>
      !EXCLUIR_COLECOES.includes(c.name) && !c.name.startsWith('system.')
    )

    const resultado = await Promise.all(
      visiveis.map(async ({ name }) => {
        try {
          const stats = await db.command({ collStats: name })
          return {
            nome:    name,
            total:   stats.count   ?? 0,
            tamanho: stats.size    ?? 0,
            tamanhoFormatado: formatarBytes(stats.size ?? 0),
          }
        } catch {
          const col   = db.collection(name)
          const total = await col.countDocuments()
          return { nome: name, total, tamanho: 0, tamanhoFormatado: '—' }
        }
      })
    )

    resultado.sort((a, b) => a.nome.localeCompare(b.nome))
    res.json({ colecoes: resultado })
  } catch (err) {
    next(err)
  }
})

// ── GET /admin/mongo/colecoes/:nome/documentos ─────────────────
router.get('/colecoes/:nome/documentos', async (req, res, next) => {
  try {
    const { nome } = req.params
    let page  = Math.max(1, parseInt(req.query.page  || '1',  10))
    let limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)))
    const skip = (page - 1) * limit

    let filtro = {}
    if (req.query.filtro) {
      try { filtro = JSON.parse(req.query.filtro) } catch {
        return res.status(400).json({ erro: 'Filtro JSON inválido.' })
      }
      // Bloquear $where (JS arbitrário)
      if (filtro.$where) {
        return res.status(400).json({ erro: 'Operador $where não é permitido.' })
      }
    }

    const db    = mongoose.connection.db
    const col   = db.collection(nome)
    const total = await col.countDocuments(filtro)
    const docs  = await col.find(filtro).skip(skip).limit(limit).toArray()
    const pages = Math.ceil(total / limit) || 1

    res.json({
      docs:  docs.map(mascarar),
      total,
      page,
      pages,
    })
  } catch (err) {
    next(err)
  }
})

// ── DELETE /admin/mongo/colecoes/:nome/documentos/:id ──────────
router.delete('/colecoes/:nome/documentos/:id', async (req, res, next) => {
  try {
    const { nome, id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: '_id inválido.' })
    }

    const db  = mongoose.connection.db
    const col = db.collection(nome)
    const resultado = await col.deleteOne({ _id: new mongoose.Types.ObjectId(id) })

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: 'Documento não encontrado.' })
    }

    await registrarAudit(req, 'mongo_delete', `${nome}/${id}`, id)
    res.json({ ok: true, mensagem: 'Documento excluído.' })
  } catch (err) {
    next(err)
  }
})

// ── PUT /admin/mongo/colecoes/:nome/documentos/:id ─────────────
router.put('/colecoes/:nome/documentos/:id', async (req, res, next) => {
  try {
    const { nome, id } = req.params
    const { campos }   = req.body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ erro: '_id inválido.' })
    }
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) {
      return res.status(400).json({ erro: 'Body deve conter { campos: { chave: valor } }.' })
    }
    if ('_id' in campos) {
      return res.status(400).json({ erro: 'Não é permitido alterar o campo _id.' })
    }

    const db  = mongoose.connection.db
    const col = db.collection(nome)
    const resultado = await col.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: campos }
    )

    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: 'Documento não encontrado.' })
    }

    await registrarAudit(req, 'mongo_update', `${nome}/${id}`, id)
    res.json({ ok: true, mensagem: 'Documento atualizado.', modificados: resultado.modifiedCount })
  } catch (err) {
    next(err)
  }
})

// ── POST /admin/mongo/colecoes/:nome/aggregate ─────────────────
const ESTAGIOS_PROIBIDOS = ['$out', '$merge']

router.post('/colecoes/:nome/aggregate', async (req, res, next) => {
  try {
    const { nome }     = req.params
    const { pipeline } = req.body

    if (!Array.isArray(pipeline)) {
      return res.status(400).json({ erro: 'pipeline deve ser um array.' })
    }
    if (pipeline.length > 5) {
      return res.status(400).json({ erro: 'Máximo de 5 estágios permitidos.' })
    }

    for (const estagio of pipeline) {
      const chaves = Object.keys(estagio)
      for (const k of chaves) {
        if (ESTAGIOS_PROIBIDOS.includes(k)) {
          return res.status(400).json({ erro: `Estágio ${k} não é permitido.` })
        }
        if (k === '$where') {
          return res.status(400).json({ erro: 'Estágio $where não é permitido.' })
        }
      }
    }

    const db  = mongoose.connection.db
    const col = db.collection(nome)

    const resultado = await col.aggregate(pipeline, { maxTimeMS: 5000 }).toArray()
    res.json({ resultado, total: resultado.length })
  } catch (err) {
    if (err.codeName === 'MaxTimeMSExpired' || err.code === 50) {
      return res.status(408).json({ erro: 'Timeout: aggregate demorou mais de 5 segundos.' })
    }
    next(err)
  }
})

export default router
