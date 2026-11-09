/**
 * github.js — Proxy Seguro para GitHub API (EXPANSÃO Sprint 3)
 *
 * Sprint 3 EXTENSÃO — ADIÇÃO PURA. Nenhuma rota existente foi alterada.
 *
 * Token GitHub lido EXCLUSIVAMENTE do ambiente backend (GITHUB_TOKEN).
 * Frontend NUNCA recebe ou vê o token.
 *
 * Rotas originais (preservadas):
 *   GET  /api/github/status
 *   GET  /api/github/repos
 *   GET  /api/github/repos/:owner/:repo
 *
 * Novas rotas (Sprint 3 Extensão):
 *   DELETE /api/github/repos/:owner/:repo
 *   GET    /api/github/repos/:owner/:repo/readme
 *   GET    /api/github/repos/:owner/:repo/commits
 *   GET    /api/github/repos/:owner/:repo/releases
 *   POST   /api/github/repos/:owner/:repo/releases
 *   GET    /api/github/repos/:owner/:repo/artifacts
 *   GET    /api/github/repos/:owner/:repo/analysis
 *   GET    /api/github/meta/:repoId
 *   PUT    /api/github/meta/:repoId
 *   GET    /api/github/projetos-locais
 */
import { Router }       from 'express'
import { autenticar }   from '../middleware/auth.js'
import { auditLog }     from '../middleware/auditLog.js'
import AuditLog         from '../models/AuditLog.js'
import GitHubMeta       from '../models/GitHubMeta.js'
import fs               from 'fs'
import path             from 'path'
import { githubFetch, GITHUB_API }  from '../utils/githubClient.js'  // Sprint 6-B: utilitário centralizado

const router = Router()

const GITHUB_ORG  = process.env.GITHUB_ORG  || null
const GITHUB_USER = process.env.GITHUB_USER || null

const PROJETOS_DIR = process.env.PROJETOS_PATH
  ? path.resolve(process.cwd(), process.env.PROJETOS_PATH)
  : path.join(process.cwd(), '..', 'projetos')

function validarNome(str) {
  return /^[a-zA-Z0-9._-]+$/.test(str)
}

/* ═══════════════════════════════════════════════════════════
   CRIAR REPOSITÓRIO — Sprint 10
   Cria um novo repositório na conta autenticada (user ou org).

   POST /api/github/repos/criar
   Body: { nome, descricao?, privado?, org? }
═══════════════════════════════════════════════════════════ */
router.post('/repos/criar', autenticar, async (req, res) => {
  const { nome, descricao = '', privado = true, org } = req.body
  if (!nome || !/^[a-zA-Z0-9._-]{1,100}$/.test(nome))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })

  try {
    const endpoint = org ? `/orgs/${org}/repos` : '/user/repos'
    const repo = await githubFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        name:         nome,
        description:  descricao,
        private:      privado,
        auto_init:    false,  // não cria README — o commit-stream vai inicializar
      }),
    })
    res.json({
      ok:           true,
      nomeCompleto: repo.full_name,
      owner:        repo.owner.login,
      repo:         repo.name,
      url:          repo.html_url,
      privado:      repo.private,
    })
  } catch (err) {
    const status = err.status || 500
    const msg = status === 422
      ? `Já existe um repositório com o nome "${nome}" nessa conta.`
      : err.message
    res.status(status).json({ erro: msg })
  }
})

/* ═══════════════════════════════════════════════════════════
   ROTAS ORIGINAIS (preservadas)
═══════════════════════════════════════════════════════════ */

router.get('/status', autenticar, async (req, res) => {
  try {
    const user = await githubFetch('/user')
    res.json({
      ok: true, login: user.login, nome: user.name,
      avatar: user.avatar_url, repos: user.public_repos,
      empresa: user.company, url: user.html_url,
    })
  } catch (err) {
    if (err.message.includes('GITHUB_TOKEN')) return res.status(503).json({ ok: false, erro: err.message })
    res.status(err.status || 500).json({ ok: false, erro: err.message })
  }
})

router.get('/repos', autenticar, async (req, res) => {
  const { page = 1, per_page = 30, sort = 'updated', type = 'all' } = req.query
  try {
    let repos
    if (GITHUB_ORG) {
      repos = await githubFetch(`/orgs/${GITHUB_ORG}/repos?sort=${sort}&per_page=${per_page}&page=${page}&type=${type}`)
    } else if (GITHUB_USER) {
      repos = await githubFetch(`/users/${GITHUB_USER}/repos?sort=${sort}&per_page=${per_page}&page=${page}&type=${type}`)
    } else {
      repos = await githubFetch(`/user/repos?sort=${sort}&per_page=${per_page}&page=${page}&type=${type}&affiliation=owner,collaborator`)
    }
    const lista = repos.map(r => ({
      id: r.id, nome: r.name, nomeCompleto: r.full_name, descricao: r.description,
      privado: r.private, url: r.html_url, linguagem: r.language,
      stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count,
      branch: r.default_branch, ultimaAtualizacao: r.updated_at, criadoEm: r.created_at,
      temas: r.topics || [], arquivado: r.archived,
    }))
    res.json({ repos: lista, total: lista.length })
  } catch (err) {
    if (err.message.includes('GITHUB_TOKEN')) return res.status(503).json({ erro: err.message, repos: [] })
    res.status(err.status || 500).json({ erro: err.message, repos: [] })
  }
})

router.get('/repos/:owner/:repo', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  try {
    const [repoData, languages] = await Promise.all([
      githubFetch(`/repos/${owner}/${repo}`),
      githubFetch(`/repos/${owner}/${repo}/languages`).catch(() => ({})),
    ])
    res.json({
      id: repoData.id, nome: repoData.name, nomeCompleto: repoData.full_name,
      descricao: repoData.description, privado: repoData.private, url: repoData.html_url,
      linguagem: repoData.language, linguagens: Object.keys(languages),
      stars: repoData.stargazers_count, forks: repoData.forks_count,
      issues: repoData.open_issues_count, branch: repoData.default_branch,
      temas: repoData.topics || [], arquivado: repoData.archived,
      ultimaAtualizacao: repoData.updated_at, criadoEm: repoData.created_at,
      license: repoData.license?.name || null, tamanho: repoData.size,
    })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════
   ROTAS NOVAS — Sprint 3 Extensão
═══════════════════════════════════════════════════════════ */

/* DELETE /api/github/repos/:owner/:repo */
router.delete('/repos/:owner/:repo', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  const { confirmar, confirmarNome } = req.body
  if (!confirmar || confirmarNome !== repo) {
    return res.status(400).json({ erro: `Confirmação inválida. Envie { confirmar: true, confirmarNome: "${repo}" }` })
  }
  try {
    await githubFetch(`/repos/${owner}/${repo}`, { method: 'DELETE' })
    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'excluir', recurso: 'github_repo',
      recurso_id: `${owner}/${repo}`, payload: { owner, repo },
      ip: req.ip, request_id: req.requestId || null,
    })
    await GitHubMeta.deleteMany({ nomeCompleto: `${owner}/${repo}` }).catch(() => {})
    res.json({ ok: true, mensagem: `Repositório ${owner}/${repo} excluído com sucesso.` })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* GET /api/github/repos/:owner/:repo/readme */
router.get('/repos/:owner/:repo/readme', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/readme`)
    res.json({
      nome: data.name,
      conteudo: Buffer.from(data.content || '', 'base64').toString('utf8'),
      sha: data.sha, tamanho: data.size,
    })
  } catch (err) {
    if (err.status === 404) return res.json({ conteudo: null })
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* GET /api/github/repos/:owner/:repo/commits */
router.get('/repos/:owner/:repo/commits', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  const { per_page = 20, page = 1 } = req.query
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  try {
    const commits = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=${per_page}&page=${page}`)
    const lista = commits.map(c => ({
      sha: c.sha.slice(0, 7), mensagem: c.commit.message.split('\n')[0],
      autor: c.commit.author.name, data: c.commit.author.date,
      url: c.html_url, avatar: c.author?.avatar_url || null,
    }))
    res.json({ commits: lista })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message, commits: [] })
  }
})

/* GET /api/github/repos/:owner/:repo/releases */
router.get('/repos/:owner/:repo/releases', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  const { per_page = 10 } = req.query
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  try {
    const releases = await githubFetch(`/repos/${owner}/${repo}/releases?per_page=${per_page}`)
    const lista = releases.map(r => ({
      id: r.id, tag: r.tag_name, nome: r.name, descricao: r.body,
      rascunho: r.draft, preRelease: r.prerelease,
      criadoEm: r.created_at, publicadoEm: r.published_at,
      url: r.html_url, autor: r.author?.login || null,
      assets: r.assets.map(a => ({
        id: a.id, nome: a.name, tamanho: a.size_in_bytes,
        downloads: a.download_count, url: a.browser_download_url, tipo: a.content_type,
      })),
    }))
    res.json({ releases: lista })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message, releases: [] })
  }
})

/* POST /api/github/repos/:owner/:repo/releases */
router.post('/repos/:owner/:repo/releases', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  const { tag, nome, descricao, rascunho = false, preRelease = false } = req.body
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  if (!tag) return res.status(400).json({ erro: 'Campo obrigatório: tag' })
  try {
    const release = await githubFetch(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, name: nome || tag, body: descricao || '', draft: rascunho, prerelease: preRelease }),
    })
    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'criar', recurso: 'github_release',
      recurso_id: `${owner}/${repo}@${tag}`, payload: { owner, repo, tag, nome },
      ip: req.ip, request_id: req.requestId || null,
    })
    res.status(201).json({ ok: true, id: release.id, tag: release.tag_name, url: release.html_url })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* GET /api/github/repos/:owner/:repo/artifacts */
router.get('/repos/:owner/:repo/artifacts', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/actions/artifacts?per_page=20`)
    const lista = (data.artifacts || []).map(a => ({
      id: a.id, nome: a.name, tamanho: a.size_in_bytes,
      expiradoEm: a.expires_at, criadoEm: a.created_at,
      expirado: a.expired, url: a.archive_download_url,
      workflowRunId: a.workflow_run?.id || null,
    }))
    res.json({ artifacts: lista, total: data.total_count || lista.length })
  } catch (err) {
    if (err.status === 404) return res.json({ artifacts: [], total: 0 })
    res.status(err.status || 500).json({ erro: err.message, artifacts: [] })
  }
})

/* GET /api/github/repos/:owner/:repo/analysis */
router.get('/repos/:owner/:repo/analysis', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo)) return res.status(400).json({ erro: 'Nome inválido.' })
  try {
    const [repoR, langR, commitR, contentsR] = await Promise.allSettled([
      githubFetch(`/repos/${owner}/${repo}`),
      githubFetch(`/repos/${owner}/${repo}/languages`),
      githubFetch(`/repos/${owner}/${repo}/commits?per_page=30`),
      githubFetch(`/repos/${owner}/${repo}/contents`),
    ])
    const r     = repoR.status === 'fulfilled' ? repoR.value : {}
    const langs = langR.status === 'fulfilled' ? langR.value : {}
    const cms   = commitR.status === 'fulfilled' ? commitR.value : []
    const files = contentsR.status === 'fulfilled' ? (contentsR.value || []) : []
    const fileNames = files.map(f => f.name?.toLowerCase() || '')
    const langKeys  = Object.keys(langs)

    const stack = []
    if (langKeys.includes('JavaScript') || langKeys.includes('TypeScript')) {
      if (fileNames.includes('package.json')) {
        if (fileNames.some(f => f.includes('vite') || f === 'vite.config.js' || f === 'vite.config.ts')) stack.push('React/Vite')
        else if (fileNames.includes('next.config.js') || fileNames.includes('next.config.mjs')) stack.push('Next.js')
        else stack.push(langKeys.includes('TypeScript') ? 'TypeScript/Node' : 'Node.js')
      }
    }
    if (langKeys.includes('Python')) stack.push(fileNames.includes('manage.py') ? 'Django' : 'Python')
    if (langKeys.includes('Kotlin')) stack.push(fileNames.some(f => f.includes('androidmanifest')) ? 'Android/Kotlin' : 'Kotlin')
    if (langKeys.includes('Java'))   stack.push(fileNames.some(f => f.includes('androidmanifest')) ? 'Android/Java' : 'Java')
    if (langKeys.includes('Dart'))   stack.push('Flutter')
    if (langKeys.includes('Swift'))  stack.push('iOS/Swift')
    if (langKeys.includes('PHP'))    stack.push('PHP')
    if (langKeys.includes('Go'))     stack.push('Go')
    if (langKeys.includes('Rust'))   stack.push('Rust')
    if (stack.length === 0 && langKeys.length > 0) stack.push(langKeys[0])

    let deps = []
    try {
      const pkgFile = files.find(f => f.name === 'package.json')
      if (pkgFile?.download_url) {
        const pkgRes = await fetch(pkgFile.download_url)
        const pkg = await pkgRes.json()
        deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).slice(0, 12)
      }
    } catch { /* opcional */ }

    const diasSemAtividade = r.updated_at
      ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86400000) : 9999
    const maturidade = diasSemAtividade < 30 ? 'ativo' : diasSemAtividade < 180 ? 'moderado' : diasSemAtividade < 365 ? 'inativo' : 'abandonado'
    const freqCommits = Array.isArray(cms) ? cms.length : 0
    const frequencia  = freqCommits >= 20 ? 'alta' : freqCommits >= 8 ? 'média' : freqCommits >= 2 ? 'baixa' : 'inativa'
    const totalLinhas = Object.values(langs).reduce((a, b) => a + b, 0)
    const complexidade = totalLinhas > 100000 ? 'alta' : totalLinhas > 20000 ? 'média' : totalLinhas > 3000 ? 'baixa' : 'mínima'

    res.json({
      stack, linguagens: langs, maturidade, frequenciaCommits: frequencia,
      diasSemAtividade, complexidade, dependencias: deps,
      totalArquivos: files.length,
      hasCI:     fileNames.includes('.github') || fileNames.some(f => f.includes('ci')),
      hasDocker: fileNames.includes('dockerfile') || fileNames.includes('docker-compose.yml'),
      hasTestes: fileNames.some(f => ['test','spec','jest','vitest','__tests__'].some(k => f.includes(k))),
      temLicense: fileNames.some(f => f.startsWith('license')),
    })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* GET /api/github/meta/:repoId */
router.get('/meta/:repoId', autenticar, async (req, res) => {
  try {
    const meta = await GitHubMeta.findOne({ repoId: Number(req.params.repoId) })
    res.json(meta || {
      repoId: Number(req.params.repoId), alias: null, tags: [],
      favorito: false, statusInterno: 'ativo', observacoes: null, projetoLocal: null,
    })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* PUT /api/github/meta/:repoId */
router.put('/meta/:repoId', autenticar, auditLog('github_meta'), async (req, res) => {
  const { alias, tags, favorito, statusInterno, observacoes, projetoLocal, nomeCompleto } = req.body
  try {
    const meta = await GitHubMeta.findOneAndUpdate(
      { repoId: Number(req.params.repoId) },
      { $set: { alias, tags, favorito, statusInterno, observacoes, projetoLocal, nomeCompleto } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.json(meta)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* GET /api/github/projetos-locais */
router.get('/projetos-locais', autenticar, async (req, res) => {
  try {
    if (!fs.existsSync(PROJETOS_DIR)) return res.json({ projetos: [] })
    const itens = fs.readdirSync(PROJETOS_DIR, { withFileTypes: true })
    res.json({ projetos: itens.filter(i => i.isDirectory()).map(i => ({ nome: i.name })) })
  } catch {
    res.json({ projetos: [] })
  }
})

/* ═══════════════════════════════════════════════════════════
   SECRETS — GitHub Actions Secrets (Sprint 4)
   GitHub NUNCA retorna o valor dos secrets — apenas os nomes.
   Para criar/atualizar: o valor é criptografado com a chave
   pública do repositório via NaCl Box (libsodium).
═══════════════════════════════════════════════════════════ */

/* Helper: criptografia NaCl Box para secrets do GitHub */
async function encryptarSecret(publicKeyB64, valor) {
  try {
    const _sodium = await import('libsodium-wrappers')
    await _sodium.default.ready
    const sodium = _sodium.default
    const binKey = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL)
    const binVal = sodium.from_string(valor)
    const encrypted = sodium.crypto_box_seal(binVal, binKey)
    return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL)
  } catch {
    return null
  }
}

/* GET /api/github/repos/:owner/:repo/secrets */
router.get('/repos/:owner/:repo/secrets', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/actions/secrets?per_page=100`)
    const lista = (data.secrets || []).map(s => ({
      nome:        s.name,
      criadoEm:   s.created_at,
      atualizadoEm: s.updated_at,
    }))
    res.json({ secrets: lista, total: data.total_count || lista.length })
  } catch (err) {
    if (err.status === 404) return res.json({ secrets: [], total: 0 })
    res.status(err.status || 500).json({ erro: err.message, secrets: [] })
  }
})

/* GET /api/github/repos/:owner/:repo/secrets/public-key */
router.get('/repos/:owner/:repo/secrets/public-key', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/actions/secrets/public-key`)
    // Retorna apenas key_id, NÃO a key pública (o backend faz a criptografia)
    res.json({ key_id: data.key_id, disponivel: !!data.key })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* PUT /api/github/repos/:owner/:repo/secrets/:secretName */
router.put('/repos/:owner/:repo/secrets/:secretName', autenticar, async (req, res) => {
  const { owner, repo, secretName } = req.params
  const { valor } = req.body
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  if (!secretName || !/^[A-Z_][A-Z0-9_]*$/.test(secretName))
    return res.status(400).json({ erro: 'Nome do secret inválido. Use apenas MAIÚSCULAS, números e _.' })
  if (!valor || typeof valor !== 'string')
    return res.status(400).json({ erro: 'Campo obrigatório: valor' })

  try {
    const pkData = await githubFetch(`/repos/${owner}/${repo}/actions/secrets/public-key`)
    const encryptedValue = await encryptarSecret(pkData.key, valor)
    if (!encryptedValue) {
      return res.status(500).json({
        erro: 'Módulo de criptografia (libsodium-wrappers) não disponível. Execute: npm install',
      })
    }

    await githubFetch(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, {
      method: 'PUT',
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id: pkData.key_id }),
    })

    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'criar', recurso: 'github_secret',
      recurso_id: `${owner}/${repo}:${secretName}`, payload: { owner, repo, secretName },
      ip: req.ip, request_id: req.requestId || null,
    })

    res.json({ ok: true, mensagem: `Secret "${secretName}" salvo com sucesso.` })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* DELETE /api/github/repos/:owner/:repo/secrets/:secretName */
router.delete('/repos/:owner/:repo/secrets/:secretName', autenticar, async (req, res) => {
  const { owner, repo, secretName } = req.params
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  if (!secretName) return res.status(400).json({ erro: 'Nome do secret obrigatório.' })
  try {
    await githubFetch(`/repos/${owner}/${repo}/actions/secrets/${secretName}`, { method: 'DELETE' })
    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'excluir', recurso: 'github_secret',
      recurso_id: `${owner}/${repo}:${secretName}`, payload: { owner, repo, secretName },
      ip: req.ip, request_id: req.requestId || null,
    })
    res.json({ ok: true, mensagem: `Secret "${secretName}" removido.` })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════
   WORKFLOWS & RUNS — GitHub Actions (Sprint 4)
═══════════════════════════════════════════════════════════ */

/* GET /api/github/repos/:owner/:repo/workflows */
router.get('/repos/:owner/:repo/workflows', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/actions/workflows?per_page=50`)
    const lista = (data.workflows || []).map(w => ({
      id:       w.id,
      nome:     w.name,
      arquivo:  w.path,
      estado:   w.state, // active | disabled_manually | disabled_inactivity
      criadoEm: w.created_at,
      url:      w.html_url,
    }))
    res.json({ workflows: lista, total: data.total_count || lista.length })
  } catch (err) {
    if (err.status === 404) return res.json({ workflows: [], total: 0 })
    res.status(err.status || 500).json({ erro: err.message, workflows: [] })
  }
})

/* GET /api/github/repos/:owner/:repo/workflows/:workflowId/runs */
router.get('/repos/:owner/:repo/workflows/:workflowId/runs', autenticar, async (req, res) => {
  const { owner, repo, workflowId } = req.params
  const { per_page = 15, page = 1 } = req.query
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })
  try {
    const data = await githubFetch(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=${per_page}&page=${page}`
    )
    const lista = (data.workflow_runs || []).map(r => ({
      id:          r.id,
      nome:        r.name,
      status:      r.status,       // queued | in_progress | completed
      conclusao:   r.conclusion,   // success | failure | cancelled | skipped | null
      branch:      r.head_branch,
      sha:         r.head_sha?.slice(0, 7),
      mensagem:    r.head_commit?.message?.split('\n')[0] || null,
      criadoEm:   r.created_at,
      atualizadoEm: r.updated_at,
      url:         r.html_url,
      duracaoMs:   r.run_started_at
        ? (new Date(r.updated_at) - new Date(r.run_started_at))
        : null,
    }))
    res.json({ runs: lista, total: data.total_count || lista.length })
  } catch (err) {
    if (err.status === 404) return res.json({ runs: [], total: 0 })
    res.status(err.status || 500).json({ erro: err.message, runs: [] })
  }
})

/* GET /api/github/runs/:runId/jobs — lista jobs de um run */
router.get('/runs/:runId/jobs', autenticar, async (req, res) => {
  const { runId } = req.params
  const { owner, repo } = req.query
  if (!owner || !repo || !validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Parâmetros owner e repo obrigatórios.' })
  try {
    const data = await githubFetch(
      `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=30`
    )
    const lista = (data.jobs || []).map(j => ({
      id:        j.id,
      nome:      j.name,
      status:    j.status,
      conclusao: j.conclusion,
      inicioEm:  j.started_at,
      fimEm:     j.completed_at,
      steps: (j.steps || []).map(s => ({
        numero:    s.number,
        nome:      s.name,
        status:    s.status,
        conclusao: s.conclusion,
        inicioEm:  s.started_at,
        fimEm:     s.completed_at,
      })),
    }))
    res.json({ jobs: lista, total: lista.length })
  } catch (err) {
    res.status(err.status || 500).json({ erro: err.message, jobs: [] })
  }
})

/* GET /api/github/jobs/:jobId/logs — logs inline de um job (text/plain) */
router.get('/jobs/:jobId/logs', autenticar, async (req, res) => {
  const { jobId } = req.params
  const { owner, repo } = req.query
  if (!owner || !repo || !validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Parâmetros owner e repo obrigatórios.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado.' })
  try {
    // GitHub retorna 302 → URL assinada com o log em text/plain
    const resp = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
        redirect: 'follow',
      }
    )
    if (!resp.ok) {
      const body = await resp.text()
      return res.status(resp.status).json({ erro: body || `Erro ${resp.status}` })
    }
    const texto = await resp.text()
    // Limita a 200KB para não estourar o response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(texto.slice(0, 200 * 1024))
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* GET /api/github/runs/:runId/logs/download — proxy de download do zip de logs */
router.get('/runs/:runId/logs/download', autenticar, async (req, res) => {
  const { runId } = req.params
  const { owner, repo } = req.query
  if (!owner || !repo || !validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Parâmetros owner e repo obrigatórios.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado.' })
  try {
    const resp = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
        redirect: 'follow',
      }
    )
    if (!resp.ok) {
      const body = await resp.text()
      return res.status(resp.status).send(body || `Erro ${resp.status}`)
    }
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="logs-run-${runId}.zip"`)
    // Streamed
    const { Readable } = await import('stream')
    Readable.fromWeb(resp.body).pipe(res)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* GET /api/github/artifacts/:artifactId/download — proxy APK / artefato */
router.get('/artifacts/:artifactId/download', autenticar, async (req, res) => {
  const { artifactId } = req.params
  const { owner, repo, nome } = req.query
  if (!owner || !repo || !validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Parâmetros owner e repo obrigatórios.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado.' })
  try {
    const resp = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
        redirect: 'follow',
      }
    )
    if (!resp.ok) {
      const body = await resp.text()
      return res.status(resp.status).send(body || `Erro ${resp.status}`)
    }
    const fileName = nome ? `${nome}.zip` : `artifact-${artifactId}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    const { Readable } = await import('stream')
    Readable.fromWeb(resp.body).pipe(res)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD ZIP — Proxy autenticado, stream direto ao browser
   Evita expor o GITHUB_TOKEN no frontend.

   GET /api/github/repos/:owner/:repo/download-zip
   Query: branch (opcional — usa default_branch se omitido)
═══════════════════════════════════════════════════════════ */
router.get('/repos/:owner/:repo/download-zip', autenticar, async (req, res) => {
  const { owner, repo }     = req.params
  const { branch: qBranch } = req.query

  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado.' })

  try {
    let branch = qBranch
    if (!branch) {
      try {
        const repoData = await githubFetch(`/repos/${owner}/${repo}`)
        branch = repoData.default_branch || 'main'
      } catch { branch = 'main' }
    }

    const zipResp = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/zipball/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(90_000),
      }
    )

    if (!zipResp.ok) {
      const body = await zipResp.text().catch(() => '')
      const msg  = zipResp.status === 404
        ? `Repositório "${owner}/${repo}" não encontrado ou sem acesso.`
        : zipResp.status === 403
          ? 'Acesso negado. Verifique os escopos do GITHUB_TOKEN.'
          : `GitHub retornou ${zipResp.status}: ${body.slice(0, 200)}`
      return res.status(zipResp.status).json({ erro: msg })
    }

    const fileName = `${repo}-${branch}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

    const cl = zipResp.headers.get('content-length')
    if (cl) res.setHeader('Content-Length', cl)

    const { Readable } = await import('stream')
    Readable.fromWeb(zipResp.body).pipe(res)

  } catch (err) {
    if (!res.headersSent)
      res.status(500).json({ erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════
   SALVAR PROJETO — Sprint 5
   Baixa o zipball do branch padrão do repositório e extrai
   em PROJETOS_DIR/{nomeProjeto}/, com proteção contra Zip Slip.

   POST /api/github/repos/:owner/:repo/salvar-projeto
   Body: { nomeProjeto?: string, substituir?: boolean }
═══════════════════════════════════════════════════════════ */
router.post('/repos/:owner/:repo/salvar-projeto', autenticar, async (req, res) => {
  const { owner, repo } = req.params
  if (!validarNome(owner) || !validarNome(repo))
    return res.status(400).json({ erro: 'Nome de repositório inválido.' })

  // ── Validar e sanitizar nomeProjeto ───────────────────────
  let nomeProjeto = (req.body.nomeProjeto || repo).toString().trim()
  // Apenas letras, números, ponto, hífen e underscore — sem path traversal
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(nomeProjeto)) {
    return res.status(400).json({
      erro: 'Nome de projeto inválido. Use apenas letras, números, ., - ou _ (máx. 60 caracteres).',
    })
  }

  const substituir = !!req.body.substituir
  const destDir    = path.join(PROJETOS_DIR, nomeProjeto)

  // ── Verificar se pasta destino já existe ─────────────────
  if (fs.existsSync(destDir) && !substituir) {
    return res.status(409).json({
      erro: `Já existe um projeto chamado "${nomeProjeto}". Marque "Substituir" para sobrescrever.`,
    })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado.' })

  try {
    // ── 1. Descobrir branch padrão ───────────────────────────
    let defaultBranch = 'main'
    try {
      const repoData = await githubFetch(`/repos/${owner}/${repo}`)
      defaultBranch = repoData.default_branch || 'main'
    } catch { /* usa 'main' como fallback */ }

    // ── 2. Baixar zipball (segue redirect automático) ────────
    const zipResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/zipball/${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(90_000),   // 90s timeout
      }
    )

    if (!zipResp.ok) {
      const body = await zipResp.text().catch(() => '')
      const msg  = zipResp.status === 404
        ? `Repositório "${owner}/${repo}" não encontrado ou sem acesso.`
        : zipResp.status === 403
          ? 'Acesso negado. Verifique os escopos do GITHUB_TOKEN.'
          : `GitHub retornou ${zipResp.status}: ${body.slice(0, 200)}`
      return res.status(zipResp.status).json({ erro: msg })
    }

    // ── 3. Carregar ZIP inteiro na memória ───────────────────
    // Não usamos arquivo temporário em /tmp — ambientes de container (Railway,
    // Render, Fly.io) frequentemente negam escrita em /tmp. O buffer já está
    // na memória após arrayBuffer(); gravá-lo em disco e lê-lo de volta só
    // adiciona risco de ENOENT sem nenhum benefício.
    const zipBuffer = Buffer.from(await zipResp.arrayBuffer())
    if (zipBuffer.length === 0) {
      throw new Error('O arquivo ZIP recebido do GitHub está vazio. Tente novamente.')
    }

    // ── 4. Garantir que PROJETOS_DIR existe ──────────────────
    if (!fs.existsSync(PROJETOS_DIR)) {
      fs.mkdirSync(PROJETOS_DIR, { recursive: true })
    }

    // ── 5. Se substituir, remover destino existente ──────────
    if (fs.existsSync(destDir) && substituir) {
      fs.rmSync(destDir, { recursive: true, force: true })
    }
    fs.mkdirSync(destDir, { recursive: true })

    // ── 6. Extrair ZIP direto da memória (sem arquivo temporário) ─
    // O zipball do GitHub gera: owner-repo-sha/...
    // Precisamos strip do primeiro nível de diretório.
    const { default: unzipper } = await import('unzipper')
    const { Readable }          = await import('stream')
    let   prefixo               = null   // detectado na primeira entry
    const arquivosExtraidos     = []     // relatório de sincronização
    const errosExtracao         = []

    await new Promise((resolve, reject) => {
      Readable.from(zipBuffer)           // ← buffer direto, sem disco
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          const entryPath = entry.path

          // Detecta prefixo na primeira entry (ex: "owner-repo-abc123/")
          if (prefixo === null) {
            const firstSlash = entryPath.indexOf('/')
            prefixo = firstSlash !== -1 ? entryPath.slice(0, firstSlash + 1) : ''
          }

          // Remove o prefixo do nível raiz
          const relPath = prefixo && entryPath.startsWith(prefixo)
            ? entryPath.slice(prefixo.length)
            : entryPath

          // ── Proteção Zip Slip ────────────────────────────
          // Resolve o caminho absoluto e garante que está dentro de destDir
          const absTarget = path.resolve(destDir, relPath)
          if (!absTarget.startsWith(destDir + path.sep) && absTarget !== destDir) {
            entry.autodrain()   // descarta a entry maliciosa
            errosExtracao.push({ arquivo: relPath, motivo: 'path traversal bloqueado' })
            return
          }

          if (entry.type === 'Directory') {
            fs.mkdirSync(absTarget, { recursive: true })
            entry.autodrain()
          } else {
            // Garante que o diretório pai existe (ZIPs às vezes omitem entries de diretório)
            fs.mkdirSync(path.dirname(absTarget), { recursive: true })
            if (relPath) arquivosExtraidos.push(relPath)
            entry.pipe(fs.createWriteStream(absTarget))
              .on('error', reject)
          }
        })
        .on('close', resolve)
        .on('error', reject)
    })

    // ── 7. Nada a limpar — não há arquivo temporário ─────────

    // ── 8. AuditLog ──────────────────────────────────────────
    await AuditLog.create({
      admin_id:    req.usuario._id,
      admin_email: req.usuario.email,
      acao:        'criar',
      recurso:     'projeto_local',
      recurso_id:  nomeProjeto,
      payload:     { owner, repo, nomeProjeto, substituir, defaultBranch },
      ip:          req.ip,
      request_id:  req.requestId || null,
    })

    // ── 9. Resposta com relatório de sincronização ───────────
    res.json({
      ok:            true,
      nomeProjeto,
      branch:        defaultBranch,
      caminho:       path.join('projetos', nomeProjeto),
      mensagem:      `Repositório "${owner}/${repo}" salvo em projetos/${nomeProjeto}/`,
      relatorio: {
        totalArquivos:   arquivosExtraidos.length,
        arquivos:        arquivosExtraidos,
        erros:           errosExtracao,
        tamanhoZipBytes: zipBuffer.length,
        sincronizadoEm:  new Date().toISOString(),
        operacao:        substituir ? 'substituicao_completa' : 'criacao',
      },
    })

  } catch (err) {
    // Limpa resíduos em caso de erro (não há tmpFile para remover)
    try { if (fs.existsSync(destDir) && !req.body.substituir) fs.rmSync(destDir, { recursive: true, force: true }) } catch { /* ok */ }

    const msg = err.name === 'TimeoutError'
      ? 'Download excedeu o tempo limite (90s). O repositório pode ser muito grande.'
      : err.message || 'Erro interno ao salvar projeto.'

    res.status(500).json({ erro: msg })
  }
})

export default router
