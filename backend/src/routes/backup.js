/**
 * Backup — AL Sistemas
 *
 * Sistema completo de backup/restore/importação do MongoDB em JSON.
 * Armazena backups em backend/backups/ com metadados.
 *
 * Rotas:
 *   GET    /                  → lista backups
 *   POST   /                  → cria novo backup
 *   GET    /~stats            → estatísticas do banco atual  ← DEVE VIR ANTES DE /:id
 *   POST   /import            → importa backup via arquivo JSON
 *   GET    /:id               → detalhes de um backup
 *   GET    /:id/download      → baixa o arquivo
 *   POST   /:id/restore       → restaura um backup
 *   DELETE /:id               → exclui um backup
 */
import { Router }          from 'express'
import mongoose             from 'mongoose'
import fs                   from 'fs/promises'
import { createReadStream } from 'fs'
import path                 from 'path'
import multer               from 'multer'
import { autenticar }       from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'
import { logger }           from '../utils/logger.js'

const router = Router()
router.use(autenticar)
router.use(verificarPermissao('backup.gerenciar'))

const BACKUP_DIR = path.resolve(process.cwd(), 'backups')

// Multer — armazena o arquivo de importação em memória (apenas JSON, máx 100 MB)
const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === 'application/json' ||
      file.originalname.toLowerCase().endsWith('.json')
    if (ok) cb(null, true)
    else cb(new Error('Apenas arquivos .json são aceitos para importação'), false)
  },
})

// ── Helpers ───────────────────────────────────────────────────

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
}

async function getCollectionNames() {
  const collections = await mongoose.connection.db.listCollections().toArray()
  return collections.map(c => c.name)
}

async function exportAllCollections() {
  const db    = mongoose.connection.db
  const names = await getCollectionNames()
  const data  = {}
  await Promise.all(
    names.map(async name => {
      data[name] = await db.collection(name).find({}).toArray()
    })
  )
  return data
}

async function getDatabaseStats() {
  const db    = mongoose.connection.db
  const names = await getCollectionNames()
  const stats = {}
  await Promise.all(
    names.map(async name => {
      stats[name] = await db.collection(name).countDocuments()
    })
  )
  return stats
}

/** Calcula stats a partir de dados já em memória (sem ir ao banco) */
function calcStatsFromData(data) {
  const stats = {}
  for (const [col, docs] of Object.entries(data)) {
    stats[col] = Array.isArray(docs) ? docs.length : 0
  }
  return stats
}

// ── GET / — lista backups disponíveis ─────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    await ensureBackupDir()
    const files     = await fs.readdir(BACKUP_DIR)
    const manifests = []

    for (const file of files) {
      if (!file.endsWith('.manifest.json')) continue
      try {
        const raw = await fs.readFile(path.join(BACKUP_DIR, file), 'utf-8')
        manifests.push(JSON.parse(raw))
      } catch { /* ignora manifests corrompidos */ }
    }

    manifests.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    res.json({ backups: manifests })
  } catch (err) { next(err) }
})

// ── POST / — cria novo backup ──────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    await ensureBackupDir()

    const id           = `backup_${Date.now()}`
    const { descricao = '' } = req.body
    const dataFile     = path.join(BACKUP_DIR, `${id}.json`)
    const manifestFile = path.join(BACKUP_DIR, `${id}.manifest.json`)

    logger.info({ id }, 'Iniciando criação de backup...')

    const data         = await exportAllCollections()
    const stats        = await getDatabaseStats()
    const totalDocs    = Object.values(stats).reduce((a, b) => a + b, 0)
    const json         = JSON.stringify(data)
    const tamanhoBytes = Buffer.byteLength(json, 'utf-8')

    await fs.writeFile(dataFile, json, 'utf-8')

    const manifest = {
      id,
      descricao: descricao.trim() || `Backup automático — ${new Date().toLocaleString('pt-BR')}`,
      criado_em: new Date().toISOString(),
      criado_por: req.usuario?.email || 'sistema',
      colecoes: stats,
      total_documentos: totalDocs,
      tamanho_bytes: tamanhoBytes,
      versao_schema: '1.0',
    }

    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8')

    logger.info({ id, totalDocs, tamanhoBytes }, 'Backup criado com sucesso')
    res.status(201).json({ mensagem: 'Backup criado com sucesso.', backup: manifest })
  } catch (err) { next(err) }
})

// ── GET /~stats — estatísticas do banco atual ─────────────────
// ⚠️  ESTA ROTA DEVE FICAR ANTES DE /:id
// Se vier depois, Express captura "~stats" como id e retorna "ID inválido"
router.get('/~stats', async (_req, res, next) => {
  try {
    const stats = await getDatabaseStats()
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    res.json({ colecoes: stats, total_documentos: total })
  } catch (err) { next(err) }
})

// ── POST /import — importa backup via arquivo JSON ─────────────
router.post('/import', uploadBackup.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado. Use o campo "arquivo".' })
    }

    await ensureBackupDir()

    // Parseia e valida
    let data
    try {
      data = JSON.parse(req.file.buffer.toString('utf-8'))
    } catch {
      return res.status(400).json({ erro: 'Arquivo inválido: JSON malformado.' })
    }

    if (typeof data !== 'object' || Array.isArray(data) || data === null) {
      return res.status(400).json({
        erro: 'Formato inválido: o arquivo deve ser um objeto JSON com as coleções como chaves.',
      })
    }

    const colecoes = Object.keys(data)
    if (colecoes.length === 0) {
      return res.status(400).json({ erro: 'O arquivo não contém nenhuma coleção.' })
    }

    for (const [col, docs] of Object.entries(data)) {
      if (!Array.isArray(docs)) {
        return res.status(400).json({
          erro: `Formato inválido: a coleção "${col}" deve ser um array de documentos.`,
        })
      }
    }

    const id           = `backup_${Date.now()}`
    const { descricao = '' } = req.body
    const nomeOriginal = req.file.originalname || 'desconhecido'
    const dataFile     = path.join(BACKUP_DIR, `${id}.json`)
    const manifestFile = path.join(BACKUP_DIR, `${id}.manifest.json`)

    const stats        = calcStatsFromData(data)
    const totalDocs    = Object.values(stats).reduce((a, b) => a + b, 0)
    const tamanhoBytes = req.file.size

    await fs.writeFile(dataFile, req.file.buffer)

    const manifest = {
      id,
      descricao: descricao.trim() || `Importado de "${nomeOriginal}" — ${new Date().toLocaleString('pt-BR')}`,
      criado_em: new Date().toISOString(),
      criado_por: req.usuario?.email || 'sistema',
      colecoes: stats,
      total_documentos: totalDocs,
      tamanho_bytes: tamanhoBytes,
      versao_schema: '1.0',
      importado: true,
      arquivo_original: nomeOriginal,
    }

    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8')

    logger.info({ id, nomeOriginal, totalDocs }, 'Backup importado com sucesso')
    res.status(201).json({ mensagem: 'Backup importado com sucesso.', backup: manifest })
  } catch (err) { next(err) }
})

// ── GET /:id — detalhes de um backup ──────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!/^backup_\d+$/.test(id)) return res.status(400).json({ erro: 'ID inválido' })

    const manifestFile = path.join(BACKUP_DIR, `${id}.manifest.json`)
    try {
      const raw = await fs.readFile(manifestFile, 'utf-8')
      res.json(JSON.parse(raw))
    } catch {
      res.status(404).json({ erro: 'Backup não encontrado' })
    }
  } catch (err) { next(err) }
})

// ── GET /:id/download — baixa o arquivo de backup ─────────────
router.get('/:id/download', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!/^backup_\d+$/.test(id)) return res.status(400).json({ erro: 'ID inválido' })

    const dataFile = path.join(BACKUP_DIR, `${id}.json`)
    try {
      await fs.access(dataFile)
    } catch {
      return res.status(404).json({ erro: 'Backup não encontrado' })
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${id}.json"`)
    createReadStream(dataFile).pipe(res)
  } catch (err) { next(err) }
})

// ── POST /:id/restore — restaura um backup ────────────────────
router.post('/:id/restore', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!/^backup_\d+$/.test(id)) return res.status(400).json({ erro: 'ID inválido' })

    const dataFile = path.join(BACKUP_DIR, `${id}.json`)
    let data
    try {
      const raw = await fs.readFile(dataFile, 'utf-8')
      data = JSON.parse(raw)
    } catch {
      return res.status(404).json({ erro: 'Backup não encontrado' })
    }

    logger.warn({ id, usuario: req.usuario?.email }, 'Iniciando restore de backup...')

    const db          = mongoose.connection.db
    const collections = Object.keys(data)
    const resultados  = {}

    for (const colName of collections) {
      const docs = data[colName]
      if (!Array.isArray(docs) || docs.length === 0) {
        resultados[colName] = { excluidos: 0, inseridos: 0 }
        continue
      }

      await db.collection(colName).deleteMany({})

      const docsPreparados = docs.map(doc => {
        if (doc._id && typeof doc._id === 'string') {
          try { doc._id = new mongoose.Types.ObjectId(doc._id) } catch { /* mantém string */ }
        }
        return doc
      })

      const r = await db.collection(colName).insertMany(docsPreparados, { ordered: false })
      resultados[colName] = { excluidos: docs.length, inseridos: r.insertedCount }
    }

    logger.info({ id, resultados }, 'Restore concluído')
    res.json({
      mensagem: 'Restore concluído com sucesso.',
      resultados,
      aviso: 'Recomenda-se reiniciar o servidor após o restore.',
    })
  } catch (err) { next(err) }
})

// ── DELETE /:id — exclui um backup ────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    if (!/^backup_\d+$/.test(id)) return res.status(400).json({ erro: 'ID inválido' })

    const dataFile     = path.join(BACKUP_DIR, `${id}.json`)
    const manifestFile = path.join(BACKUP_DIR, `${id}.manifest.json`)

    await Promise.allSettled([
      fs.unlink(dataFile),
      fs.unlink(manifestFile),
    ])

    res.json({ mensagem: 'Backup excluído.' })
  } catch (err) { next(err) }
})

export default router
