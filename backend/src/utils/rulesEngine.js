/**
 * rulesEngine.js — Motor de Regras do Sistema (Sprint 4)
 *
 * Engine de inteligência estática: analisa dados de projetos locais e GitHub
 * e produz alertas, sugestões e classificações de saúde.
 *
 * Princípios:
 *  - Nunca executa código externo
 *  - Apenas lê dados passados como parâmetro
 *  - Retorna sugestões — todas ações críticas exigem confirmação humana
 *  - 100% reversível: não persiste estado, não altera nada
 */

/* ─── Constantes de limiar ──────────────────────────────────── */
const DIAS = {
  ATIVO:       30,   // < 30 dias → projeto ativo
  MODERADO:    60,   // 30–60 dias → moderado
  ABANDONADO: 180,   // > 180 dias → abandonado
}

const SEVERIDADE = { critico: 'critico', alto: 'alto', medio: 'medio', baixo: 'baixo', info: 'info' }

/* ─── Utilitários ───────────────────────────────────────────── */
function diasDesde(isoDate) {
  if (!isoDate) return Infinity
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
}

function saudeProjeto(diasInatividade) {
  if (diasInatividade < DIAS.ATIVO)      return { label: 'ativo',    emoji: '🟢', cor: '#22c55e' }
  if (diasInatividade < DIAS.MODERADO)   return { label: 'moderado', emoji: '🟡', cor: '#f59e0b' }
  return                                        { label: 'abandonado',emoji: '🔴', cor: '#ef4444' }
}

/* ═══════════════════════════════════════════════════════════════
   ANÁLISE DE PROJETO LOCAL
═══════════════════════════════════════════════════════════════ */

/**
 * Detecta stack principal a partir das tecnologias e arquivos do projeto local.
 * @param {string[]} tecnologias — array de strings como ['Node.js', 'Docker']
 * @param {string[]} arquivos    — lista de nomes de arquivo na raiz
 */
function detectarStackLocal(tecnologias = [], arquivos = []) {
  const stack = []
  const arqs  = arquivos.map(a => (a.nome || a).toLowerCase())

  if (tecnologias.includes('Node.js')) {
    if (arqs.some(f => f.includes('vite.config')))                stack.push('React/Vite')
    else if (arqs.some(f => f.includes('next.config')))           stack.push('Next.js')
    else if (arqs.includes('angular.json'))                       stack.push('Angular')
    else if (arqs.some(f => f.includes('svelte')))                stack.push('SvelteKit')
    else                                                           stack.push('Node.js')
  }
  if (tecnologias.includes('Python')) {
    if (arqs.includes('manage.py'))                               stack.push('Django')
    else if (arqs.includes('app.py') || arqs.includes('main.py')) stack.push('FastAPI/Flask')
    else                                                           stack.push('Python')
  }
  if (tecnologias.includes('Rust'))  stack.push('Rust')
  if (tecnologias.includes('Go'))    stack.push('Go')
  if (tecnologias.includes('Java'))  stack.push('Java')
  if (tecnologias.includes('PHP'))   stack.push('PHP')
  if (tecnologias.includes('Ruby'))  stack.push('Ruby')

  if (tecnologias.includes('Docker')) stack.push('Docker')

  return stack.length ? stack : ['Desconhecido']
}

/**
 * Detecta tipo de projeto: api | frontend | fullstack | lib | script | desconhecido
 */
function detectarTipoProjeto(tecnologias = [], arquivos = [], stack = []) {
  const arqs = arquivos.map(a => (a.nome || a).toLowerCase())

  const temFrontend = arqs.some(f =>
    ['vite.config', 'next.config', 'angular.json', 'svelte.config', 'index.html', 'public'].some(k => f.includes(k))
  )
  const temBackend = arqs.some(f =>
    ['server', 'app.js', 'main.js', 'app.py', 'main.py', 'manage.py', 'routes', 'controllers'].some(k => f.includes(k))
  )
  const temApi     = arqs.some(f => ['routes', 'controllers', 'handlers', 'endpoints'].some(k => f.includes(k)))
  const temDocker  = tecnologias.includes('Docker')

  if (temFrontend && temBackend) return 'fullstack'
  if (temFrontend)               return 'frontend'
  if (temBackend || temApi)      return 'api'
  if (arqs.includes('lib') || arqs.includes('src/lib')) return 'lib'
  if (arqs.some(f => f.endsWith('.sh') || f.endsWith('.py') || f.endsWith('.js'))) return 'script'
  return 'desconhecido'
}

/* ═══════════════════════════════════════════════════════════════
   GERADOR DE ALERTAS
═══════════════════════════════════════════════════════════════ */

/**
 * Gera alertas para um projeto local.
 * @param {object} projeto — objeto retornado pelo /api/projetos/:nome
 */
function alertasProjeto(projeto) {
  const alertas = []
  const dias    = diasDesde(projeto.ultimaAlteracao)

  // Inatividade
  if (dias > DIAS.ABANDONADO) {
    alertas.push({
      tipo:       'inatividade',
      severidade: SEVERIDADE.alto,
      titulo:     'Projeto possivelmente abandonado',
      descricao:  `Sem alterações há ${dias} dias (>${DIAS.ABANDONADO} dias).`,
      sugestao:   'Avalie arquivar ou retomar o projeto.',
    })
  } else if (dias > DIAS.MODERADO) {
    alertas.push({
      tipo:       'inatividade',
      severidade: SEVERIDADE.medio,
      titulo:     'Projeto parado',
      descricao:  `Sem alterações há ${dias} dias.`,
      sugestao:   'Verifique se o desenvolvimento está bloqueado.',
    })
  }

  // README ausente
  const arqs = (projeto.arquivos || []).map(a => (a.nome || a).toLowerCase())
  if (!arqs.some(f => f.startsWith('readme'))) {
    alertas.push({
      tipo:       'documentacao',
      severidade: SEVERIDADE.medio,
      titulo:     'README ausente',
      descricao:  'O projeto não possui arquivo README.',
      sugestao:   'Crie um README.md com instruções de uso.',
    })
  }

  // Sem package.json mas tem JS/TS
  if (!projeto.package && projeto.tecnologias?.includes('Node.js')) {
    alertas.push({
      tipo:       'configuracao',
      severidade: SEVERIDADE.medio,
      titulo:     'package.json não encontrado',
      descricao:  'Projeto Node.js sem package.json detectado.',
      sugestao:   'Execute npm init para criar o package.json.',
    })
  }

  // Sem Docker em projetos de API/fullstack
  const stack = detectarStackLocal(projeto.tecnologias, projeto.arquivos)
  const tipo  = detectarTipoProjeto(projeto.tecnologias, projeto.arquivos, stack)
  if (['api', 'fullstack'].includes(tipo) && !projeto.tecnologias?.includes('Docker')) {
    alertas.push({
      tipo:       'infraestrutura',
      severidade: SEVERIDADE.baixo,
      titulo:     'Docker não configurado',
      descricao:  'Projetos API/fullstack se beneficiam de containerização.',
      sugestao:   'Considere adicionar um Dockerfile.',
    })
  }

  // Sem CI
  if (!arqs.includes('.github') && !arqs.some(f => f.includes('ci') || f.includes('workflow'))) {
    alertas.push({
      tipo:       'ci',
      severidade: SEVERIDADE.baixo,
      titulo:     'CI/CD não configurado',
      descricao:  'Nenhum pipeline de integração contínua detectado.',
      sugestao:   'Configure GitHub Actions ou similar.',
    })
  }

  return alertas
}

/**
 * Gera alertas para um repositório GitHub.
 * @param {object} repo     — objeto de repo do /api/github/repos/:owner/:repo
 * @param {object} analysis — objeto de /api/github/repos/:owner/:repo/analysis
 */
function alertasRepo(repo, analysis = {}) {
  const alertas = []
  const dias    = diasDesde(repo.ultimaAtualizacao || repo.updated_at)

  if (repo.arquivado) {
    alertas.push({
      tipo:       'arquivado',
      severidade: SEVERIDADE.info,
      titulo:     'Repositório arquivado',
      descricao:  `${repo.nomeCompleto || repo.nome} está marcado como arquivado no GitHub.`,
      sugestao:   'Verifique se deve ser desarquivado ou removido.',
    })
    return alertas
  }

  if (dias > DIAS.ABANDONADO) {
    alertas.push({
      tipo:       'inatividade',
      severidade: SEVERIDADE.alto,
      titulo:     'Repositório abandonado',
      descricao:  `Sem commits há ${dias} dias.`,
      sugestao:   'Considere arquivar ou retomar o desenvolvimento.',
    })
  } else if (dias > DIAS.MODERADO) {
    alertas.push({
      tipo:       'inatividade',
      severidade: SEVERIDADE.medio,
      titulo:     'Repositório com baixa atividade',
      descricao:  `Sem commits há ${dias} dias.`,
      sugestao:   'Verifique o estado do desenvolvimento.',
    })
  }

  if (!analysis.temLicense) {
    alertas.push({
      tipo:       'licenca',
      severidade: SEVERIDADE.medio,
      titulo:     'Licença ausente',
      descricao:  `${repo.nome} não possui arquivo de licença.`,
      sugestao:   'Adicione um arquivo LICENSE para clareza legal.',
    })
  }

  if (!analysis.temLicense === undefined || !analysis.hasCI) {
    alertas.push({
      tipo:       'ci',
      severidade: SEVERIDADE.baixo,
      titulo:     'GitHub Actions não configurado',
      descricao:  `${repo.nome} não possui workflows de CI.`,
      sugestao:   'Configure GitHub Actions para automação.',
    })
  }

  if (repo.issues > 20) {
    alertas.push({
      tipo:       'issues',
      severidade: SEVERIDADE.medio,
      titulo:     'Muitas issues abertas',
      descricao:  `${repo.nome} tem ${repo.issues} issues abertas.`,
      sugestao:   'Triaje e feche issues resolvidas ou obsoletas.',
    })
  }

  return alertas
}

/* ═══════════════════════════════════════════════════════════════
   SAÚDE GERAL DO SISTEMA
═══════════════════════════════════════════════════════════════ */

/**
 * Calcula saúde geral do sistema com base em todos os projetos e repos.
 * @param {object[]} projetos — lista de projetos locais
 * @param {object[]} repos    — lista de repos GitHub
 */
function calcularSaudeGeral(projetos = [], repos = []) {
  let score = 100
  const problemas = []

  const projetosAbandomados = projetos.filter(p => diasDesde(p.ultimaAlteracao) > DIAS.ABANDONADO).length
  const projetosModerados   = projetos.filter(p => {
    const d = diasDesde(p.ultimaAlteracao)
    return d >= DIAS.ATIVO && d <= DIAS.ABANDONADO
  }).length
  const reposDesatualizados = repos.filter(r => diasDesde(r.ultimaAtualizacao) > DIAS.ABANDONADO).length

  if (projetosAbandomados > 0) {
    score -= projetosAbandomados * 8
    problemas.push(`${projetosAbandomados} projeto(s) local(is) abandonado(s)`)
  }
  if (projetosModerados > 0) {
    score -= projetosModerados * 3
    problemas.push(`${projetosModerados} projeto(s) com atividade moderada`)
  }
  if (reposDesatualizados > 0) {
    score -= reposDesatualizados * 5
    problemas.push(`${reposDesatualizados} repositório(s) GitHub desatualizado(s)`)
  }

  const scoreFinal = Math.max(0, Math.min(100, score))
  const nivel =
    scoreFinal >= 80 ? { label: 'Saudável',   cor: '#22c55e', emoji: '🟢' } :
    scoreFinal >= 50 ? { label: 'Atenção',     cor: '#f59e0b', emoji: '🟡' } :
                       { label: 'Crítico',     cor: '#ef4444', emoji: '🔴' }

  return { score: scoreFinal, nivel, problemas }
}

/* ═══════════════════════════════════════════════════════════════
   API PÚBLICA DO ENGINE
═══════════════════════════════════════════════════════════════ */

/**
 * Analisa lista de projetos locais e retorna dados enriquecidos + alertas.
 */
export function analisarProjetosLocais(projetos = []) {
  return projetos.map(projeto => {
    const arquivos = projeto.arquivos || []
    const stack    = detectarStackLocal(projeto.tecnologias, arquivos)
    const tipo     = detectarTipoProjeto(projeto.tecnologias, arquivos, stack)
    const dias     = diasDesde(projeto.ultimaAlteracao)
    const saude    = saudeProjeto(dias)
    const alertas  = alertasProjeto(projeto)

    return {
      ...projeto,
      stack,
      tipo,
      saude,
      diasInatividade: dias === Infinity ? null : dias,
      alertas,
      totalAlertas: alertas.length,
    }
  })
}

/**
 * Analisa lista de repos GitHub e retorna alertas.
 */
export function analisarRepos(repos = [], analysisMap = {}) {
  return repos.map(repo => {
    const analysis = analysisMap[repo.nome] || {}
    const dias     = diasDesde(repo.ultimaAtualizacao)
    const saude    = saudeProjeto(dias)
    const alertas  = alertasRepo(repo, analysis)

    return {
      ...repo,
      saude,
      diasInatividade: dias === Infinity ? null : dias,
      alertas,
      totalAlertas: alertas.length,
    }
  })
}

/**
 * Gera overview completo com saúde do sistema e alertas críticos.
 */
export function gerarOverview(projetosAnalisados = [], reposAnalisados = []) {
  const saude = calcularSaudeGeral(projetosAnalisados, reposAnalisados)

  const alertasCriticos = [
    ...projetosAnalisados.flatMap(p =>
      p.alertas.filter(a => ['critico', 'alto'].includes(a.severidade))
               .map(a => ({ ...a, origem: 'local', projeto: p.nome }))
    ),
    ...reposAnalisados.flatMap(r =>
      r.alertas.filter(a => ['critico', 'alto'].includes(a.severidade))
               .map(a => ({ ...a, origem: 'github', projeto: r.nome }))
    ),
  ]

  const stats = {
    projetos: {
      total:      projetosAnalisados.length,
      ativos:     projetosAnalisados.filter(p => p.saude?.label === 'ativo').length,
      moderados:  projetosAnalisados.filter(p => p.saude?.label === 'moderado').length,
      abandonados:projetosAnalisados.filter(p => p.saude?.label === 'abandonado').length,
    },
    repos: {
      total:      reposAnalisados.length,
      ativos:     reposAnalisados.filter(r => r.saude?.label === 'ativo').length,
      moderados:  reposAnalisados.filter(r => r.saude?.label === 'moderado').length,
      abandonados:reposAnalisados.filter(r => r.saude?.label === 'abandonado').length,
      arquivados: reposAnalisados.filter(r => r.arquivado).length,
    },
    alertasCriticos: alertasCriticos.length,
  }

  return { saude, stats, alertasCriticos }
}

/**
 * Compara projeto local com repositório GitHub e detecta divergências.
 * @param {object} projetoLocal — dados do /api/projetos/:nome
 * @param {object} repo         — dados do /api/github/repos/:owner/:repo
 * @param {object[]} commits    — últimos commits do repo
 */
export function compararLocalComGitHub(projetoLocal, repo, commits = []) {
  const divergencias = []
  const diasLocal  = diasDesde(projetoLocal.ultimaAlteracao)
  const diasGitHub = diasDesde(repo.ultimaAtualizacao)

  // Diferença de atividade
  const diffDias = Math.abs(diasLocal - diasGitHub)
  if (diffDias > 7) {
    const maisRecente = diasLocal < diasGitHub ? 'local' : 'GitHub'
    divergencias.push({
      tipo:      'atividade',
      titulo:    'Diferença de atividade detectada',
      descricao: `Projeto local modificado há ${diasLocal}d · GitHub atualizado há ${diasGitHub}d.`,
      detalhe:   `Versão mais recente parece estar no ${maisRecente}.`,
      severidade: diffDias > 30 ? SEVERIDADE.alto : SEVERIDADE.medio,
    })
  }

  // Diferença de versão (via package.json local vs GitHub)
  const versaoLocal  = projetoLocal.package?.versao
  const versaoGitHub = repo.versao // pode não estar disponível
  if (versaoLocal && versaoGitHub && versaoLocal !== versaoGitHub) {
    divergencias.push({
      tipo:       'versao',
      titulo:     'Versões divergentes',
      descricao:  `Local: v${versaoLocal} · GitHub: v${versaoGitHub}`,
      sugestao:   'Sincronize o package.json e faça commit.',
      severidade: SEVERIDADE.medio,
    })
  }

  // Commits recentes do GitHub que podem não estar no local
  const commitRecentes = commits.filter(c => diasDesde(c.data) < 30)
  if (commitRecentes.length > 0 && diasLocal > diasGitHub + 7) {
    divergencias.push({
      tipo:       'commits',
      titulo:     `${commitRecentes.length} commit(s) recente(s) no GitHub`,
      descricao:  `O repositório GitHub tem commits que podem não estar na cópia local.`,
      sugestao:   'Execute git pull para atualizar o projeto local.',
      severidade: SEVERIDADE.alto,
      commits:    commitRecentes.slice(0, 5).map(c => ({ sha: c.sha, mensagem: c.mensagem, data: c.data })),
    })
  }

  const statusSync =
    divergencias.length === 0                                           ? 'sincronizado' :
    divergencias.some(d => d.severidade === SEVERIDADE.alto)           ? 'divergente'   :
                                                                          'atencao'

  return {
    statusSync,
    divergencias,
    diasLocal:  diasLocal === Infinity ? null : diasLocal,
    diasGitHub: diasGitHub === Infinity ? null : diasGitHub,
    resumo: {
      local:  { nome: projetoLocal.nome,  ultimaAlteracao: projetoLocal.ultimaAlteracao, stack: detectarStackLocal(projetoLocal.tecnologias, projetoLocal.arquivos) },
      github: { nome: repo.nome,          ultimaAtualizacao: repo.ultimaAtualizacao,     linguagem: repo.linguagem },
    },
  }
}

export { saudeProjeto, diasDesde, detectarStackLocal, detectarTipoProjeto, DIAS, SEVERIDADE }
