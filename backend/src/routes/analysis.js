/**
 * analysis.js — Rotas de Análise Inteligente (Sprint 4)
 *
 * Sprint 4 — ADIÇÃO PURA. Nenhuma rota existente foi alterada.
 * Sprint 6-B — Refatorado:
 *   - githubFetch() extraída para utils/githubClient.js (elimina duplicação)
 *   - Limites de custo adicionados (HISTORICO_MAX_MSGS, CONTEXTO_MAX_CHARS)
 *   - Provedor de IA abstraído via utils/aiClient.js (suporta Groq e Anthropic)
 *
 * Rotas:
 *   GET  /api/analysis/overview            → resumo geral do sistema
 *   GET  /api/analysis/sync/:projectName   → comparação local ↔ GitHub
 *   POST /api/analysis/ai/chat             → IA Assistant
 *   GET  /api/analysis/ai/info             → info do provedor IA ativo
 *
 * Segurança:
 *   - IA NÃO executa código automaticamente
 *   - apenas sugere ações
 *   - análises logadas no AuditLog
 */
import { Router }      from 'express'
import fs              from 'fs'
import path            from 'path'
import { autenticar }  from '../middleware/auth.js'
import AuditLog        from '../models/AuditLog.js'
import { githubFetch } from '../utils/githubClient.js'
import {
  enviarMensagem,
  provedorInfo,
  truncarHistorico,
  truncarContexto,
} from '../utils/aiClient.js'
import {
  analisarProjetosLocais,
  analisarRepos,
  gerarOverview,
  compararLocalComGitHub,
} from '../utils/rulesEngine.js'

const router = Router()

const PROJETOS_DIR = process.env.PROJETOS_PATH
  ? path.resolve(process.cwd(), process.env.PROJETOS_PATH)
  : path.join(process.cwd(), '..', 'projetos')

function validarNome(str) {
  return /^[a-zA-Z0-9._-]+$/.test(str)
}

function lerProjetosLocais() {
  if (!fs.existsSync(PROJETOS_DIR)) return []
  try {
    const entradas = fs.readdirSync(PROJETOS_DIR, { withFileTypes: true })
    return entradas
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(d => {
        const dirPath = path.join(PROJETOS_DIR, d.name)
        try {
          const stat  = fs.statSync(dirPath)
          const techs = []
          const checks = [
            { file: 'package.json',       tech: 'Node.js'   },
            { file: 'requirements.txt',   tech: 'Python'    },
            { file: 'Cargo.toml',         tech: 'Rust'      },
            { file: 'go.mod',             tech: 'Go'        },
            { file: 'pom.xml',            tech: 'Java'      },
            { file: 'composer.json',      tech: 'PHP'       },
            { file: 'Gemfile',            tech: 'Ruby'      },
            { file: 'Dockerfile',         tech: 'Docker'    },
            { file: 'docker-compose.yml', tech: 'Docker'    },
          ]
          for (const { file, tech } of checks) {
            if (!techs.includes(tech) && fs.existsSync(path.join(dirPath, file))) techs.push(tech)
          }
          let pkg = null
          const pkgPath = path.join(dirPath, 'package.json')
          if (fs.existsSync(pkgPath)) {
            try {
              const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
              pkg = {
                nome: raw.name || null,
                versao: raw.version || null,
                descricao: raw.description || null,
                dependencias: Object.keys({ ...(raw.dependencies || {}), ...(raw.devDependencies || {}) }).slice(0, 20),
              }
            } catch { /* ignora */ }
          }
          const arquivos = fs.readdirSync(dirPath, { withFileTypes: true })
            .map(e => ({ nome: e.name, tipo: e.isDirectory() ? 'dir' : 'arquivo' }))
            .slice(0, 50)
          return { nome: d.name, ultimaAlteracao: stat.mtime, tecnologias: techs, package: pkg, arquivos }
        } catch {
          return { nome: d.name, ultimaAlteracao: null, tecnologias: [], package: null, arquivos: [] }
        }
      })
  } catch {
    return []
  }
}

async function buscarReposGitHub() {
  const GITHUB_ORG  = process.env.GITHUB_ORG  || null
  const GITHUB_USER = process.env.GITHUB_USER || null
  let repos
  if (GITHUB_ORG) {
    repos = await githubFetch(`/orgs/${GITHUB_ORG}/repos?sort=updated&per_page=100`)
  } else if (GITHUB_USER) {
    repos = await githubFetch(`/users/${GITHUB_USER}/repos?sort=updated&per_page=100`)
  } else {
    repos = await githubFetch(`/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator`)
  }
  return repos.map(r => ({
    id: r.id, nome: r.name, nomeCompleto: r.full_name, descricao: r.description,
    privado: r.private, url: r.html_url, linguagem: r.language,
    stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count,
    branch: r.default_branch, ultimaAtualizacao: r.updated_at, criadoEm: r.created_at,
    temas: r.topics || [], arquivado: r.archived,
  }))
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/analysis/overview
═══════════════════════════════════════════════════════════════ */
router.get('/overview', autenticar, async (req, res) => {
  try {
    const projetosRaw        = lerProjetosLocais()
    const projetosAnalisados = analisarProjetosLocais(projetosRaw)
    let reposAnalisados = [], githubDisponivel = false, githubErro = null
    try {
      reposAnalisados  = analisarRepos(await buscarReposGitHub())
      githubDisponivel = true
    } catch (e) { githubErro = e.message }
    const overview = gerarOverview(projetosAnalisados, reposAnalisados)
    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'analisar', recurso: 'analysis_overview', recurso_id: 'sistema',
      payload: { score: overview.saude.score, alertasCriticos: overview.alertasCriticos.length },
      ip: req.ip, request_id: req.requestId || null,
    }).catch(() => {})
    res.json({ ok: true, timestamp: new Date().toISOString(), ...overview,
      projetos: projetosAnalisados, repos: reposAnalisados,
      github: { disponivel: githubDisponivel, erro: githubErro } })
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════════
   GET /api/analysis/sync/:projectName
═══════════════════════════════════════════════════════════════ */
router.get('/sync/:projectName', autenticar, async (req, res) => {
  const { projectName } = req.params
  if (projectName.includes('..') || projectName.includes('/') || projectName.includes('\\')) {
    return res.status(400).json({ erro: 'Nome de projeto inválido.' })
  }
  const dirPath = path.join(PROJETOS_DIR, projectName)
  if (!fs.existsSync(dirPath)) {
    return res.status(404).json({ erro: `Projeto local "${projectName}" não encontrado.` })
  }
  try {
    const projetosRaw  = lerProjetosLocais()
    const projetoLocal = projetosRaw.find(p => p.nome === projectName)
    if (!projetoLocal) return res.status(404).json({ erro: `Projeto "${projectName}" não encontrado.` })
    let repo = null, commits = [], githubErro = null
    try {
      const GH_USER = process.env.GITHUB_USER || process.env.GITHUB_ORG
      if (!GH_USER) throw new Error('GITHUB_USER ou GITHUB_ORG não configurado')
      try {
        repo = await githubFetch(`/repos/${GH_USER}/${projectName}`)
        if (repo) {
          const commitsData = await githubFetch(`/repos/${GH_USER}/${projectName}/commits?per_page=20`)
          commits = commitsData.map(c => ({
            sha: c.sha.slice(0, 7), mensagem: c.commit.message.split('\n')[0],
            autor: c.commit.author.name, data: c.commit.author.date,
          }))
        }
      } catch (e) {
        if (e.status !== 404) throw e
        githubErro = `Repositório "${projectName}" não encontrado no GitHub.`
      }
    } catch (e) { githubErro = e.message }
    if (!repo) {
      return res.json({ ok: true, statusSync: 'sem_repositorio',
        github: { disponivel: false, erro: githubErro },
        projetoLocal: analisarProjetosLocais([projetoLocal])[0], divergencias: [], commits: [] })
    }
    const repoNorm = {
      nome: repo.name, nomeCompleto: repo.full_name, linguagem: repo.language,
      ultimaAtualizacao: repo.updated_at, arquivado: repo.archived,
      issues: repo.open_issues_count, stars: repo.stargazers_count, url: repo.html_url,
    }
    const comparacao = compararLocalComGitHub(projetoLocal, repoNorm, commits)
    res.json({ ok: true, ...comparacao, commits,
      projetoLocal: analisarProjetosLocais([projetoLocal])[0],
      repo: repoNorm, github: { disponivel: true, erro: null } })
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message })
  }
})

/* ═══════════════════════════════════════════════════════════════
   GET /api/analysis/ai/info
   Informa qual provedor de IA está ativo e se está disponível.
═══════════════════════════════════════════════════════════════ */
router.get('/ai/info', autenticar, (req, res) => {
  res.json({ ok: true, ...provedorInfo() })
})

/* ═══════════════════════════════════════════════════════════════
   POST /api/analysis/ai/chat
   IA Assistant — provedor configurável via AI_PROVIDER (.env)
   Padrão: Groq (llama-3.3-70b-versatile).
   Fallback: Anthropic (claude-opus-4-6) via AI_PROVIDER=anthropic
   IA apenas SUGERE, nunca executa ações automaticamente.
═══════════════════════════════════════════════════════════════ */
router.post('/ai/chat', autenticar, async (req, res) => {
  const { pergunta, contexto = {}, historico = [] } = req.body

  if (!pergunta || typeof pergunta !== 'string' || pergunta.trim().length < 3) {
    return res.status(400).json({ erro: 'Pergunta obrigatória (mínimo 3 caracteres).' })
  }
  if (pergunta.length > 1000) {
    return res.status(400).json({ erro: 'Pergunta muito longa (máximo 1000 caracteres).' })
  }

  // Verificar disponibilidade do provedor ativo
  const info = provedorInfo()
  if (!info.disponivel) {
    const chave = info.provedor === 'groq' ? 'GROQ_API_KEY' : 'ANTHROPIC_API_KEY'
    return res.status(503).json({
      ok: false, resposta: null, provedor: info.provedor,
      erro: `${chave} não configurada. Configure no .env do backend.`,
    })
  }

  try {
    let contextoSistema = ''

    if (contexto.projetos && Array.isArray(contexto.projetos)) {
      const resumo = contexto.projetos.slice(0, 10).map(p =>
        `- ${p.nome}: status=${p.saude?.label || p.status}, inatividade=${p.diasInatividade ?? '?'}d, stack=${(p.stack || p.tecnologias || []).join(', ')}`
      ).join('\n')
      contextoSistema += `\nPROJETOS LOCAIS (${contexto.projetos.length} total):\n${resumo}\n`
    }
    if (contexto.repos && Array.isArray(contexto.repos)) {
      const resumo = contexto.repos.slice(0, 10).map(r =>
        `- ${r.nome}: linguagem=${r.linguagem || '?'}, inatividade=${r.diasInatividade ?? '?'}d, stars=${r.stars || 0}, issues=${r.issues || 0}`
      ).join('\n')
      contextoSistema += `\nREPOSITÓRIOS GITHUB (${contexto.repos.length} total):\n${resumo}\n`
    }
    if (contexto.saude) {
      contextoSistema += `\nSAÚDE GERAL: score=${contexto.saude.score}/100, nível=${contexto.saude.nivel?.label || '?'}\n`
    }

    const systemPrompt = `Você é o AL Sistemas IA Assistant — um assistente interno especializado em análise de projetos de software.

Você recebe dados reais do sistema sobre projetos locais e repositórios GitHub, e responde perguntas do administrador.

REGRAS IMPORTANTES:
- Você NUNCA executa código, NUNCA faz chamadas de API, NUNCA altera nada
- Você apenas ANALISA dados fornecidos e SUGERE ações
- Classifique problemas por prioridade (crítico/alto/médio/baixo)
- Use linguagem técnica mas acessível
- Responda SEMPRE em Português do Brasil
- Seja conciso: máximo 3-4 parágrafos ou uma lista de bullets

CONTEXTO DO SISTEMA:
${contextoSistema || 'Nenhum contexto de projeto disponível.'}`

    // Sprint 6-B: histórico truncado para controle de custo
    const resultado = await enviarMensagem({
      systemPrompt,
      pergunta:  pergunta.trim(),
      historico: truncarHistorico(historico),
    })

    await AuditLog.create({
      admin_id: req.usuario._id, admin_email: req.usuario.email,
      acao: 'consultar', recurso: 'ai_assistant', recurso_id: 'chat',
      payload: { pergunta: pergunta.slice(0, 200), tokens: resultado.tokens,
                 modelo: resultado.modelo, provedor: resultado.provedor },
      ip: req.ip, request_id: req.requestId || null,
    }).catch(() => {})

    res.json({
      ok:       true,
      resposta: resultado.resposta,
      modelo:   resultado.modelo,
      provedor: resultado.provedor,
      tokens:   resultado.tokens,
      aviso:    'Esta é uma sugestão de IA. Valide antes de executar qualquer ação.',
    })
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, resposta: null, erro: err.message })
  }
})

export default router
