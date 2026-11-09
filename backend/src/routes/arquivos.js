/**
 * arquivos.js — Editor de arquivos de configuração + leitor de docs .md
 *
 * SEGURANÇA:
 *   - Arquivos de configuração: whitelist estrita (ARQUIVOS_CONFIG).
 *     Só os declarados podem ser lidos ou escritos.
 *   - Documentos .md: auto-descoberta segura limitada à raiz do repo.
 *     Leitura somente — escrita bloqueada. Nenhum path traversal aceito.
 */
import { Router } from 'express'
import fs          from 'fs/promises'
import path        from 'path'
import { autenticar }         from '../middleware/auth.js'
import { verificarPermissao } from '../middleware/verificarPermissao.js'

const router = Router()
router.use(autenticar)
router.use(verificarPermissao('configuracoes.gerenciar'))

// ─── Raiz do repositório ──────────────────────────────────────
const REPO_ROOT = path.resolve(process.cwd(), '..')

// ─── Whitelist: arquivos de configuração (leitura + escrita) ──
export const ARQUIVOS_CONFIG = {
  'env-frontend': {
    grupo:     'Configuração',
    label:     'frontend/.env',
    descricao: 'Variáveis de ambiente do frontend',
    caminho:   'frontend/.env',
    linguagem: 'dotenv',
    aviso:     'Em produção, configure as variáveis no painel do Vercel. Este arquivo só é usado no ambiente local.',
  },
  'env-frontend-example': {
    grupo:     'Configuração',
    label:     'frontend/.env.example',
    descricao: 'Modelo de variáveis de ambiente',
    caminho:   'frontend/.env.example',
    linguagem: 'dotenv',
    aviso:     null,
  },
  'capacitor-config': {
    grupo:     'Configuração',
    label:     'frontend/capacitor.config.ts',
    descricao: 'Configuração do app Android (Capacitor)',
    caminho:   'frontend/capacitor.config.ts',
    linguagem: 'typescript',
    aviso:     'Altere server.url para trocar a URL carregada pelo APK. Gere um novo APK após salvar.',
  },
  'ci-workflow': {
    grupo:     'Configuração',
    label:     '.github/workflows/ci.yml',
    descricao: 'Workflow GitHub Actions — gera o APK',
    caminho:   '.github/workflows/ci.yml',
    linguagem: 'yaml',
    aviso:     'Configure o secret VITE_API_URL no GitHub (Settings → Secrets → Actions) antes de gerar o APK.',
  },
}

// ─── Helper: stat seguro ───────────────────────────────────────
async function statArquivo(caminho) {
  try {
    const s = await fs.stat(caminho)
    return { existe: true, tamanho: s.size, modificado: s.mtime }
  } catch {
    return { existe: false, tamanho: 0, modificado: null }
  }
}

// ─── Helper: auto-descoberta de .md na raiz do repo ───────────
async function descobrirDocs() {
  try {
    const entries = await fs.readdir(REPO_ROOT, { withFileTypes: true })
    const mds = entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))

    return await Promise.all(
      mds.map(async (e) => {
        const abs  = path.join(REPO_ROOT, e.name)
        const stat = await statArquivo(abs)
        // key = nome sem extensão, em minúsculas, com hífens
        const key  = 'doc-' + e.name.replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        return {
          key,
          grupo:     'Documentação',
          label:     e.name,
          descricao: '',
          linguagem: 'markdown',
          aviso:     null,
          autoDoc:   true,   // marca que veio da descoberta automática
          caminho:   e.name, // relativo à raiz do repo
          ...stat,
        }
      })
    )
  } catch {
    return []
  }
}

// ─── GET /api/admin/arquivos ───────────────────────────────────
// Retorna: whitelist de config + todos os .md descobertos automaticamente
router.get('/', async (_req, res) => {
  const [configs, docs] = await Promise.all([
    // Config: whitelist
    Promise.all(
      Object.entries(ARQUIVOS_CONFIG).map(async ([key, info]) => {
        const abs  = path.join(REPO_ROOT, info.caminho)
        const stat = await statArquivo(abs)
        return { key, grupo: info.grupo, label: info.label, descricao: info.descricao,
                 linguagem: info.linguagem, aviso: info.aviso, autoDoc: false, ...stat }
      })
    ),
    // Docs: auto-descobertos
    descobrirDocs(),
  ])

  res.json([...configs, ...docs])
})

// ─── GET /api/admin/arquivos/:key ─────────────────────────────
router.get('/:key', async (req, res) => {
  const key = req.params.key

  // 1. Tenta na whitelist de config
  const info = ARQUIVOS_CONFIG[key]
  if (info) {
    const abs  = path.join(REPO_ROOT, info.caminho)
    const stat = await statArquivo(abs)
    const conteudo = stat.existe ? await fs.readFile(abs, 'utf-8') : ''
    return res.json({ key, ...info, conteudo, ...stat })
  }

  // 2. Tenta como doc auto-descoberto (key = 'doc-*')
  if (key.startsWith('doc-')) {
    const docs = await descobrirDocs()
    const doc  = docs.find(d => d.key === key)
    if (doc) {
      // Segurança: garante que o caminho não sai da raiz do repo
      const abs = path.resolve(REPO_ROOT, doc.caminho)
      if (!abs.startsWith(REPO_ROOT + path.sep) && abs !== REPO_ROOT) {
        return res.status(403).json({ erro: 'Acesso negado.' })
      }
      const conteudo = doc.existe ? await fs.readFile(abs, 'utf-8') : ''
      return res.json({ key, ...doc, conteudo })
    }
  }

  return res.status(404).json({ erro: 'Arquivo não encontrado.' })
})

// ─── PUT /api/admin/arquivos/:key ─────────────────────────────
// Apenas whitelist de config pode ser escrita. Docs .md são somente leitura.
router.put('/:key', async (req, res) => {
  const info = ARQUIVOS_CONFIG[req.params.key]
  if (!info) {
    return res.status(403).json({
      erro: req.params.key.startsWith('doc-')
        ? 'Arquivos de documentação são somente leitura.'
        : 'Arquivo não encontrado na lista permitida.',
    })
  }

  const { conteudo } = req.body
  if (typeof conteudo !== 'string') {
    return res.status(400).json({ erro: 'Campo "conteudo" é obrigatório e deve ser string.' })
  }

  const abs = path.join(REPO_ROOT, info.caminho)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, conteudo, 'utf-8')

  res.json({ ok: true, mensagem: `${info.label} salvo com sucesso.` })
})

export default router
