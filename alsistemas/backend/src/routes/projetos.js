/**
 * projetos.js — Rotas de Projetos Locais
 *
 * Sprint 3  — ADIÇÃO PURA. Nenhuma rota existente foi alterada.
 * Sprint 7  — GitHub Sync: vincular, sync-status, registrar-sincronizacao.
 * Sprint 8  — Narração em tempo real via SSE: sync-stream.
 * Sprint 9  — Commit & Push: commit-status, commit-stream.
 *
 * Rotas originais:
 *   GET /api/projetos          → lista todos os projetos
 *   GET /api/projetos/:nome    → detalhes de um projeto específico
 *
 * Novas rotas (Sprint 7 — GitHub Sync):
 *   POST /api/projetos/:nome/vincular                → vincula/desvincula um repo GitHub
 *   GET  /api/projetos/:nome/sync-status             → status de sincronização com GitHub
 *   POST /api/projetos/:nome/registrar-sincronizacao → salva timestamp após sync bem-sucedido
 *
 * Nova rota (Sprint 8 — Narração em tempo real):
 *   GET  /api/projetos/:nome/sync-stream             → SSE: narração completa do processo de sync
 *     Emite eventos JSON no formato:
 *       { type:'narration', msg, nivel, ts }
 *       { type:'step',      etapa, progresso, ts }
 *       { type:'files',     arquivos[] }
 *       { type:'done',      status, msg, relatorio?, ts }
 *     status final: 'success' | 'error' | 'inconsistent'
 *
 * Novas rotas (Sprint 9 — Commit & Push  GitHub ← Servidor):
 *   GET  /api/projetos/:nome/commit-status   → SHA atual, branches, últimos commits
 *   GET  /api/projetos/:nome/commit-stream   → SSE: pipeline completo de commit + push
 *     Query params:
 *       ?message=  mensagem do commit (obrigatório)
 *       ?branch=   branch de destino  (padrão: branch default do repo)
 *       ?autor=    "Nome <email>"     (padrão: bot configurado no env ou usuário autenticado)
 *     Emite eventos JSON no formato idêntico ao sync-stream:
 *       { type:'narration', msg, nivel, ts }
 *       { type:'step',      etapa, progresso, ts }
 *       { type:'files',     arquivos[] }
 *       { type:'done',      status, msg, relatorio?, ts }
 *     status final: 'success' | 'error'
 *
 *   IMPORTANTE — Fluxo de commit usa a GitHub Git Data API (sem git instalado):
 *     1. GET  /repos/:o/:r/git/ref/heads/:branch  → SHA do último commit
 *     2. GET  /repos/:o/:r/git/commits/:sha        → tree SHA base
 *     3. POST /repos/:o/:r/git/blobs (por arquivo) → SHA de cada blob
 *     4. POST /repos/:o/:r/git/trees               → nova tree completa
 *     5. POST /repos/:o/:r/git/commits             → novo objeto commit
 *     6. PATCH /repos/:o/:r/git/refs/heads/:branch → move a ref (push)
 */
import { Router }       from 'express'
import fs               from 'fs'
import path             from 'path'
import crypto           from 'crypto'
import mongoose         from 'mongoose'
import { EventEmitter } from 'events'
import { autenticar }   from '../middleware/auth.js'
import Projeto          from '../models/Projeto.js'
import { githubFetch }  from '../utils/githubClient.js'
import { getCredential } from '../utils/credentialStore.js'
import multer           from 'multer'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

const router   = Router()
const TEMP_DIR = (process.env.UPLOAD_TEMP_DIR || '/tmp') + '/alsistemas-up'

/* ── In-memory jobs para upload R2 com SSE ───────────────────── */
const r2UploadJobs = new Map()

function criarJobR2(nomeProjeto, total) {
  const jobId   = `${nomeProjeto}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const emitter = new EventEmitter()
  emitter.setMaxListeners(5)
  const job = { jobId, nomeProjeto, total, enviados: 0, erros: [], status: 'processando', emitter, criadoEm: Date.now() }
  r2UploadJobs.set(jobId, job)
  // Auto-limpar após 15 minutos
  setTimeout(() => r2UploadJobs.delete(jobId), 15 * 60 * 1000)
  return job
}
try { fs.mkdirSync(TEMP_DIR, { recursive: true }) } catch {}

// diskStorage — grava ZIP direto em disco enquanto faz upload,
// sem bufferizar tudo na RAM (resolve lentidão no Render)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename:    (_req, _file, cb) => {
      cb(null, `proj-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`)
    },
  }),
  limits:  { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true)
    } else {
      cb(new Error('Apenas arquivos .zip são aceitos.'), false)
    }
  },
})

function deleteTempFile(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p) } catch {}
}

// ─── Diretório base dos projetos ──────────────────────────────────────────────
const PROJETOS_DIR = process.env.PROJETOS_PATH
  ? path.resolve(process.cwd(), process.env.PROJETOS_PATH)
  : path.join(process.cwd(), '..', 'projetos')

/* ── Utilitários (inalterados da Sprint 3) ──────────────────── */

function lerPackageJson(dirPath) {
  try {
    const pkgPath = path.join(dirPath, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf8')
      const pkg = JSON.parse(raw)
      return {
        nome:      pkg.name        || null,
        versao:    pkg.version     || null,
        descricao: pkg.description || null,
        scripts:   Object.keys(pkg.scripts || {}),
      }
    }
  } catch { /* leitura falhou */ }
  return null
}

function detectarTecnologias(dirPath) {
  const techs = []
  const checks = [
    { file: 'package.json',        tech: 'Node.js'    },
    { file: 'requirements.txt',    tech: 'Python'     },
    { file: 'Pipfile',             tech: 'Python'     },
    { file: 'pyproject.toml',      tech: 'Python'     },
    { file: 'Cargo.toml',          tech: 'Rust'       },
    { file: 'go.mod',              tech: 'Go'         },
    { file: 'pom.xml',             tech: 'Java'       },
    { file: 'composer.json',       tech: 'PHP'        },
    { file: 'Gemfile',             tech: 'Ruby'       },
    { file: 'Dockerfile',          tech: 'Docker'     },
    { file: 'docker-compose.yml',  tech: 'Docker'     },
    { file: '.github',             tech: 'GitHub CI'  },
  ]
  for (const { file, tech } of checks) {
    if (!techs.includes(tech) && fs.existsSync(path.join(dirPath, file))) {
      techs.push(tech)
    }
  }
  return techs
}

function detectarStatus(stat) {
  const diasDesdeModificacao = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24)
  if (diasDesdeModificacao < 7)   return 'ativo'
  if (diasDesdeModificacao < 90)  return 'pausado'
  return 'arquivado'
}

function lerProjeto(nome, dirPath) {
  const stat  = fs.statSync(dirPath)
  const pkg   = lerPackageJson(dirPath)
  const techs = detectarTecnologias(dirPath)

  let descricao = pkg?.descricao || ''
  if (!descricao) {
    for (const readme of ['README.md', 'README.txt', 'readme.md']) {
      try {
        const rPath = path.join(dirPath, readme)
        if (fs.existsSync(rPath)) {
          const linhas = fs.readFileSync(rPath, 'utf8').split('\n').filter(l => l.trim())
          const linha  = linhas.find(l => !l.startsWith('#') && l.trim()) || ''
          descricao    = linha.slice(0, 200)
          break
        }
      } catch { /* continua */ }
    }
  }

  return {
    nome,
    caminho:         path.join('projetos', nome),
    descricao:       descricao || '—',
    status:          detectarStatus(stat),
    tecnologias:     techs,
    ultimaAlteracao: stat.mtime,
    package:         pkg,
  }
}

/* ══════════════════════════════════════════════════════════════
   UPLOAD DE PROJETO — Sprint 10
   Recebe um ZIP do browser, extrai na pasta Projetos do servidor.
   Proteção anti-Zip Slip: nenhum path fora de PROJETOS_DIR.

   POST /api/projetos/upload
   Content-Type: multipart/form-data
   Campos:
     zip          — arquivo .zip (obrigatório)
     nomeProjeto  — nome da pasta destino (padrão: nome do arquivo)
     substituir   — "true" para sobrescrever se já existir
══════════════════════════════════════════════════════════════ */
router.post('/upload', autenticar, upload.single('zip'), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ erro: 'Nenhum arquivo ZIP enviado.' })

  // ── Sanitizar nome do projeto ────────────────────────────
  let nomeProjeto = (req.body.nomeProjeto || req.file.originalname.replace(/\.zip$/i, '') || 'projeto')
    .toString().trim()
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(nomeProjeto))
    return res.status(400).json({ erro: 'Nome inválido. Use letras, números, ., - ou _ (máx. 60 chars).' })

  const substituir = req.body.substituir === 'true'
  const destDir    = path.join(PROJETOS_DIR, nomeProjeto)

  if (fs.existsSync(destDir) && !substituir)
    return res.status(409).json({
      erro: `Já existe um projeto chamado "${nomeProjeto}". Marque "Substituir" para sobrescrever.`,
    })

  try {
    // ── Garantir que PROJETOS_DIR existe ──────────────────
    if (!fs.existsSync(PROJETOS_DIR))
      fs.mkdirSync(PROJETOS_DIR, { recursive: true })

    if (fs.existsSync(destDir) && substituir)
      fs.rmSync(destDir, { recursive: true, force: true })

    fs.mkdirSync(destDir, { recursive: true })

    // ── Extrair ZIP do buffer ─────────────────────────────
    const { default: unzipper } = await import('unzipper')
    const { Readable }          = await import('stream')

    let   prefixo           = null
    let   arquivosExtraidos = 0
    const erros             = []

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          const entryPath = entry.path

          // Detectar e remover prefixo de nível raiz (ex: repo-main/)
          if (prefixo === null) {
            const firstSlash = entryPath.indexOf('/')
            prefixo = firstSlash !== -1 && !entryPath.includes('..') && entryPath.indexOf('/') > 0
              ? entryPath.slice(0, firstSlash + 1)
              : ''
          }

          const relPath = prefixo && entryPath.startsWith(prefixo)
            ? entryPath.slice(prefixo.length)
            : entryPath

          // Proteção anti-Zip Slip
          if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) {
            entry.autodrain(); return
          }
          const destPath = path.join(destDir, relPath)
          if (!destPath.startsWith(destDir + path.sep) && destPath !== destDir) {
            entry.autodrain(); return
          }

          if (entry.type === 'Directory') {
            fs.mkdirSync(destPath, { recursive: true })
            entry.autodrain()
          } else {
            fs.mkdirSync(path.dirname(destPath), { recursive: true })
            const out = fs.createWriteStream(destPath)
            entry.pipe(out)
              .on('finish', () => { arquivosExtraidos++ })
              .on('error',  e  => erros.push(e.message))
          }
        })
        .on('finish', resolve)
        .on('error',  reject)
    })

    deleteTempFile(req.file.path) // remove ZIP temp
    res.json({
      ok:              true,
      nomeProjeto,
      arquivos:        arquivosExtraidos,
      avisos:          erros.length ? erros.slice(0, 5) : undefined,
      mensagem:        `Projeto "${nomeProjeto}" enviado com sucesso (${arquivosExtraidos} arquivos).`,
    })

    // Registra o timestamp de sincronização no banco (se o projeto já existir vinculado)
    Projeto.findOneAndUpdate(
      { nome: nomeProjeto },
      { $set: { 'metadados.ultimaSincronizacao': new Date() } },
      { upsert: false }
    ).catch(() => null)
  } catch (err) {
    // Limpa pasta parcial em caso de falha
    try { if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true }) } catch {}
    res.status(500).json({ erro: err.message || 'Erro ao extrair o arquivo ZIP.' })
  }
})

/* ══════════════════════════════════════════════════════════════
   GRIDFS — Sprint 11
   Armazenamento persistente de projetos no MongoDB GridFS.
   Resolve o problema de filesystem efêmero no Render/Vercel.

   Rotas:
     POST   /api/projetos/upload-gridfs           → zip → memória → GridFS
     GET    /api/projetos/gridfs                   → lista projetos no GridFS
     GET    /api/projetos/gridfs/:nome             → árvore de arquivos
     GET    /api/projetos/gridfs/:nome/arquivo     → conteúdo de arquivo (?path=)
     DELETE /api/projetos/gridfs/:nome             → remove projeto do GridFS
══════════════════════════════════════════════════════════════ */

/* ── Bucket GridFS (lazy init) ───────────────────────────────── */
function gridBucket() {
  const db = mongoose.connection.db
  if (!db) throw new Error('MongoDB ainda não conectado.')
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'projetos_arquivos' })
}

async function gridUploadBuffer(bucket, filename, buffer, metadata) {
  // Remove versão anterior se existir
  try {
    const old = await bucket.find({ filename }).toArray()
    for (const f of old) await bucket.delete(f._id)
  } catch { /* ok */ }

  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, { metadata })
    stream.on('finish', resolve)
    stream.on('error', reject)
    stream.end(buffer)
  })
}

async function gridReadBuffer(bucket, filename) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const dl = bucket.openDownloadStreamByName(filename)
    dl.on('data', c => chunks.push(c))
    dl.on('end',  () => resolve(Buffer.concat(chunks)))
    dl.on('error', reject)
  })
}

function construirArvore(arquivos) {
  const raiz = { filhos: {}, arquivos: [] }
  for (const arq of arquivos) {
    const partes = arq.relPath.split('/')
    let no = raiz
    for (let i = 0; i < partes.length - 1; i++) {
      const p = partes[i]
      if (!no.filhos[p]) no.filhos[p] = { nome: p, filhos: {}, arquivos: [] }
      no = no.filhos[p]
    }
    no.arquivos.push({ nome: partes[partes.length - 1], relPath: arq.relPath, tamanho: arq.tamanho })
  }
  function serial(no) {
    return {
      pastas:   Object.values(no.filhos).map(f => ({ nome: f.nome, ...serial(f) })).sort((a, b) => a.nome.localeCompare(b.nome)),
      arquivos: no.arquivos.sort((a, b) => a.nome.localeCompare(b.nome)),
    }
  }
  return serial(raiz)
}

const EXTS_BINARIAS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','tiff',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'zip','tar','gz','bz2','xz','7z','rar',
  'exe','dll','so','dylib','wasm','bin','dat',
  'mp3','mp4','mov','avi','wav','ogg','flac',
  'ttf','otf','woff','woff2','eot',
  'db','sqlite','sqlite3',
])

/* ── GridFS Upload Jobs (assíncrono, igual ao R2) ─────────────── */
const gridfsJobs = new Map()  // jobId → { status, fase, enviados, total, erros, emitter }

function criarGridFSJob(jobId, total) {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(5)
  const job = { jobId, status: 'running', fase: 'iniciando', enviados: 0, total, erros: [], msg: null, emitter }
  gridfsJobs.set(jobId, job)
  setTimeout(() => gridfsJobs.delete(jobId), 30 * 60 * 1000)
  return job
}

/* ── GET /upload-gridfs/status/:jobId — polling ───────────────── */
router.get('/upload-gridfs/status/:jobId', autenticar, (req, res) => {
  const job = gridfsJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ erro: 'Job não encontrado ou expirado.' })
  res.json({
    status:   job.status,
    fase:     job.fase,
    enviados: job.enviados,
    total:    job.total,
    msg:      job.msg,
    erros:    job.erros.length ? job.erros.slice(0, 10) : undefined,
  })
})

/* ── Processamento assíncrono do GridFS ───────────────────────── */
async function processarGridFS({ jobId, nomeProjeto, entries, substituir, zipPath }) {
  const job = gridfsJobs.get(jobId)
  if (!job) return

  function progresso(fase, msg = null) {
    job.fase = fase
    job.msg  = msg
    job.emitter.emit('progress', { fase, enviados: job.enviados, total: job.total, msg })
  }

  try {
    const bucket = gridBucket()

    // ── Fase 1: limpar arquivos antigos ──────────────────────
    if (substituir) {
      progresso('limpando_antigos', 'Removendo versão anterior do GridFS…')
      const existentes = await bucket.find({ 'metadata.projetoNome': nomeProjeto }).toArray()
      for (const f of existentes) await bucket.delete(f._id)
    }

    // ── Fase 2: extrair ZIP ──────────────────────────────────
    progresso('extraindo', `Extraindo ${entries.length} arquivo${entries.length !== 1 ? 's' : ''} do ZIP…`)

    // ── Fase 3: upload lote a lote para GridFS ───────────────
    const BATCH = 8
    for (let i = 0; i < entries.length; i += BATCH) {
      const lote = entries.slice(i, i + BATCH)
      await Promise.all(lote.map(async ({ relPath, entry }) => {
        try {
          // Lê somente o lote atual: evita manter o ZIP inteiro na RAM.
          const buffer = await entry.buffer()
          await gridUploadBuffer(
            bucket,
            `${nomeProjeto}/${relPath}`,
            buffer,
            { projetoNome: nomeProjeto, relPath, tamanho: buffer.length, uploadedAt: new Date() }
          )
          job.enviados++
        } catch (e) {
          job.erros.push(`${relPath}: ${e.message}`)
        }
      }))
      progresso('enviando', `Salvando no GridFS: ${job.enviados} / ${job.total} arquivo${job.total !== 1 ? 's' : ''}…`)
    }

    // ── Fase 4: upsert metadados ─────────────────────────────
    progresso('finalizando', 'Salvando metadados do projeto…')
    await Projeto.findOneAndUpdate(
      { nome: nomeProjeto },
      { $set: {
        nome: nomeProjeto,
        caminho: `gridfs:${nomeProjeto}`,
        'metadados.gridfs':        true,
        'metadados.totalArquivos': job.enviados,
        'metadados.ultimoUpload':  new Date(),
      }},
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch(() => null)

    deleteTempFile(zipPath)

    job.status = 'done'
    job.emitter.emit('done', {
      status:     'done',
      enviados:   job.enviados,
      total:      job.total,
      nomeProjeto,
      erros:      job.erros.length ? job.erros.slice(0, 10) : undefined,
      mensagem:   `"${nomeProjeto}" salvo no GridFS: ${job.enviados}/${job.total} arquivos.`,
    })
  } catch (err) {
    deleteTempFile(zipPath)
    job.status = 'error'
    job.emitter.emit('done', { status: 'error', msg: err.message || 'Erro interno ao processar o ZIP.', enviados: job.enviados, total: job.total })
  }
}

/* ── POST /upload-gridfs ─────────────────────────────────────── */
router.post('/upload-gridfs', autenticar, upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo ZIP enviado.' })

  let nomeProjeto = (req.body.nomeProjeto || req.file.originalname.replace(/\.zip$/i, '') || 'projeto')
    .toString().trim()
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(nomeProjeto))
    return res.status(400).json({ erro: 'Nome inválido. Use letras, números, ., - ou _ (máx. 60 chars).' })

  const substituir = req.body.substituir === 'true'
  const zipPath    = req.file.path

  try {
    const bucket = gridBucket()

    if (!substituir) {
      const existentes = await bucket.find({ 'metadata.projetoNome': nomeProjeto }).limit(1).toArray()
      if (existentes.length > 0)
        return res.status(409).json({
          erro: `Já existe um projeto "${nomeProjeto}" no GridFS. Marque "Substituir" para sobrescrever.`,
        })
    }

    // Lê apenas o diretório central do ZIP. Os conteúdos são carregados em
    // lotes durante o job, reduzindo uso de memória e o tempo até a resposta.
    const { default: unzipper } = await import('unzipper')
    const directory = await unzipper.Open.file(zipPath)
    const fileEntries = directory.files.filter(entry => entry.type !== 'Directory')

    let prefixo = ''
    if (fileEntries.length) {
      const primeiro = fileEntries[0].path
      const slash = primeiro.indexOf('/')
      if (slash > 0 && !primeiro.includes('..')) prefixo = primeiro.slice(0, slash + 1)
    }

    const entries = fileEntries
      .map(entry => {
        const relPath = prefixo && entry.path.startsWith(prefixo)
          ? entry.path.slice(prefixo.length)
          : entry.path
        return { relPath, entry }
      })
      .filter(({ relPath }) => relPath && !relPath.startsWith('..') && !path.isAbsolute(relPath))

    const jobId = crypto.randomUUID()
    criarGridFSJob(jobId, entries.length)

    // Responde imediatamente com o jobId — frontend faz polling
    res.json({ jobId, total: entries.length, nomeProjeto })

    // Processa em background
    processarGridFS({ jobId, nomeProjeto, entries, substituir, zipPath })

  } catch (err) {
    deleteTempFile(zipPath)
    res.status(500).json({ erro: err.message || 'Erro ao processar o ZIP.' })
  }
})

/* ── GET /gridfs ─────────────────────────────────────────────── */
router.get('/gridfs', autenticar, async (req, res) => {
  try {
    const bucket = gridBucket()
    const files  = await bucket.find({}).toArray()

    const map = new Map()
    for (const f of files) {
      const nome = f.metadata?.projetoNome || 'desconhecido'
      if (!map.has(nome)) map.set(nome, { nome, totalArquivos: 0, tamanhoTotal: 0, ultimoUpload: null })
      const p = map.get(nome)
      p.totalArquivos++
      p.tamanhoTotal += f.length
      if (!p.ultimoUpload || f.uploadDate > p.ultimoUpload) p.ultimoUpload = f.uploadDate
    }

    const projetos = [...map.values()].sort((a, b) => new Date(b.ultimoUpload) - new Date(a.ultimoUpload))
    res.json({ projetos, total: projetos.length })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* ── GET /gridfs/:nome — árvore de arquivos ──────────────────── */
router.get('/gridfs/:nome', autenticar, async (req, res) => {
  const { nome } = req.params
  if (!nomeValido(nome)) return res.status(400).json({ erro: 'Nome inválido.' })

  try {
    const bucket = gridBucket()
    const files  = await bucket.find({ 'metadata.projetoNome': nome }).toArray()
    if (!files.length) return res.status(404).json({ erro: `Projeto "${nome}" não encontrado no GridFS.` })

    const arvore = construirArvore(files.map(f => ({
      relPath:  f.metadata?.relPath || f.filename.replace(`${nome}/`, ''),
      tamanho:  f.length,
    })))

    res.json({
      nome,
      totalArquivos: files.length,
      tamanhoTotal:  files.reduce((s, f) => s + f.length, 0),
      ultimoUpload:  files.reduce((mx, f) => f.uploadDate > mx ? f.uploadDate : mx, files[0].uploadDate),
      arvore,
    })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* ── GET /gridfs/:nome/arquivo — conteúdo de arquivo (?path=) ── */
router.get('/gridfs/:nome/arquivo', autenticar, async (req, res) => {
  const { nome }    = req.params
  const filePath    = req.query.path
  if (!nomeValido(nome)) return res.status(400).json({ erro: 'Nome inválido.' })
  if (!filePath)          return res.status(400).json({ erro: 'Parâmetro ?path= obrigatório.' })
  if (filePath.includes('..') || path.isAbsolute(filePath))
    return res.status(400).json({ erro: 'Path inválido.' })

  try {
    const bucket   = gridBucket()
    const filename = `${nome}/${filePath}`
    const files    = await bucket.find({ filename }).toArray()
    if (!files.length) return res.status(404).json({ erro: 'Arquivo não encontrado.' })

    const ext = (filePath.split('.').pop() || '').toLowerCase()
    if (EXTS_BINARIAS.has(ext)) {
      return res.json({ binario: true, tamanho: files[0].length, ext, relPath: filePath })
    }

    const buffer  = await gridReadBuffer(bucket, filename)
    const conteudo = buffer.toString('utf8')
    res.json({
      binario:  false,
      conteudo,
      tamanho:  files[0].length,
      ext,
      relPath:  filePath,
      linhas:   conteudo.split('\n').length,
    })
  } catch (err) {
    const is404 = err.message?.includes('FileNotFound') ||
                  err.message?.includes('file with name') ||
                  err.code === 'ENOENT'
    res.status(is404 ? 404 : 500).json({ erro: err.message })
  }
})

/* ── GET /gridfs/:nome/download — exporta todos os arquivos como .zip ── */
router.get('/gridfs/:nome/download', autenticar, async (req, res) => {
  const { nome } = req.params
  if (!nomeValido(nome)) return res.status(400).json({ erro: 'Nome inválido.' })

  try {
    const { default: JSZip } = await import('jszip')
    const bucket  = gridBucket()
    const files   = await bucket.find({ 'metadata.projetoNome': nome }).toArray()
    if (!files.length) return res.status(404).json({ erro: `Projeto "${nome}" não encontrado no GridFS.` })

    const zip = new JSZip()
    const pasta = zip.folder(nome)

    for (const f of files) {
      const relPath = f.metadata?.relPath || f.filename.replace(`${nome}/`, '')
      if (!relPath || relPath.startsWith('..')) continue
      const buffer = await gridReadBuffer(bucket, f.filename)
      pasta.file(relPath, buffer)
    }

    const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.zip"`)
    res.setHeader('Content-Length', content.length)
    res.send(content)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* ── DELETE /gridfs/:nome — narração SSE ao vivo ─────────── */
router.delete('/gridfs/:nome', autenticar, async (req, res) => {
  const { nome } = req.params
  if (!nomeValido(nome)) return res.status(400).json({ erro: 'Nome inválido.' })

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  function sse(tipo, payload) {
    try { res.write(`data: ${JSON.stringify({ tipo, ts: Date.now(), ...payload })}\n\n`) } catch {}
  }
  function narrar(msg, nivel = 'info') { sse('narration', { msg, nivel }) }
  function done(status, extra = {})    { sse('done', { status, ...extra }); res.end() }

  try {
    const bucket = gridBucket()
    const files  = await bucket.find({ 'metadata.projetoNome': nome }).toArray()

    if (!files.length) {
      narrar(`Projeto "${nome}" não encontrado no GridFS.`, 'error')
      return done('error', { msg: `Projeto "${nome}" não existe.` })
    }

    narrar(`Iniciando remoção de "${nome}" — ${files.length} arquivo(s) a deletar`)

    // Deleção em lotes paralelos de 20 (evita sobrecarregar o MongoDB)
    const BATCH = 20
    let removidos = 0
    for (let i = 0; i < files.length; i += BATCH) {
      const lote = files.slice(i, i + BATCH)
      const resultados = await Promise.allSettled(lote.map(f => bucket.delete(f._id)))
      resultados.forEach((r, j) => {
        const f       = lote[j]
        const relPath = f.metadata?.relPath || f.filename?.replace(`${nome}/`, '') || f.filename
        if (r.status === 'fulfilled') {
          removidos++
          narrar(`🗑 ${relPath} (${(f.length / 1024).toFixed(1)} KB)`)
        } else {
          narrar(`✗ Falha: ${relPath} — ${r.reason?.message}`, 'error')
        }
      })
      // Progresso por lote
      const pct = Math.round((Math.min(i + BATCH, files.length) / files.length) * 100)
      sse('progress', { removidos, total: files.length, pct })
    }

    await Projeto.findOneAndDelete({ nome, caminho: `gridfs:${nome}` }).catch(() => null)

    narrar(`Metadados do projeto removidos do banco de dados`)
    narrar(`Remoção concluída: ${removidos}/${files.length} arquivo(s) deletados`, 'success')

    done('success', { removidos, total: files.length })
  } catch (err) {
    narrar(`Erro crítico: ${err.message}`, 'error')
    done('error', { msg: err.message })
  }
})

/* GET /api/projetos */
router.get('/', autenticar, async (req, res) => {
  if (!fs.existsSync(PROJETOS_DIR)) {
    return res.json({
      projetos:  [],
      total:     0,
      diretorio: path.join('projetos'),
      aviso:     `Diretório "projetos/" não encontrado na raiz do projeto. Crie-o com: mkdir -p projetos`,
    })
  }

  try {
    const entradas = fs.readdirSync(PROJETOS_DIR, { withFileTypes: true })
    const dirs     = entradas.filter(e => e.isDirectory() && !e.name.startsWith('.'))

    const projetos = dirs.map(d => {
      const dirPath = path.join(PROJETOS_DIR, d.name)
      try {
        return lerProjeto(d.name, dirPath)
      } catch {
        return {
          nome:            d.name,
          caminho:         path.join('projetos', d.name),
          descricao:       '—',
          status:          'desconhecido',
          tecnologias:     [],
          ultimaAlteracao: null,
          package:         null,
        }
      }
    })

    projetos.sort((a, b) => {
      const ordem = { ativo: 0, pausado: 1, arquivado: 2, desconhecido: 3 }
      const diff  = (ordem[a.status] || 3) - (ordem[b.status] || 3)
      if (diff !== 0) return diff
      return (b.ultimaAlteracao?.getTime() || 0) - (a.ultimaAlteracao?.getTime() || 0)
    })

    // Enriquece com metadados do MongoDB (último commit, branch, etc.)
    try {
      const nomes = projetos.map(p => p.nome)
      const docs  = await Projeto.find({ nome: { $in: nomes } })
        .select('nome metadados')
        .lean()
      const mapaDoc = Object.fromEntries(docs.map(d => [d.nome, d.metadados || {}]))
      for (const p of projetos) {
        const m = mapaDoc[p.nome]
        if (m) {
          p.metadados = {
            ultimoCommitSha:      m.ultimoCommitSha      || null,
            ultimoCommitData:     m.ultimoCommitData     || null,
            ultimoCommitMensagem: m.ultimoCommitMensagem || null,
            ultimoCommitBranch:   m.ultimoCommitBranch   || null,
            ultimoCommitAutor:    m.ultimoCommitAutor    || null,
          }
        }
      }
    } catch { /* enriquecimento opcional — não falha a listagem */ }

    res.json({ projetos, total: projetos.length, diretorio: path.join('projetos') })
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao ler diretório de projetos.', detalhe: err.message })
  }
})

/* ══════════════════════════════════════════════════════════════
   CLOUDFLARE R2 — Sprint 12 — Listagem de Projetos no Bucket
   GET  /api/projetos/r2          → lista projetos (prefixes) no bucket
   GET  /api/projetos/r2/:nome    → lista arquivos de um projeto
═══════════════════════════════════════════════════════════════ */

function r2Headers() {
  return { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` }
}

/** Cria um S3Client apontado para o R2 (S3-compatible API) */
function r2S3Client() {
  const accountId       = process.env.CF_ACCOUNT_ID
  const accessKeyId     = process.env.CF_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY
  return new S3Client({
    region:   'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

/* ── GET /r2 ─────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════
   GITHUB STATUS — Sprint 13
   GET /api/projetos/github-status?nome=:nome&uploadedAt=:iso
   Compara a data do último commit no GitHub com a data do deploy
   no R2 ou GridFS para exibir se o projeto está sincronizado.
══════════════════════════════════════════════════════════════ */
router.get('/github-status', autenticar, async (req, res) => {
  try {
    const { nome, uploadedAt } = req.query
    if (!nome) return res.status(400).json({ erro: 'nome é obrigatório.' })

    const doc   = await Projeto.findOne({ nome }).lean().catch(() => null)
    const owner = doc?.metadados?.githubOwner
    const repo  = doc?.metadados?.githubRepo

    if (!owner || !repo)
      return res.json({ status: 'sem_vinculo', nome })

    const { value: ghToken } = await getCredential('github', 'GITHUB_TOKEN')
    if (!ghToken)
      return res.json({ status: 'sem_token', nome })

    const commits = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
      { headers: { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'alsistemas-backend' } }
    ).then(r => r.ok ? r.json() : []).catch(() => [])

    if (!Array.isArray(commits) || !commits[0])
      return res.json({ status: 'sem_dados', nome, repoUrl: `https://github.com/${owner}/${repo}` })

    const c           = commits[0]
    const githubDate  = new Date(c.commit.committer.date)
    const deployDate  = uploadedAt ? new Date(uploadedAt) : null

    let status = 'sem_dados'
    let diffMs = 0
    if (deployDate && !isNaN(deployDate)) {
      diffMs = githubDate - deployDate   // + → GitHub é mais novo; - → deploy é mais novo
      if (Math.abs(diffMs) < 10 * 60 * 1000) status = 'em_dia'          // ±10 min → em dia
      else if (diffMs > 0)                    status = 'github_frente'   // GitHub mais novo
      else                                    status = 'deploy_frente'   // Deploy mais novo
    }

    res.json({
      status, nome,
      githubDate:  githubDate.toISOString(),
      deployDate:  deployDate?.toISOString() || null,
      diffMin:     Math.round(diffMs / 60_000),
      repoUrl:     `https://github.com/${owner}/${repo}`,
      latestCommit: {
        sha:     c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0].slice(0, 80),
        author:  c.commit.committer.name,
        date:    c.commit.committer.date,
      },
    })
  } catch (err) {
    res.json({ status: 'erro', erro: err.message })
  }
})

/* ══════════════════════════════════════════════════════════════
   R2 UPLOAD PROGRESS — SSE
   GET /api/projetos/upload-r2/progress/:jobId
   Acompanha o progresso de um upload R2 em andamento.
══════════════════════════════════════════════════════════════ */
router.get('/upload-r2/progress/:jobId', autenticar, (req, res) => {
  const job = r2UploadJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ erro: 'Job não encontrado ou expirado.' })

  res.setHeader('Content-Type',             'text/event-stream')
  res.setHeader('Cache-Control',            'no-cache, no-transform')
  res.setHeader('Connection',               'keep-alive')
  res.setHeader('X-Accel-Buffering',        'no')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.flushHeaders()

  function emit(obj) {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ ...obj, ts: new Date().toISOString() })}\n\n`)
  }

  // Estado atual imediato (caso já tenha terminado antes de conectar)
  emit({ type: 'progress', enviados: job.enviados, total: job.total, nomeProjeto: job.nomeProjeto, fase: job.fase || 'enviando' })
  if (job.status !== 'processando') {
    emit({ type: 'done', status: job.status, enviados: job.enviados, total: job.total, erros: job.erros.slice(0, 10) })
    return res.end()
  }

  function onProgress(d) { emit({ type: 'progress', ...d }) }
  function onDone(d)     { emit({ type: 'done',     ...d }); if (!res.writableEnded) res.end() }

  job.emitter.on('progress', onProgress)
  job.emitter.on('done',     onDone)

  const ping = setInterval(() => { if (!res.writableEnded) emit({ type: 'ping' }) }, 20_000)

  req.on('close', () => {
    clearInterval(ping)
    job.emitter.off('progress', onProgress)
    job.emitter.off('done',     onDone)
  })
})

/* ══════════════════════════════════════════════════════════════
   R2 HEALTH CHECK — Sprint 13
   GET /api/projetos/r2/health
   Verifica credenciais, acessa o bucket e retorna métricas reais.
══════════════════════════════════════════════════════════════ */
/* ── GET /upload-r2/status/:jobId — polling (fallback ao SSE) ── */
router.get('/upload-r2/status/:jobId', autenticar, (req, res) => {
  const job = r2UploadJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ erro: 'Job não encontrado ou expirado.' })
  res.json({
    jobId:      job.jobId,
    status:     job.status,       // 'processando' | 'done' | 'error'
    fase:       job.fase || 'aguardando',
    enviados:   job.enviados,
    total:      job.total,
    nomeProjeto: job.nomeProjeto,
    erros:      job.erros.slice(0, 5),
    msg:        job.msg || null,
  })
})

router.get('/r2/health', autenticar, async (_req, res) => {
  const accountId = process.env.CF_ACCOUNT_ID
  const bucket    = process.env.CF_R2_BUCKET
  const token     = process.env.CF_API_TOKEN
  const publicUrl = process.env.CF_R2_PUBLIC_URL || null

  // ── 1. Verificar variáveis de ambiente ───────────────────────
  const faltando = []
  if (!accountId) faltando.push('CF_ACCOUNT_ID')
  if (!token)     faltando.push('CF_API_TOKEN')
  if (!bucket)    faltando.push('CF_R2_BUCKET')

  if (faltando.length > 0) {
    return res.json({
      ok: false, etapa: 'env',
      erro: `Variáveis não configuradas: ${faltando.join(', ')}`,
      faltando,
      accountId: accountId ? `${accountId.slice(0, 6)}…` : null,
      bucket: bucket || null,
      publicUrl,
    })
  }

  const CF_BASE = 'https://api.cloudflare.com/client/v4'
  const headers = { 'Authorization': `Bearer ${token}` }

  // ── 2. Verificar se o token é válido (endpoint /user/tokens/verify) ──
  let tokenOk = false
  try {
    const vResp = await fetch(`${CF_BASE}/user/tokens/verify`, { headers })
    tokenOk = vResp.ok
    if (!vResp.ok) {
      const txt = await vResp.text().catch(() => '')
      return res.json({
        ok: false, etapa: 'token',
        erro: `Token inválido ou expirado (HTTP ${vResp.status})`,
        detalhe: txt.slice(0, 120),
        accountId: `${accountId.slice(0, 6)}…`, bucket, publicUrl,
      })
    }
  } catch (e) {
    return res.json({ ok: false, etapa: 'token', erro: `Falha ao verificar token: ${e.message}`, bucket, publicUrl })
  }

  // ── 3. Verificar se o bucket existe e obter detalhes ─────────
  let bucketInfo = null
  try {
    const bResp = await fetch(`${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}`, { headers })
    if (!bResp.ok) {
      const txt = await bResp.text().catch(() => '')
      return res.json({
        ok: false, etapa: 'bucket',
        erro: `Bucket "${bucket}" não encontrado ou sem permissão (HTTP ${bResp.status})`,
        detalhe: txt.slice(0, 120),
        tokenOk, accountId: `${accountId.slice(0, 6)}…`, bucket, publicUrl,
      })
    }
    const bData = await bResp.json()
    bucketInfo  = bData.result ?? {}
  } catch (e) {
    return res.json({ ok: false, etapa: 'bucket', erro: `Falha ao acessar bucket: ${e.message}`, bucket, publicUrl })
  }

  // ── 4. Listar objetos para obter métricas reais ───────────────
  let totalObjetos = 0, tamanhoTotal = 0, prefixos = [], truncado = false
  try {
    const lResp = await fetch(
      `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000`,
      { headers }
    )
    if (lResp.ok) {
      const lData    = await lResp.json()
      const objetos  = lData.result?.objects ?? []
      truncado       = lData.result?.truncated ?? false
      totalObjetos   = objetos.length
      tamanhoTotal   = objetos.reduce((s, o) => s + (o.size || 0), 0)

      // Coleta prefixos (pastas de projeto)
      const prefMap = new Map()
      for (const obj of objetos) {
        const key  = obj.key.replace(/%2F/gi, '/')
        const sep  = key.indexOf('/')
        const nome = sep > 0 ? key.slice(0, sep) : key
        if (!prefMap.has(nome)) prefMap.set(nome, { nome, arquivos: 0, tamanho: 0 })
        const p = prefMap.get(nome)
        p.arquivos++
        p.tamanho += obj.size || 0
      }
      prefixos = [...prefMap.values()].sort((a, b) => a.nome.localeCompare(b.nome))
    }
  } catch { /* métricas opcionais — não falha */ }

  // ── 5. Testar escrita (PUT objeto de teste) e leitura/delete ──
  let escritaOk = false, leituraOk = false
  const testKey = `__health-check-${Date.now()}.txt`
  try {
    const putResp = await fetch(
      `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects/${testKey}`,
      { method: 'PUT', headers: { ...headers, 'Content-Type': 'text/plain' }, body: 'ok' }
    )
    escritaOk = putResp.ok

    if (escritaOk) {
      const getResp = await fetch(
        `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects/${testKey}`,
        { headers }
      )
      leituraOk = getResp.ok
      // Limpa o objeto de teste
      await fetch(
        `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects/${testKey}`,
        { method: 'DELETE', headers }
      ).catch(() => null)
    }
  } catch { /* testes de escrita opcionais */ }

  res.json({
    ok: true,
    tokenOk,
    escritaOk,
    leituraOk,
    accountId:    `${accountId.slice(0, 6)}…${accountId.slice(-4)}`,
    bucket,
    publicUrl,
    regiao:       bucketInfo.location ?? bucketInfo.locationHint ?? 'automático',
    criado:       bucketInfo.creation_date ?? null,
    totalObjetos: truncado ? `${totalObjetos}+` : totalObjetos,
    tamanhoTotal,
    truncado,
    prefixos,     // pastas/projetos no bucket
    checadoEm:    new Date().toISOString(),
  })
})

router.get('/r2', autenticar, async (_req, res, next) => {
  try {
    const accountId = process.env.CF_ACCOUNT_ID
    const bucket    = process.env.CF_R2_BUCKET
    const token     = process.env.CF_API_TOKEN

    if (!accountId || !bucket || !token) {
      return res.json({
        projetos: [], bucket: null, total: 0,
        aviso: 'CF_ACCOUNT_ID, CF_API_TOKEN e CF_R2_BUCKET não configurados.',
      })
    }

    const CF_BASE = 'https://api.cloudflare.com/client/v4'
    const resp = await fetch(
      `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000`,
      { headers: r2Headers() }
    )
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return res.json({ projetos: [], bucket, total: 0, aviso: `R2 ${resp.status}: ${txt.slice(0, 120)}` })
    }
    const data    = await resp.json()
    const objetos = data.result?.objects     ?? []
    const truncado = data.result?.truncated  ?? false

    // Agrupa por primeiro segmento do path (nome do projeto)
    // Normaliza %2F → / para tratar uploads antigos com chaves mal-codificadas
    const map = new Map()
    for (const obj of objetos) {
      const normalKey = obj.key.replace(/%2F/gi, '/')
      const sep  = normalKey.indexOf('/')
      const nome = sep > 0 ? normalKey.slice(0, sep) : normalKey
      if (!map.has(nome)) map.set(nome, { nome, totalArquivos: 0, tamanhoTotal: 0, ultimaModificacao: null })
      const p = map.get(nome)
      p.totalArquivos++
      p.tamanhoTotal += obj.size || 0
      if (!p.ultimaModificacao || obj.uploaded > p.ultimaModificacao) p.ultimaModificacao = obj.uploaded
    }

    const projetos = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome))
    res.json({
      projetos, bucket, total: projetos.length,
      aviso: truncado ? 'Bucket tem mais de 1000 objetos — listagem pode estar incompleta.' : undefined,
    })
  } catch (err) { next(err) }
})

/* ── GET /r2/:nome ───────────────────────────────────────── */
router.get('/r2/:nome', autenticar, async (req, res, next) => {
  try {
    const { nome }  = req.params
    const accountId = process.env.CF_ACCOUNT_ID
    const bucket    = process.env.CF_R2_BUCKET
    const token     = process.env.CF_API_TOKEN

    if (!accountId || !bucket || !token)
      return res.status(500).json({ erro: 'CF_ACCOUNT_ID, CF_API_TOKEN e CF_R2_BUCKET não configurados.' })

    const CF_BASE = 'https://api.cloudflare.com/client/v4'
    // Busca com prefixo normal E com prefixo codificado (compatibilidade com uploads antigos)
    const encodedPrefix = encodeURIComponent(nome) + '%2F'
    const [respNormal, respEncoded] = await Promise.all([
      fetch(`${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?${new URLSearchParams({ prefix: `${nome}/`, per_page: '1000' })}`, { headers: r2Headers() }),
      fetch(`${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?${new URLSearchParams({ prefix: encodedPrefix, per_page: '1000' })}`, { headers: r2Headers() }),
    ])
    if (!respNormal.ok) {
      const txt = await respNormal.text().catch(() => '')
      return res.status(502).json({ erro: `R2 ${respNormal.status}: ${txt.slice(0, 120)}` })
    }
    const dataNormal  = await respNormal.json()
    const dataEncoded = respEncoded.ok ? await respEncoded.json() : { result: { objects: [] } }

    const allObjects = [
      ...(dataNormal.result?.objects  ?? []),
      ...(dataEncoded.result?.objects ?? []),
    ]
    // Remove duplicatas por key
    const seen = new Set()
    const unique = allObjects.filter(o => { if (seen.has(o.key)) return false; seen.add(o.key); return true })
    const prefix  = `${nome}/`
    // Normaliza chaves com %2F de uploads antigos
    const arquivos = unique
      .map(obj => {
        const normalKey = obj.key.replace(/%2F/gi, '/')
        return {
          key:       obj.key,
          relPath:   normalKey.startsWith(prefix) ? normalKey.slice(prefix.length) : normalKey,
          tamanho:   obj.size      || 0,
          uploadedAt: obj.uploaded || null,
        }
      })
      .filter(a => a.relPath && a.relPath !== nome)
    const tamanhoTotal = arquivos.reduce((s, a) => s + a.tamanho, 0)
    res.json({ nome, bucket, arquivos, total: arquivos.length, tamanhoTotal })
  } catch (err) { next(err) }
})

/* ── DELETE /r2/:nome ────────────────────────────────────────── */
router.delete('/r2/:nome', autenticar, async (req, res, next) => {
  try {
    const { nome }  = req.params
    const accountId = process.env.CF_ACCOUNT_ID
    const bucket    = process.env.CF_R2_BUCKET
    const token     = process.env.CF_API_TOKEN

    if (!accountId || !bucket || !token)
      return res.status(500).json({ erro: 'CF_ACCOUNT_ID, CF_API_TOKEN e CF_R2_BUCKET não configurados.' })

    const CF_BASE   = 'https://api.cloudflare.com/client/v4'
    // Lista todos os objetos com o prefixo do projeto (normal + encoded)
    const prefixos  = [`${nome}/`, encodeURIComponent(nome) + '%2F']
    let   allKeys   = []

    for (const prefix of prefixos) {
      const listResp = await fetch(
        `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects?${new URLSearchParams({ prefix, per_page: '1000' })}`,
        { headers: r2Headers() }
      ).catch(() => null)
      if (listResp?.ok) {
        const data = await listResp.json().catch(() => ({}))
        for (const obj of (data.result?.objects ?? [])) {
          if (!allKeys.includes(obj.key)) allKeys.push(obj.key)
        }
      }
    }

    if (allKeys.length === 0)
      return res.status(404).json({ erro: `Projeto "${nome}" não encontrado no R2.` })

    // Deleta todos em lotes de 20
    const DEL_BATCH = 20
    let deletados = 0
    for (let i = 0; i < allKeys.length; i += DEL_BATCH) {
      await Promise.all(allKeys.slice(i, i + DEL_BATCH).map(async key => {
        const keyPath = key.split('/').map(encodeURIComponent).join('/')
        const delResp = await fetch(
          `${CF_BASE}/accounts/${accountId}/r2/buckets/${bucket}/objects/${keyPath}`,
          { method: 'DELETE', headers: r2Headers() }
        ).catch(() => null)
        if (delResp?.ok || delResp?.status === 204) deletados++
      }))
    }

    res.json({ ok: true, nome, deletados, mensagem: `Projeto "${nome}" removido do R2 (${deletados} arquivos).` })
  } catch (err) { next(err) }
})

/* GET /api/projetos/:nome */
router.get('/:nome', autenticar, (req, res) => {
  const { nome } = req.params

  if (nome.includes('..') || nome.includes('/') || nome.includes('\\')) {
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })
  }

  const dirPath = path.join(PROJETOS_DIR, nome)

  if (!fs.existsSync(dirPath)) {
    return res.status(404).json({ erro: `Projeto "${nome}" não encontrado.` })
  }

  try {
    const projeto  = lerProjeto(nome, dirPath)
    const arquivos = fs.readdirSync(dirPath, { withFileTypes: true })
      .map(e => ({ nome: e.name, tipo: e.isDirectory() ? 'dir' : 'arquivo' }))
      .slice(0, 50)

    res.json({ ...projeto, arquivos })
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao ler projeto.', detalhe: err.message })
  }
})

/* ══════════════════════════════════════════════════════════════
   GITHUB SYNC — Sprint 7 (ADIÇÃO PURA)
   Todas as rotas abaixo são novas. Nenhuma rota anterior foi
   modificada ou removida.
══════════════════════════════════════════════════════════════ */

/**
 * Sanitiza o nome de projeto para evitar path traversal.
 */
function nomeValido(nome) {
  return nome && !nome.includes('..') && !nome.includes('/') && !nome.includes('\\')
}

/**
 * Valida owner/repo do GitHub (apenas alfanuméricos, ponto, hífen, underscore).
 */
function repoValido(str) {
  return str && /^[a-zA-Z0-9._-]+$/.test(str)
}

/* ──────────────────────────────────────────────────────────────
   POST /api/projetos/:nome/vincular
   Body: { owner, repo }         → vincula ao repositório GitHub
   Body: { owner: null }         → desvincula (remove o link)

   Salva o vínculo em MongoDB no campo metadados do Model Projeto.
   Se o documento ainda não existir no Mongo, cria via upsert.
────────────────────────────────────────────────────────────── */
router.post('/:nome/vincular', autenticar, async (req, res) => {
  const { nome } = req.params

  if (!nomeValido(nome))
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })

  const { owner, repo } = req.body || {}

  // ── Desvincular ───────────────────────────────────────────
  if (!owner || !repo) {
    await Projeto.findOneAndUpdate(
      { nome },
      {
        $unset: {
          'metadados.githubOwner':          1,
          'metadados.githubRepo':           1,
          'metadados.vinculadoEm':          1,
          'metadados.ultimaSincronizacao':  1,
        },
      },
      { upsert: false }
    ).catch(() => null) // ignora se ainda não há doc no Mongo

    return res.json({ ok: true, vinculado: false })
  }

  // ── Validar formato owner/repo ────────────────────────────
  if (!repoValido(owner) || !repoValido(repo))
    return res.status(400).json({ erro: 'Owner ou repo inválido.' })

  // ── Verificar se o repositório existe no GitHub ───────────
  try {
    await githubFetch(`/repos/${owner}/${repo}`)
  } catch (err) {
    const status = err.status || 400
    const msg    = status === 404
      ? `Repositório "${owner}/${repo}" não encontrado no GitHub.`
      : err.message
    return res.status(status).json({ erro: msg })
  }

  // ── Salvar vínculo no MongoDB ─────────────────────────────
  await Projeto.findOneAndUpdate(
    { nome },
    {
      $set: {
        nome,
        caminho:                          `projetos/${nome}`,
        'metadados.githubOwner':          owner,
        'metadados.githubRepo':           repo,
        'metadados.vinculadoEm':          new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  res.json({ ok: true, vinculado: true, owner, repo })
})

/* ──────────────────────────────────────────────────────────────
   GET /api/projetos/:nome/sync-status
   Retorna o status de sincronização entre o projeto local e o
   repositório GitHub vinculado.
────────────────────────────────────────────────────────────── */
router.get('/:nome/sync-status', autenticar, async (req, res) => {
  const { nome } = req.params

  if (!nomeValido(nome))
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })

  const doc   = await Projeto.findOne({ nome }).lean().catch(() => null)
  const owner = doc?.metadados?.githubOwner
  const repo  = doc?.metadados?.githubRepo

  if (!owner || !repo) {
    return res.json({ vinculado: false })
  }

  const dirPath = path.join(PROJETOS_DIR, nome)
  let dataLocalModificacao = null
  if (fs.existsSync(dirPath)) {
    dataLocalModificacao = fs.statSync(dirPath).mtime
  }

  try {
    const repoData       = await githubFetch(`/repos/${owner}/${repo}`)
    const dataPushGitHub = new Date(repoData.pushed_at)

    let statusSync = 'desconhecido'
    if (dataLocalModificacao) {
      const margemMs       = 60 * 1000
      const ultimaSync     = doc?.metadados?.ultimaSincronizacao
        ? new Date(doc.metadados.ultimaSincronizacao)
        : null

      // Se há registro de sincronização manual mais recente que o último push → atualizado
      if (ultimaSync && ultimaSync >= dataPushGitHub) {
        statusSync = 'atualizado'
      } else {
        statusSync = dataPushGitHub > new Date(dataLocalModificacao.getTime() + margemMs)
          ? 'desatualizado'
          : 'atualizado'
      }
    }

    return res.json({
      vinculado:             true,
      owner,
      repo,
      nomeCompleto:          repoData.full_name,
      url:                   repoData.html_url,
      branch:                repoData.default_branch,
      descricaoGitHub:       repoData.description || null,
      linguagem:             repoData.language     || null,
      stars:                 repoData.stargazers_count,
      dataPushGitHub:        repoData.pushed_at,
      dataLocalModificacao,
      ultimaSincronizacao:   doc?.metadados?.ultimaSincronizacao || null,
      vinculadoEm:           doc?.metadados?.vinculadoEm         || null,
      statusSync,
    })
  } catch (err) {
    return res.status(err.status || 500).json({
      vinculado: true,
      owner,
      repo,
      erro: err.message,
      statusSync: 'desconhecido',
    })
  }
})

/* ──────────────────────────────────────────────────────────────
   POST /api/projetos/:nome/registrar-sincronizacao
   Chamado pelo frontend após uma sincronização bem-sucedida.
────────────────────────────────────────────────────────────── */
router.post('/:nome/registrar-sincronizacao', autenticar, async (req, res) => {
  const { nome } = req.params

  if (!nomeValido(nome))
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })

  await Projeto.findOneAndUpdate(
    { nome },
    { $set: { 'metadados.ultimaSincronizacao': new Date() } },
    { upsert: false }
  ).catch(() => null)

  res.json({ ok: true, ultimaSincronizacao: new Date() })
})

/* ══════════════════════════════════════════════════════════════
   SPRINT 8 — NARRAÇÃO EM TEMPO REAL (SSE)
   ADIÇÃO PURA. Nenhuma rota anterior foi modificada.
══════════════════════════════════════════════════════════════ */

/**
 * Auxiliar: pausa assíncrona (apenas para dar tempo visual à narração)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Auxiliar: conta arquivos recursivamente (máx. profundidade 6)
 */
function contarArquivosDir(dir, depth = 0) {
  if (depth > 6) return 0
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    let count = 0
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) count += contarArquivosDir(path.join(dir, e.name), depth + 1)
      else count++
    }
    return count
  } catch { return 0 }
}

/* ──────────────────────────────────────────────────────────────
   GET /api/projetos/:nome/sync-stream
   ──────────────────────────────────────────────────────────────
   SSE endpoint que narra o processo completo de sincronização
   com o GitHub em tempo real.

   Protocolo de eventos (cada linha no formato SSE padrão):
     data: <JSON>\n\n

   Tipos de evento JSON:
     { type:'narration', msg:string, nivel:'info'|'warn'|'error'|'success', ts }
     { type:'step',      etapa:string, progresso:number(0-100), ts }
     { type:'files',     arquivos:string[] }
     { type:'ping' }
     { type:'done',      status:'success'|'error'|'inconsistent', msg, relatorio?, ts }

   Regra de consistência:
     O evento 'done' com status:'success' SÓ é emitido após a
     validação remota confirmar que o estado do GitHub corresponde
     ao que foi baixado. Caso contrário, emite status:'inconsistent'.
────────────────────────────────────────────────────────────── */
router.get('/:nome/sync-stream', autenticar, async (req, res) => {
  /* ── Cabeçalhos SSE ──────────────────────────────────────── */
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')     // Nginx: desliga buffer
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.flushHeaders()

  let encerrado = false

  /* ── Helpers de emissão ──────────────────────────────────── */
  function emit(obj) {
    if (encerrado || res.writableEnded) return
    res.write(`data: ${JSON.stringify({ ...obj, ts: new Date().toISOString() })}\n\n`)
  }

  function narrar(msg, nivel = 'info') {
    emit({ type: 'narration', msg, nivel })
  }

  function step(etapa, progresso) {
    emit({ type: 'step', etapa, progresso })
  }

  function files(arquivos) {
    emit({ type: 'files', arquivos })
  }

  function done(status, extra = {}) {
    emit({ type: 'done', status, ...extra })
    encerrado = true
    if (!res.writableEnded) res.end()
  }

  /* ── Keep-alive: ping a cada 20s para evitar timeout ────── */
  const pingInterval = setInterval(() => {
    if (!encerrado && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
    } else {
      clearInterval(pingInterval)
    }
  }, 20_000)

  /* ── Limpeza ao desconectar ──────────────────────────────── */
  req.on('close', () => {
    encerrado = true
    clearInterval(pingInterval)
  })

  /* ════════════════════════════════════════════════════════════
     PIPELINE DE SINCRONIZAÇÃO NARRADO
  ════════════════════════════════════════════════════════════ */
  const { nome } = req.params

  try {
    /* ── ETAPA 1: Verificar vínculo ────────────────────────── */
    step('verificando_vinculo', 5)
    narrar(`Iniciando sincronização do projeto "${nome}"`)

    if (!nomeValido(nome)) {
      narrar('Nome de projeto inválido.', 'error')
      return done('error', { msg: 'Nome de projeto inválido.' })
    }

    await sleep(250)

    const doc   = await Projeto.findOne({ nome }).lean().catch(() => null)
    const owner = doc?.metadados?.githubOwner
    const repo  = doc?.metadados?.githubRepo

    if (!owner || !repo) {
      narrar('Projeto não possui repositório GitHub vinculado.', 'error')
      return done('error', { msg: 'Sem repositório vinculado.' })
    }

    narrar(`Repositório vinculado: ${owner}/${repo}`)

    /* ── ETAPA 2: Consultar GitHub (estado ANTES do sync) ──── */
    step('verificando_github', 12)
    narrar('Consultando estado atual do repositório no GitHub...')

    const { value: token } = await getCredential('github', 'GITHUB_TOKEN')
    if (!token) {
      narrar('GITHUB_TOKEN não configurado no servidor.', 'error')
      return done('error', { msg: 'GITHUB_TOKEN ausente no servidor.' })
    }

    let repoDataAntes
    try {
      repoDataAntes = await githubFetch(`/repos/${owner}/${repo}`)
    } catch (err) {
      narrar(`Erro ao consultar GitHub: ${err.message}`, 'error')
      return done('error', { msg: `GitHub inacessível: ${err.message}` })
    }

    const defaultBranch  = repoDataAntes.default_branch || 'main'
    const pushedAtAntes  = repoDataAntes.pushed_at
    narrar(`Repositório encontrado: ${repoDataAntes.full_name}`)
    narrar(`Branch padrão: ${defaultBranch} · último push: ${new Date(pushedAtAntes).toLocaleString('pt-BR')}`)

    /* ── ETAPA 3: Analisar estado local ────────────────────── */
    step('analisando_local', 22)
    narrar('Detectando alterações no projeto local...')
    await sleep(300)

    const dirPath = path.join(PROJETOS_DIR, nome)
    let totalArquivosLocal = 0
    let dataLocalModificacao = null

    if (fs.existsSync(dirPath)) {
      try { dataLocalModificacao = fs.statSync(dirPath).mtime } catch { /* ok */ }
      totalArquivosLocal = contarArquivosDir(dirPath)
      narrar(`${totalArquivosLocal} arquivo(s) encontrado(s) no projeto local`)
    } else {
      narrar('Pasta local ainda não existe — será criada durante a extração')
    }

    /* ── ETAPA 4: Comparar versões ─────────────────────────── */
    step('comparando', 32)
    narrar('Analisando diferenças entre local e remoto...')
    await sleep(350)

    const dataPushGitHub = new Date(pushedAtAntes)
    const margemMs       = 60 * 1000
    const precisaSync    = !dataLocalModificacao
      || dataPushGitHub > new Date(dataLocalModificacao.getTime() + margemMs)

    if (precisaSync) {
      narrar('Repositório remoto possui commits mais recentes que o projeto local')
    } else {
      narrar('Projeto local parece atualizado — aplicando sync completo conforme solicitado')
    }

    const ultimaSync = doc?.metadados?.ultimaSincronizacao
    if (ultimaSync) {
      narrar(`Última sincronização registrada: ${new Date(ultimaSync).toLocaleString('pt-BR')}`)
    }

    /* ── ETAPA 5: Baixar zipball do GitHub ─────────────────── */
    step('baixando', 45)
    narrar(`Baixando zipball de ${owner}/${repo}@${defaultBranch}...`)

    let zipBuffer
    try {
      const zipResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/zipball/${defaultBranch}`,
        {
          headers: {
            Authorization:        `Bearer ${token}`,
            Accept:               'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'follow',
          signal:   AbortSignal.timeout(90_000),
        }
      )

      if (!zipResp.ok) {
        const body = await zipResp.text().catch(() => '')
        const msg  = zipResp.status === 404
          ? `Repositório "${owner}/${repo}" não encontrado ou sem acesso.`
          : zipResp.status === 403
            ? 'Acesso negado. Verifique os escopos do GITHUB_TOKEN.'
            : `GitHub retornou ${zipResp.status}: ${body.slice(0, 120)}`
        narrar(msg, 'error')
        return done('error', { msg })
      }

      zipBuffer = Buffer.from(await zipResp.arrayBuffer())
    } catch (err) {
      const msg = err.name === 'TimeoutError'
        ? 'Download excedeu o limite de 90s. Repositório muito grande?'
        : `Falha no download: ${err.message}`
      narrar(msg, 'error')
      return done('error', { msg })
    }

    if (zipBuffer.length === 0) {
      narrar('ZIP vazio recebido do GitHub.', 'error')
      return done('error', { msg: 'O arquivo ZIP do GitHub está vazio.' })
    }

    narrar(`Pacote recebido: ${(zipBuffer.length / 1024).toFixed(1)} KB`)

    /* ── ETAPA 6: Extrair arquivos ─────────────────────────── */
    step('extraindo', 60)
    narrar('Extraindo arquivos do repositório...')

    // Garante estrutura de diretórios
    if (!fs.existsSync(PROJETOS_DIR)) {
      fs.mkdirSync(PROJETOS_DIR, { recursive: true })
    }
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true })
    }
    fs.mkdirSync(dirPath, { recursive: true })

    const { default: unzipper } = await import('unzipper')
    const { Readable }          = await import('stream')

    let   prefixo           = null
    const arquivosExtraidos = []
    const errosExtracao     = []

    await new Promise((resolve, reject) => {
      Readable.from(zipBuffer)
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          const entryPath = entry.path

          // Detecta prefixo gerado pelo GitHub (ex: "owner-repo-sha123/")
          if (prefixo === null) {
            const firstSlash = entryPath.indexOf('/')
            prefixo = firstSlash !== -1 ? entryPath.slice(0, firstSlash + 1) : ''
          }

          const relPath = prefixo && entryPath.startsWith(prefixo)
            ? entryPath.slice(prefixo.length)
            : entryPath

          // ── Proteção Zip Slip ──────────────────────────────
          const absTarget = path.resolve(dirPath, relPath)
          if (!absTarget.startsWith(dirPath + path.sep) && absTarget !== dirPath) {
            entry.autodrain()
            errosExtracao.push({ arquivo: relPath, motivo: 'path traversal bloqueado' })
            return
          }

          if (entry.type === 'Directory') {
            fs.mkdirSync(absTarget, { recursive: true })
            entry.autodrain()
          } else {
            fs.mkdirSync(path.dirname(absTarget), { recursive: true })
            if (relPath) arquivosExtraidos.push(relPath)
            entry.pipe(fs.createWriteStream(absTarget)).on('error', reject)
          }
        })
        .on('close', resolve)
        .on('error', reject)
    })

    narrar(`${arquivosExtraidos.length} arquivo(s) extraído(s) com sucesso`, 'success')

    if (errosExtracao.length > 0) {
      narrar(`${errosExtracao.length} entrada(s) ignorada(s) por segurança (path traversal)`, 'warn')
    }

    // Emite a lista de arquivos afetados para o painel
    files(arquivosExtraidos.slice(0, 200))

    /* ── ETAPA 7: Registrar sincronização no MongoDB ────────── */
    step('registrando', 78)
    narrar('Registrando timestamp de sincronização...')

    await Projeto.findOneAndUpdate(
      { nome },
      { $set: { 'metadados.ultimaSincronizacao': new Date() } },
      { upsert: false }
    ).catch(() => null)

    narrar('Timestamp salvo no banco de dados')

    // Audit Log (não bloqueia o pipeline em caso de falha)
    try {
      const { default: AuditLog } = await import('../models/AuditLog.js')
      await AuditLog.create({
        admin_id:    req.usuario._id,
        admin_email: req.usuario.email,
        acao:        'sincronizar',
        recurso:     'projeto_local',
        recurso_id:  nome,
        payload:     { owner, repo, nomeProjeto: nome, totalArquivos: arquivosExtraidos.length, defaultBranch },
        ip:          req.ip,
        request_id:  req.requestId || null,
      })
    } catch { /* audit não bloqueia o pipeline */ }

    /* ── ETAPA 8: Enviar alterações para o GitHub ────────────
       Nota: neste fluxo o sync é pull (GitHub → local).
       O "envio" representa a confirmação de conclusão da extração.
    ─────────────────────────────────────────────────────────── */
    step('enviando', 86)
    narrar('Finalizando extração e verificando integridade local...')
    await sleep(400)

    const totalExtraido = contarArquivosDir(dirPath)
    narrar(`${totalExtraido} arquivo(s) presentes no diretório local após extração`)

    /* ── ETAPA 9: VALIDAÇÃO REMOTA — crítica ────────────────
       O sistema consulta o GitHub NOVAMENTE após a extração
       para confirmar que o estado remoto ainda é consistente
       com o que foi baixado. Se houve um push durante a sync,
       o estado é marcado como SYNC_INCONSISTENT.
    ─────────────────────────────────────────────────────────── */
    step('validando_remoto', 92)
    narrar('Aguardando confirmação do repositório remoto...')
    await sleep(500)
    narrar('Verificando se o commit existe no repositório remoto...')

    let repoDataDepois
    try {
      repoDataDepois = await githubFetch(`/repos/${owner}/${repo}`)
    } catch (err) {
      /* Não conseguimos confirmar o estado remoto — inconsistência */
      narrar(`Não foi possível consultar o GitHub para validação: ${err.message}`, 'warn')
      narrar('Inconsistência detectada entre estado local e GitHub', 'error')
      clearInterval(pingInterval)
      return done('inconsistent', {
        msg:      'Não foi possível validar o estado remoto após a sincronização.',
        relatorio: {
          totalArquivos:   arquivosExtraidos.length,
          erros:           errosExtracao,
          inconsistencia:  `Validação remota falhou: ${err.message}`,
          sincronizadoEm:  new Date().toISOString(),
        },
      })
    }

    /* Comparação: pushed_at antes vs depois ─────────────────
       Se o GitHub recebeu novos commits DURANTE nossa extração
       (delta > 5s), o repositório local já está desatualizado
       imediatamente após o sync — isso é uma inconsistência.
    ─────────────────────────────────────────────────────────── */
    const pushAntes  = new Date(pushedAtAntes).getTime()
    const pushDepois = new Date(repoDataDepois.pushed_at).getTime()
    const deltaPushMs = pushDepois - pushAntes

    narrar(`Commit remoto confirmado: ${repoDataDepois.pushed_at}`)

    if (deltaPushMs > 5_000) {
      /* Houve push durante a sincronização ───────────────── */
      narrar(
        `Inconsistência detectada entre estado local e GitHub`,
        'error'
      )
      narrar(
        `O GitHub recebeu novos commits durante a sincronização (+${Math.round(deltaPushMs / 1000)}s). O projeto local já está desatualizado.`,
        'warn'
      )
      clearInterval(pingInterval)
      return done('inconsistent', {
        msg: 'O repositório remoto recebeu novos commits durante a sincronização. Sincronize novamente.',
        relatorio: {
          totalArquivos:   arquivosExtraidos.length,
          erros:           errosExtracao,
          inconsistencia:  `Push remoto detectado durante sync (delta: ${Math.round(deltaPushMs / 1000)}s)`,
          pushedAtAntes:   pushedAtAntes,
          pushedAtDepois:  repoDataDepois.pushed_at,
          sincronizadoEm:  new Date().toISOString(),
        },
      })
    }

    /* ── ETAPA 10: Concluído com sucesso ────────────────────── */
    step('concluido', 100)
    narrar('Alterações confirmadas no repositório remoto', 'success')
    narrar('Sincronização concluída com sucesso', 'success')

    clearInterval(pingInterval)
    done('success', {
      msg: `Projeto "${nome}" sincronizado com ${arquivosExtraidos.length} arquivo(s).`,
      relatorio: {
        totalArquivos:    arquivosExtraidos.length,
        arquivos:         arquivosExtraidos.slice(0, 200),
        erros:            errosExtracao,
        tamanhoZipBytes:  zipBuffer.length,
        sincronizadoEm:   new Date().toISOString(),
        commitConfirmado: repoDataDepois.pushed_at,
        branch:           defaultBranch,
      },
    })

  } catch (err) {
    clearInterval(pingInterval)
    narrar(`Erro inesperado: ${err.message}`, 'error')
    done('error', { msg: err.message || 'Erro interno ao sincronizar.' })
  }
})

/* ══════════════════════════════════════════════════════════════
   SPRINT 9 — COMMIT & PUSH  (GitHub ← Servidor)
   ADIÇÃO PURA. Nenhuma rota anterior foi modificada ou removida.

   Usa exclusivamente a GitHub Git Data API (sem git instalado):
     blobs → tree → commit → update-ref
══════════════════════════════════════════════════════════════ */

/* ── Constantes de segurança para commit ───────────────────── */
const COMMIT_MAX_ARQUIVO_BYTES = 10 * 1024 * 1024   // 10 MB por arquivo
const COMMIT_MAX_ARQUIVOS      = 800                 // máx. arquivos por commit
const COMMIT_EXTENSOES_BINARIAS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','svg','tiff',
  'mp4','mov','avi','mkv','mp3','wav','ogg','flac',
  'zip','tar','gz','bz2','xz','7z','rar',
  'exe','dll','so','dylib','wasm',
  'pdf','doc','docx','xls','xlsx','ppt','pptx',
  'ttf','otf','woff','woff2','eot',
  'db','sqlite','sqlite3',
  'bin','dat','idx','pack',
])

/* Pastas/arquivos sempre ignorados no commit */
const COMMIT_IGNORADOS = new Set([
  'node_modules','.git','.svn','.hg',
  'dist','build','.next','.nuxt','out',
  '.cache','.parcel-cache','.turbo',
  '__pycache__','.pytest_cache','.mypy_cache',
  'vendor','.vendor',
  'coverage','.nyc_output',
  '.env','.env.local','.env.production','.env.development',
])

/* Extensões de arquivos temporários/lixo — nunca commitadas */
const COMMIT_EXTENSOES_IGNORADAS = new Set([
  'bak','tmp','orig','swp','swo','bkp','old',
])

/**
 * Calcula o SHA-1 de um blob no formato do Git:
 *   sha1("blob {size}\0{content}")
 * Permite comparar com os SHAs retornados pela GitHub Tree API
 * sem precisar criar um blob real — base do diff detection.
 */
function computeGitBlobSha(content, encoding) {
  const buf = encoding === 'base64'
    ? Buffer.from(content, 'base64')
    : Buffer.from(content, 'utf8')
  const header = Buffer.from(`blob ${buf.length}\0`)
  return crypto.createHash('sha1').update(header).update(buf).digest('hex')
}

/**
 * Lista recursiva de arquivos de um diretório, respeitando
 * limites de segurança. Retorna array de objetos
 *   { relPath: string, absPath: string, bytes: number, binario: boolean }
 */
function listarArquivosCommit(baseDir, relDir = '', lista = []) {
  if (lista.length >= COMMIT_MAX_ARQUIVOS) return lista

  const absDir = path.join(baseDir, relDir)
  let entradas
  try { entradas = fs.readdirSync(absDir, { withFileTypes: true }) }
  catch { return lista }

  for (const e of entradas) {
    if (lista.length >= COMMIT_MAX_ARQUIVOS) break
    if (COMMIT_IGNORADOS.has(e.name)) continue

    const relPath = relDir ? `${relDir}/${e.name}` : e.name
    const absPath = path.join(absDir, e.name)

    if (e.isDirectory()) {
      listarArquivosCommit(baseDir, relPath, lista)
    } else if (e.isFile()) {
      let bytes = 0
      try { bytes = fs.statSync(absPath).size } catch { continue }

      const ext     = e.name.split('.').pop().toLowerCase()

      // Ignorar extensões de arquivos temporários/lixo
      if (COMMIT_EXTENSOES_IGNORADAS.has(ext)) continue

      const binario = COMMIT_EXTENSOES_BINARIAS.has(ext)

      lista.push({ relPath, absPath, bytes, binario })
    }
  }
  return lista
}

/**
 * Lê um arquivo e retorna { content: string, encoding: 'utf-8'|'base64' }.
 * Arquivos acima do limite retornam null.
 */
function lerArquivoParaBlob(absPath, bytes, binario) {
  if (bytes > COMMIT_MAX_ARQUIVO_BYTES) return null
  try {
    if (binario) {
      return { content: fs.readFileSync(absPath).toString('base64'), encoding: 'base64' }
    }
    return { content: fs.readFileSync(absPath, 'utf8'), encoding: 'utf-8' }
  } catch { return null }
}

/* ──────────────────────────────────────────────────────────────
   GET /api/projetos/:nome/commit-status
   Retorna informações do estado atual do repositório para commits:
     SHA do último commit, branches, últimos 5 commits, contagem
     de arquivos locais prontos para commit.
────────────────────────────────────────────────────────────── */
router.get('/:nome/commit-status', autenticar, async (req, res) => {
  const { nome } = req.params

  if (!nomeValido(nome))
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })

  const doc   = await Projeto.findOne({ nome }).lean().catch(() => null)
  const owner = doc?.metadados?.githubOwner
  const repo  = doc?.metadados?.githubRepo

  if (!owner || !repo)
    return res.json({ vinculado: false })

  try {
    // Repo info + branches + últimos commits em paralelo
    const [repoData, branches, commits] = await Promise.all([
      githubFetch(`/repos/${owner}/${repo}`),
      githubFetch(`/repos/${owner}/${repo}/branches`).catch(() => []),
      githubFetch(`/repos/${owner}/${repo}/commits?per_page=5`).catch(() => []),
    ])

    const defaultBranch = repoData.default_branch

    // Contagem de arquivos locais
    const dirPath      = path.join(PROJETOS_DIR, nome)
    const arquivosLocais = fs.existsSync(dirPath)
      ? listarArquivosCommit(dirPath)
      : []

    const totalBytes = arquivosLocais.reduce((s, f) => s + f.bytes, 0)

    return res.json({
      vinculado:       true,
      owner,
      repo,
      nomeCompleto:    repoData.full_name,
      url:             repoData.html_url,
      defaultBranch,
      branches:        branches.map(b => ({
        nome:      b.name,
        sha:       b.commit.sha,
        protegido: b.protected,
      })),
      ultimosCommits:  commits.map(c => ({
        sha:       c.sha.slice(0, 7),
        shaCompleto: c.sha,
        mensagem:  c.commit.message.split('\n')[0].slice(0, 120),
        autor:     c.commit.author.name,
        email:     c.commit.author.email,
        data:      c.commit.author.date,
        url:       c.html_url,
      })),
      arquivosLocais: {
        total:      arquivosLocais.length,
        totalBytes,
        disponiveis: arquivosLocais.length > 0,
        limitados:   arquivosLocais.length >= COMMIT_MAX_ARQUIVOS,
      },
      ultimoCommitLocal:     doc?.metadados?.ultimoCommitSha      || null,
      ultimoCommitLocalData: doc?.metadados?.ultimoCommitData     || null,
      ultimoCommitLocalMsg:  doc?.metadados?.ultimoCommitMensagem || null,
    })
  } catch (err) {
    return res.status(err.status || 500).json({
      vinculado: true,
      owner,
      repo,
      erro: err.message,
    })
  }
})

/* ──────────────────────────────────────────────────────────────
   GET /api/projetos/:nome/commit-stream
   SSE: pipeline completo de commit + push via GitHub Git Data API.

   Query params:
     ?message=   mensagem do commit (obrigatório, máx 4096 chars)
     ?branch=    branch de destino  (padrão: branch default do repo)
     ?autor=     "Nome <email>"     (padrão: variáveis de ambiente
                                     GIT_AUTOR_NOME / GIT_AUTOR_EMAIL
                                     ou email do usuário autenticado)
     ?force=     "true" → force-push (para branches não-protegidos)

   Pipeline (etapas com progresso):
     1. verificando_vinculo        (  5%)
     2. consultando_github         ( 15%)
     3. listando_arquivos          ( 25%)
     4. criando_blobs              ( 35–60% — narrado por arquivo)
     5. criando_tree               ( 68%)
     6. criando_commit             ( 78%)
     7. atualizando_ref            ( 88%)
     8. registrando               ( 94%)
     9. concluido                  (100%)
────────────────────────────────────────────────────────────── */
router.get('/:nome/commit-stream', autenticar, async (req, res) => {
  /* ── Cabeçalhos SSE ──────────────────────────────────────── */
  res.setHeader('Content-Type',              'text/event-stream')
  res.setHeader('Cache-Control',             'no-cache, no-transform')
  res.setHeader('Connection',                'keep-alive')
  res.setHeader('X-Accel-Buffering',         'no')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.flushHeaders()

  let encerrado = false

  /* ── Helpers de emissão (mesma assinatura do sync-stream) ── */
  function emit(obj) {
    if (encerrado || res.writableEnded) return
    res.write(`data: ${JSON.stringify({ ...obj, ts: new Date().toISOString() })}\n\n`)
  }
  function narrar(msg, nivel = 'info') { emit({ type: 'narration', msg, nivel }) }
  function step(etapa, progresso)      { emit({ type: 'step', etapa, progresso }) }
  function files(arquivos)             { emit({ type: 'files', arquivos }) }
  function done(status, extra = {}) {
    emit({ type: 'done', status, ...extra })
    encerrado = true
    if (!res.writableEnded) res.end()
  }

  /* ── Keep-alive: ping a cada 20s ────────────────────────── */
  const pingInterval = setInterval(() => {
    if (!encerrado && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`)
    } else {
      clearInterval(pingInterval)
    }
  }, 20_000)

  req.on('close', () => { encerrado = true; clearInterval(pingInterval) })

  /* ════════════════════════════════════════════════════════════
     PIPELINE DE COMMIT + PUSH NARRADO
  ════════════════════════════════════════════════════════════ */
  const { nome }   = req.params
  const { message, branch: branchParam, autor, force, destPath: destPathParam, fonte } = req.query
  const isGridFS   = fonte === 'gridfs'
  const destPath   = (destPathParam || '').replace(/^\/|\/$/g, '').trim()  // ex: "projetos/meu-app"

  try {
    /* ── ETAPA 1: Validações iniciais ───────────────────────── */
    step('verificando_vinculo', 5)
    narrar(`Iniciando pipeline de commit para o projeto "${nome}"`)

    if (!nomeValido(nome)) {
      narrar('Nome de projeto inválido.', 'error')
      return done('error', { msg: 'Nome de projeto inválido.' })
    }

    // Validar mensagem
    const mensagem = (message || '').trim()
    if (!mensagem) {
      narrar('Mensagem de commit não informada.', 'error')
      return done('error', { msg: 'O parâmetro ?message= é obrigatório.' })
    }
    if (mensagem.length > 4096) {
      narrar('Mensagem de commit muito longa (máx 4096 chars).', 'error')
      return done('error', { msg: 'Mensagem de commit muito longa (máx 4096 chars).' })
    }

    // Validar token
    const { value: token } = await getCredential('github', 'GITHUB_TOKEN')
    if (!token) {
      narrar('GITHUB_TOKEN não configurado no servidor.', 'error')
      return done('error', { msg: 'GITHUB_TOKEN ausente no servidor.' })
    }

    // Verificar vínculo
    const doc   = await Projeto.findOne({ nome }).lean().catch(() => null)
    const owner = doc?.metadados?.githubOwner
    const repo  = doc?.metadados?.githubRepo

    if (!owner || !repo) {
      narrar('Projeto não possui repositório GitHub vinculado.', 'error')
      return done('error', { msg: 'Sem repositório vinculado.' })
    }

    narrar(`Repositório vinculado: ${owner}/${repo}`)

    // Verificar fonte dos arquivos
    let dirPath = null
    if (isGridFS) {
      // GridFS — verifica se projeto existe no bucket
      const bucket   = gridBucket()
      const existentes = await bucket.find({ 'metadata.projetoNome': nome }).limit(1).toArray()
      if (!existentes.length) {
        narrar(`Projeto "${nome}" não encontrado no GridFS.`, 'error')
        return done('error', { msg: `Projeto "${nome}" não existe no GridFS.` })
      }
      narrar(`Fonte: MongoDB GridFS · projeto "${nome}" encontrado`)
    } else {
      // Local filesystem
      dirPath = path.join(PROJETOS_DIR, nome)
      if (!fs.existsSync(dirPath)) {
        narrar(`Diretório local "${nome}" não encontrado em projetos/`, 'error')
        return done('error', { msg: `Diretório local "projetos/${nome}" não existe.` })
      }
      narrar(`Fonte: Filesystem local · ${dirPath}`)
    }
    if (destPath) narrar(`Pasta de destino no GitHub: ${destPath}/`)

    /* ── ETAPA 2: Consultar GitHub — branch + commit base ───── */
    step('consultando_github', 15)
    narrar('Consultando estado atual do repositório no GitHub...')

    let repoData
    try { repoData = await githubFetch(`/repos/${owner}/${repo}`) }
    catch (err) {
      narrar(`Erro ao consultar repositório: ${err.message}`, 'error')
      return done('error', { msg: `GitHub inacessível: ${err.message}` })
    }

    const targetBranch  = (branchParam || '').trim() || repoData.default_branch
    narrar(`Repositório: ${repoData.full_name}`)
    narrar(`Branch de destino: ${targetBranch} · visibilidade: ${repoData.private ? 'privado' : 'público'}`)

    // Obter SHA atual da branch (commit HEAD)
    let refData
    try {
      refData = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`)
    } catch (err) {
      if (err.status === 404) {
        narrar(`Branch "${targetBranch}" não encontrada no repositório.`, 'error')
        return done('error', { msg: `Branch "${targetBranch}" não existe em ${owner}/${repo}.` })
      }
      narrar(`Erro ao obter referência da branch: ${err.message}`, 'error')
      return done('error', { msg: err.message })
    }

    const headCommitSha = refData.object.sha
    narrar(`HEAD atual da branch: ${headCommitSha.slice(0, 7)}`)

    /* ── Verificar divergência com último commit local ────────── */
    const ultimoCommitLocal = doc?.metadados?.ultimoCommitSha
    if (ultimoCommitLocal && ultimoCommitLocal !== headCommitSha) {
      narrar(
        `⚠ Divergência detectada: o GitHub avançou desde o último commit registrado ` +
        `(local: ${ultimoCommitLocal.slice(0, 7)} → remoto: ${headCommitSha.slice(0, 7)}). ` +
        `Pode haver mudanças no GitHub não presentes localmente.`,
        'warn'
      )
    }

    // Obter tree SHA do commit HEAD
    let headCommitData
    try {
      headCommitData = await githubFetch(`/repos/${owner}/${repo}/git/commits/${headCommitSha}`)
    } catch (err) {
      narrar(`Erro ao obter dados do commit HEAD: ${err.message}`, 'error')
      return done('error', { msg: err.message })
    }

    const baseTreeSha = headCommitData.tree.sha
    narrar(`Tree base: ${baseTreeSha.slice(0, 7)}`)

    /* ── Buscar tree atual do GitHub para diff ───────────────── */
    narrar('Buscando tree atual do GitHub para detectar mudanças...')
    let githubTreeMap = new Map() // path → sha (blobs atuais no GitHub)
    try {
      const treeData = await githubFetch(
        `/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`
      )
      for (const item of treeData.tree) {
        if (item.type === 'blob') githubTreeMap.set(item.path, item.sha)
      }
      narrar(`Tree remota carregada: ${githubTreeMap.size} arquivo(s) indexado(s)`)
    } catch (err) {
      // Não bloqueia — degradação graciosa: envia tudo se não conseguir a tree
      narrar(`Não foi possível carregar a tree remota, enviando todos os arquivos: ${err.message}`, 'warn')
      githubTreeMap = null
    }

    /* ── Resolver autor do commit ────────────────────────────── */
    let autorNome  = process.env.GIT_AUTOR_NOME  || 'AL Sistemas Bot'
    let autorEmail = process.env.GIT_AUTOR_EMAIL || req.usuario.email || 'bot@alsistemas.com'

    if (autor) {
      // Formato aceito: "Nome <email>" ou apenas "email"
      const match = autor.match(/^(.+?)\s*<([^>]+)>$/)
      if (match) {
        autorNome  = match[1].trim()
        autorEmail = match[2].trim()
      } else if (autor.includes('@')) {
        autorEmail = autor.trim()
      } else {
        autorNome = autor.trim()
      }
    }

    narrar(`Autor do commit: ${autorNome} <${autorEmail}>`)

    /* ── ETAPA 3: Listar arquivos ───────────────────────────── */
    step('listando_arquivos', 25)

    let arquivosLocais = []

    if (isGridFS) {
      narrar(`Lendo arquivos do GridFS para "${nome}"...`)
      const bucket = gridBucket()
      const files  = await bucket.find({ 'metadata.projetoNome': nome }).toArray()

      const ignoradosGridFS = []
      arquivosLocais = files
        .map(f => {
          const relPath = f.metadata.relPath || f.filename.replace(`${nome}/`, '')
          const ext     = relPath.split('.').pop().toLowerCase()
          const binario = COMMIT_EXTENSOES_BINARIAS.has(ext)
          return { relPath, bytes: f.length, binario, absPath: null, gridFSId: f._id }
        })
        .filter(f => {
          if (!f.relPath || f.relPath.startsWith('..')) return false
          // Aplica as mesmas regras de segurança do commit local
          const segmentos = f.relPath.split('/')
          if (segmentos.some(seg => COMMIT_IGNORADOS.has(seg))) {
            ignoradosGridFS.push(f.relPath)
            return false
          }
          const ext = f.relPath.split('.').pop().toLowerCase()
          if (COMMIT_EXTENSOES_IGNORADAS.has(ext)) {
            ignoradosGridFS.push(f.relPath)
            return false
          }
          return true
        })

      if (ignoradosGridFS.length > 0)
        narrar(`${ignoradosGridFS.length} arquivo(s) ignorado(s) por segurança (ex: .env, node_modules): ${ignoradosGridFS.slice(0, 5).join(', ')}${ignoradosGridFS.length > 5 ? '…' : ''}`, 'warn')
      narrar(`${arquivosLocais.length} arquivo(s) elegíveis lidos do GridFS`)
    } else {
      narrar('Listando arquivos do projeto local...')
      arquivosLocais = listarArquivosCommit(dirPath)
    }

    if (arquivosLocais.length === 0) {
      narrar('Nenhum arquivo encontrado no projeto local.', 'error')
      return done('error', { msg: 'Diretório de projeto está vazio ou sem arquivos elegíveis.' })
    }

    const totalBytes    = arquivosLocais.reduce((s, f) => s + f.bytes, 0)
    const arquivosBinarios = arquivosLocais.filter(f => f.binario).length
    const arquivosGrandes  = arquivosLocais.filter(f => f.bytes > COMMIT_MAX_ARQUIVO_BYTES)

    narrar(`${arquivosLocais.length} arquivo(s) encontrado(s) · ${(totalBytes / 1024).toFixed(1)} KB total`)
    if (arquivosBinarios > 0)
      narrar(`${arquivosBinarios} arquivo(s) binário(s) serão enviados como base64`)
    if (arquivosGrandes.length > 0)
      narrar(`${arquivosGrandes.length} arquivo(s) acima de 10MB serão ignorados`, 'warn')
    if (arquivosLocais.length >= COMMIT_MAX_ARQUIVOS)
      narrar(`Limite de ${COMMIT_MAX_ARQUIVOS} arquivos por commit atingido — node_modules e dist excluídos automaticamente`, 'warn')

    /* ── ETAPA 4: Criar blobs no GitHub ─────────────────────── */
    step('criando_blobs', 35)
    narrar('Criando blobs no GitHub (um por arquivo)...')

    const treeItems   = []
    const errosBlob   = []
    const ignorados   = []
    const enviados    = []
    const inalterados = []

    const total = arquivosLocais.length
    let   idx   = 0

    for (const arquivo of arquivosLocais) {
      if (encerrado) break
      idx++

      // Progresso incremental de 35% a 60%
      const progresso = Math.round(35 + ((idx / total) * 25))
      emit({ type: 'step', etapa: 'criando_blobs', progresso, idx, total, ts: new Date().toISOString() })

      // Ignorar arquivos muito grandes
      if (arquivo.bytes > COMMIT_MAX_ARQUIVO_BYTES) {
        ignorados.push({ arquivo: arquivo.relPath, motivo: 'arquivo acima de 10MB' })
        narrar(`⚠ Ignorado (>10MB): ${arquivo.relPath}`, 'warn')
        continue
      }

      // Ler conteúdo — GridFS ou filesystem
      let conteudo
      try {
        if (isGridFS) {
          // Lê do GridFS via stream com timeout de 30s para evitar travamento
          const bucket = gridBucket()
          const chunks = []
          await new Promise((resolve, reject) => {
            const dl      = bucket.openDownloadStream(arquivo.gridFSId)
            const timeout = setTimeout(() => {
              dl.destroy()
              reject(new Error(`Timeout (30s) ao ler "${arquivo.relPath}" do GridFS`))
            }, 30_000)
            dl.on('data',  c   => chunks.push(c))
            dl.on('end',   ()  => { clearTimeout(timeout); resolve() })
            dl.on('error', err => { clearTimeout(timeout); reject(err) })
          })
          const buf = Buffer.concat(chunks)
          if (arquivo.binario) {
            conteudo = { content: buf.toString('base64'), encoding: 'base64' }
          } else {
            conteudo = { content: buf.toString('utf8'), encoding: 'utf-8' }
          }
        } else if (arquivo.binario) {
          conteudo = { content: fs.readFileSync(arquivo.absPath).toString('base64'), encoding: 'base64' }
        } else {
          conteudo = { content: fs.readFileSync(arquivo.absPath, 'utf8'), encoding: 'utf-8' }
        }
      } catch (err) {
        errosBlob.push({ arquivo: arquivo.relPath, motivo: `Leitura falhou: ${err.message}` })
        narrar(`⚠ Não foi possível ler: ${arquivo.relPath}`, 'warn')
        continue
      }

      /* ── Diff detection: pular arquivo se SHA não mudou ──────
         Compara o git blob SHA local com o SHA que o GitHub já tem.
         Arquivos inalterados são herdados automaticamente via base_tree
         e não precisam de um novo blob — economiza chamadas à API.
      ───────────────────────────────────────────────────────── */
      if (githubTreeMap) {
        const remoteSha = githubTreeMap.get(arquivo.relPath)
        if (remoteSha) {
          const localSha = computeGitBlobSha(conteudo.content, conteudo.encoding)
          if (localSha === remoteSha) {
            inalterados.push(arquivo.relPath)
            continue // herdado do base_tree, sem novo blob necessário
          }
        }
      }

      // Criar blob via API (apenas arquivos novos ou modificados)
      let blobData
      try {
        blobData = await githubFetch(`/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body:   JSON.stringify({ content: conteudo.content, encoding: conteudo.encoding }),
        })
      } catch (err) {
        errosBlob.push({ arquivo: arquivo.relPath, motivo: `Blob falhou: ${err.message}` })
        narrar(`⚠ Falha ao criar blob para: ${arquivo.relPath} — ${err.message}`, 'warn')
        continue
      }

      treeItems.push({
        path: destPath ? `${destPath}/${arquivo.relPath}` : arquivo.relPath,
        mode: '100644',
        type: 'blob',
        sha:  blobData.sha,
      })

      enviados.push(arquivo.relPath)

      // Log a cada 10 arquivos ou para arquivos importantes
      if (idx % 10 === 0 || idx <= 5) {
        narrar(`[${idx}/${total}] ${arquivo.relPath} (${(arquivo.bytes / 1024).toFixed(1)} KB)`)
      }
    }

    /* ── Arquivos removidos localmente: deletar do GitHub ─────
       Qualquer path presente no GitHub mas ausente localmente
       (e não nos inalterados) recebe sha: null para ser excluído.
    ───────────────────────────────────────────────────────── */
    if (githubTreeMap) {
      const pathsLocais = new Set(arquivosLocais.map(f => f.relPath))
      for (const [remotePath] of githubTreeMap) {
        if (!pathsLocais.has(remotePath)) {
          treeItems.push({ path: remotePath, mode: '100644', type: 'blob', sha: null })
          narrar(`🗑 Removido do GitHub (não existe localmente): ${remotePath}`, 'warn')
        }
      }
    }

    if (inalterados.length > 0) {
      narrar(`${inalterados.length} arquivo(s) inalterado(s) — herdados do base_tree sem novo blob`)
    }

    if (treeItems.length === 0) {
      narrar('Nenhum blob foi criado com sucesso. Abortando commit.', 'error')
      clearInterval(pingInterval)
      return done('error', {
        msg: 'Nenhum arquivo pôde ser enviado ao GitHub.',
        relatorio: { erros: errosBlob, ignorados },
      })
    }

    narrar(`${treeItems.length} blob(s) criado(s) no GitHub com sucesso`, 'success')
    if (errosBlob.length > 0)
      narrar(`${errosBlob.length} arquivo(s) falharam e foram excluídos do commit`, 'warn')

    // Emite lista de arquivos incluídos
    files(enviados.slice(0, 300))

    /* ── ETAPA 5: Criar nova tree ───────────────────────────── */
    step('criando_tree', 68)
    narrar('Criando tree consolidada no GitHub...')

    let novaTree
    try {
      novaTree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,   // herda arquivos não alterados
          tree:      treeItems,
        }),
      })
    } catch (err) {
      narrar(`Erro ao criar tree: ${err.message}`, 'error')
      clearInterval(pingInterval)
      return done('error', { msg: `Falha ao criar tree no GitHub: ${err.message}` })
    }

    narrar(`Tree criada: ${novaTree.sha.slice(0, 7)} · ${novaTree.tree.length} entrada(s)`)

    /* ── ETAPA 6: Criar objeto commit ───────────────────────── */
    step('criando_commit', 78)
    narrar('Criando objeto de commit no GitHub...')

    const agora          = new Date().toISOString()
    const commitPayload  = {
      message: mensagem,
      tree:    novaTree.sha,
      parents: [headCommitSha],
      author:  { name: autorNome, email: autorEmail, date: agora },
      committer: { name: autorNome, email: autorEmail, date: agora },
    }

    let novoCommit
    try {
      novoCommit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        body:   JSON.stringify(commitPayload),
      })
    } catch (err) {
      narrar(`Erro ao criar commit: ${err.message}`, 'error')
      clearInterval(pingInterval)
      return done('error', { msg: `Falha ao criar commit: ${err.message}` })
    }

    narrar(`Commit criado: ${novoCommit.sha.slice(0, 7)}`)
    narrar(`Mensagem: "${mensagem}"`)

    /* ── ETAPA 7: Atualizar referência (push) ───────────────── */
    step('atualizando_ref', 88)
    narrar(`Atualizando referência heads/${targetBranch} no GitHub...`)

    try {
      await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${targetBranch}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sha:   novoCommit.sha,
          force: force === 'true',
        }),
      })
    } catch (err) {
      // Erro mais comum: branch protegida requer PR
      const motivo = err.status === 422
        ? `Branch "${targetBranch}" pode ser protegida — verifique as regras do repositório.`
        : err.message
      narrar(`Falha ao fazer push para "${targetBranch}": ${motivo}`, 'error')
      narrar('O commit foi criado no GitHub mas a referência NÃO foi atualizada.', 'warn')
      clearInterval(pingInterval)
      return done('error', {
        msg:   `Push falhou: ${motivo}`,
        relatorio: {
          commitShaCriado: novoCommit.sha,
          commitUrl:       novoCommit.html_url,
          mensagem,
          branch:          targetBranch,
          totalArquivos:   treeItems.length,
          erros:           errosBlob,
          ignorados,
          commitadoEm:     agora,
        },
      })
    }

    narrar(`Push concluído — branch "${targetBranch}" aponta para ${novoCommit.sha.slice(0, 7)}`, 'success')

    /* ── ETAPA 8: Registrar no MongoDB ──────────────────────── */
    step('registrando', 94)
    narrar('Registrando metadados do commit no banco de dados...')

    await Projeto.findOneAndUpdate(
      { nome },
      {
        $set: {
          'metadados.ultimoCommitSha':      novoCommit.sha,
          'metadados.ultimoCommitData':     agora,
          'metadados.ultimoCommitMensagem': mensagem,
          'metadados.ultimoCommitAutor':    `${autorNome} <${autorEmail}>`,
          'metadados.ultimoCommitBranch':   targetBranch,
          'metadados.ultimaAtualizacao':    new Date(),
        },
      },
      { upsert: false }
    ).catch(() => null)

    narrar('Metadados salvos')

    // Audit Log
    try {
      const { default: AuditLog } = await import('../models/AuditLog.js')
      await AuditLog.create({
        admin_id:    req.usuario._id,
        admin_email: req.usuario.email,
        acao:        'commit_push',
        recurso:     'projeto_local',
        recurso_id:  nome,
        payload: {
          owner,
          repo,
          nomeProjeto:   nome,
          branch:        targetBranch,
          commitSha:     novoCommit.sha,
          mensagem,
          totalArquivos: treeItems.length,
          totalBytes,
          autor:         `${autorNome} <${autorEmail}>`,
        },
        ip:         req.ip,
        request_id: req.requestId || null,
      })
    } catch { /* audit não bloqueia o pipeline */ }

    /* ── ETAPA 9: Concluído ──────────────────────────────────── */
    step('concluido', 100)
    narrar('Commit e push concluídos com sucesso!', 'success')
    narrar(`Commit: ${novoCommit.sha.slice(0, 7)} · Branch: ${targetBranch}`, 'success')

    clearInterval(pingInterval)
    done('success', {
      msg: `Projeto "${nome}" enviado para ${owner}/${repo}@${targetBranch} com ${treeItems.length} arquivo(s).`,
      relatorio: {
        commitSha:       novoCommit.sha,
        commitShaCurto:  novoCommit.sha.slice(0, 7),
        commitUrl:       novoCommit.html_url || `https://github.com/${owner}/${repo}/commit/${novoCommit.sha}`,
        mensagem,
        branch:          targetBranch,
        autor:           `${autorNome} <${autorEmail}>`,
        totalArquivos:   treeItems.length,
        totalBytes,
        ignorados:       ignorados.length,
        erros:           errosBlob.length,
        arquivosErro:    errosBlob,
        arquivosIgnorados: ignorados,
        commitadoEm:     agora,
        treeBaseSha:     baseTreeSha,
        novaTreeSha:     novaTree.sha,
        commitPaiSha:    headCommitSha,
      },
    })

  } catch (err) {
    clearInterval(pingInterval)
    narrar(`Erro inesperado no pipeline: ${err.message}`, 'error')
    done('error', { msg: err.message || 'Erro interno ao fazer commit.' })
  }
})

export default router

/* ══════════════════════════════════════════════════════════════
   CLOUDFLARE R2 UPLOAD — Sprint 12
   Extrai o ZIP e envia cada arquivo para um bucket R2 usando
   a API S3-compatível da Cloudflare com assinatura AWS SigV4.

   Rota:
     POST /api/projetos/upload-r2
       Campos: zip (file), nomeProjeto (string), substituir (bool)

   Variáveis de ambiente necessárias:
     CF_ACCOUNT_ID          (já existente)
     CF_R2_ACCESS_KEY_ID    (novo — gerado em: CF Dashboard → R2 → Manage R2 API Tokens)
     CF_R2_SECRET_ACCESS_KEY (novo)
     CF_R2_BUCKET           (novo — nome do bucket R2)
     CF_R2_PUBLIC_URL       (opcional — URL pública do bucket)
══════════════════════════════════════════════════════════════ */

// ── Detecta Content-Type pelo extension ──────────────────────
function mimeFromExt(ext) {
  const map = {
    js:'application/javascript', mjs:'application/javascript',
    ts:'application/typescript', jsx:'text/jsx', tsx:'text/tsx',
    css:'text/css', html:'text/html', htm:'text/html',
    json:'application/json', xml:'application/xml',
    md:'text/markdown', txt:'text/plain', sh:'text/plain',
    svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg',
    jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp',
    ico:'image/x-icon', pdf:'application/pdf',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf',
    mp4:'video/mp4', webm:'video/webm',
    zip:'application/zip', gz:'application/gzip',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/* ── POST /upload-r2 ─────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════
   R2 UPLOAD — Sprint 13: Job-based async para evitar timeout
   POST /api/projetos/upload-r2
     → extrai ZIP, cria job, retorna { jobId } imediatamente
     → processamento acontece em background (sem travar o Render)
   GET  /api/projetos/upload-r2/progress/:jobId   (SSE, acima)
══════════════════════════════════════════════════════════════ */

async function processarUploadR2({ jobId, nomeProjeto, entries, bucket, substituir }) {
  const job = r2UploadJobs.get(jobId)
  if (!job) return
  const s3 = r2S3Client()

  function progresso(fase, extra = {}) {
    if (!job) return
    job.fase = fase
    job.msg  = extra.msg || null
    job.emitter.emit('progress', { enviados: job.enviados, total: job.total, nomeProjeto, fase, ...extra })
  }

  try {
    // ── Fase 1: deletar objetos antigos se substituir ────────
    if (substituir) {
      progresso('limpando_antigos', { msg: 'Removendo versão anterior do R2…' })
      try {
        let continuationToken
        do {
          const listRes = await s3.send(new ListObjectsV2Command({
            Bucket: bucket, Prefix: `${nomeProjeto}/`, ContinuationToken: continuationToken,
          }))
          const keys = (listRes.Contents || []).map(o => ({ Key: o.Key }))
          if (keys.length) {
            await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }))
          }
          continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined
        } while (continuationToken)
      } catch { /* deleção opcional — não falha o upload */ }
    }

    // ── Fase 2: upload por lotes via S3-compatible API ───────
    progresso('enviando', { msg: `Enviando 0/${entries.length} arquivos…` })
    const BATCH = 10
    for (let i = 0; i < entries.length; i += BATCH) {
      const lote = entries.slice(i, i + BATCH)
      await Promise.all(lote.map(async ({ rel, buf }) => {
        const key = `${nomeProjeto}/${rel}`
        const ext = rel.split('.').pop() || ''
        try {
          await s3.send(new PutObjectCommand({
            Bucket:      bucket,
            Key:         key,
            Body:        buf,
            ContentType: mimeFromExt(ext),
          }))
          job.enviados++
        } catch (e) {
          job.erros.push(`${rel}: ${e.message}`)
        }
      }))
      progresso('enviando', { msg: `Enviando ${job.enviados}/${job.total} arquivos para R2…` })
    }

    // ── Fase 3: resultado ────────────────────────────────────
    const publicUrl = process.env.CF_R2_PUBLIC_URL
      ? `${process.env.CF_R2_PUBLIC_URL.replace(/\/$/, '')}/${nomeProjeto}/`
      : null

    if (job.enviados === 0 && entries.length > 0) {
      job.status = 'error'
      job.emitter.emit('done', { status: 'error', enviados: 0, total: job.total, erros: job.erros.slice(0, 10), msg: `Nenhum arquivo enviado. ${job.erros[0] || ''}` })
      return
    }

    job.status = 'done'
    job.emitter.emit('done', {
      status:    'done',
      enviados:  job.enviados,
      total:     job.total,
      erros:     job.erros.length ? job.erros.slice(0, 10) : undefined,
      publicUrl,
      nomeProjeto,
      mensagem:  `"${nomeProjeto}" → R2: ${job.enviados}/${job.total} arquivos.`,
    })

    Projeto.findOneAndUpdate(
      { nome: nomeProjeto },
      { $set: { 'metadados.ultimaSincronizacao': new Date(), 'metadados.r2Bucket': bucket } },
      { upsert: false }
    ).catch(() => null)
  } catch (err) {
    job.status = 'error'
    job.emitter.emit('done', { status: 'error', msg: err.message || 'Erro interno ao processar o ZIP.', enviados: job.enviados, total: job.total })
  }
}

router.post('/upload-r2', autenticar, upload.single('zip'), async (req, res) => {
  const tmpPath = req.file?.path
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo ZIP enviado.' })

  const accountId       = process.env.CF_ACCOUNT_ID
  const bucket          = process.env.CF_R2_BUCKET
  const accessKeyId     = process.env.CF_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    deleteTempFile(tmpPath)
    return res.status(500).json({ erro: 'CF_ACCOUNT_ID, CF_R2_BUCKET, CF_R2_ACCESS_KEY_ID e CF_R2_SECRET_ACCESS_KEY são obrigatórios.' })
  }

  let nomeProjeto = (req.body.nomeProjeto || req.file.originalname.replace(/\.zip$/i, '') || 'projeto')
    .toString().trim()
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(nomeProjeto)) {
    deleteTempFile(tmpPath)
    return res.status(400).json({ erro: 'Nome inválido. Use letras, números, ., - ou _ (máx. 60 chars).' })
  }

  try {
    // ── Extrai ZIP em memória (rápido — < 3s mesmo para projetos grandes) ──
    const { default: unzipper } = await import('unzipper')
    let zipPrefixo = null
    const entries  = []

    await new Promise((resolve, reject) => {
      fs.createReadStream(tmpPath)
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          if (entry.type === 'Directory') { entry.autodrain(); return }
          const ep = entry.path
          if (zipPrefixo === null) {
            const s = ep.indexOf('/')
            zipPrefixo = s > 0 && !ep.includes('..') ? ep.slice(0, s + 1) : ''
          }
          const rel = (zipPrefixo && ep.startsWith(zipPrefixo)) ? ep.slice(zipPrefixo.length) : ep
          if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { entry.autodrain(); return }
          const chunks = []
          entry.on('data', c => chunks.push(c))
          entry.on('end',  () => entries.push({ rel, buf: Buffer.concat(chunks) }))
          entry.on('error', () => entry.autodrain())
        })
        .on('finish', resolve)
        .on('error',  reject)
    })

    deleteTempFile(tmpPath)
    if (entries.length === 0)
      return res.status(400).json({ erro: 'ZIP vazio ou sem arquivos elegíveis.' })

    // ── Cria job e retorna imediatamente — sem travar o Render ─
    const substituir = req.body.substituir === 'true'
    const job        = criarJobR2(nomeProjeto, entries.length)

    // Responde antes de iniciar o upload (evita timeout do Render)
    res.json({ jobId: job.jobId, total: entries.length, nomeProjeto })

    // Processa em background (não bloqueia o request)
    processarUploadR2({ jobId: job.jobId, nomeProjeto, entries, bucket, substituir })
      .catch(err => {
        const j = r2UploadJobs.get(job.jobId)
        if (j) { j.status = 'error'; j.emitter.emit('done', { status: 'error', msg: err.message }) }
      })
  } catch (err) {
    deleteTempFile(tmpPath)
    if (!res.headersSent) res.status(500).json({ erro: err.message || 'Erro ao processar o ZIP.' })
  }
})
