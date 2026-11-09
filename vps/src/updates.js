import { readJson, writeJson } from './store.js'

export const DEFAULT_REPO = 'drilemoz/alsistemas'
export const validateRepo = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value) && !value.includes('..') && !value.endsWith('.git')
export function configureRepo(repo) {
  if (!validateRepo(repo)) throw new Error('Repositório GitHub inválido')
  writeJson('updates-config.json', { repo })
}
export function compareVersion(a, b) {
  if (!/^\d+\.\d+\.\d+$/.test(a) || !/^\d+\.\d+\.\d+$/.test(b)) return null
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i])
  return 0
}
const ACTIVE = new Set(['queued', 'checking', 'downloading', 'validating', 'backup', 'installing', 'verifying', 'rolling_back'])
export function updateInfo(version) {
  const config = readJson('updates-config.json')
  const repo = validateRepo(config?.repo) ? config.repo : DEFAULT_REPO
  let status = null
  try { status = readJson('update-status.json') } catch { /* estado ainda não disponível */ }
  if (status && ACTIVE.has(status.stage)) {
    const when = Date.parse(status.time)
    if (Number.isFinite(when) && Date.now() - when > 15 * 60_000)
      status = { ...status, stage: 'stalled', message: 'Não houve atualização do status por 15 minutos. Verifique o serviço do atualizador e os logs antes de tentar novamente.' }
  }
  return { installed: version, repo, status }
}
// Documentação pública é um complemento informativo, nunca parte da validação de instalação.
// Limite de bytes e timeout evitam que README arbitrário esgote a RAM da VPS.
async function releaseDocument(repo, tag, file, fetcher) {
  if (!['README.md', 'CHANGELOG.md'].includes(file)) return null
  const url = `https://raw.githubusercontent.com/${repo}/${tag}/${file}`
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(6000), redirect: 'error' })
    if (!response.ok || Number(response.headers?.get('content-length') || 0) > 32768) return null
    let text = ''
    if (response.body?.getReader) {
      const reader = response.body.getReader()
      const chunks = []
      let total = 0
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > 32768) return null
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      text = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))))
    } else if (typeof response.text === 'function') {
      text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > 32768) return null
    }
    return text.trim().slice(0, 4500) || null
  } catch { return null }
}

export async function checkRelease(version, fetcher = fetch) {
  const { repo } = updateInfo(version)
  if (!repo) return { installed: version, available: false, message: 'Configure o repositório GitHub autorizado.' }
  const controller = AbortSignal.timeout(10000)
  const response = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'AL-Sistemas-VPS' }, signal: controller, redirect: 'error'
  })
  // O GitHub responde 404 quando não há Release estável, mas também para repositório
  // inexistente/privado. Confirme a existência antes de diagnosticar a causa.
  if (response.status === 404) {
    const repository = await fetcher(`https://api.github.com/repos/${repo}`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'AL-Sistemas-VPS' },
      signal: controller, redirect: 'error'
    })
    if (repository.ok) return {
      installed: version, repo, available: false, assetsReady: false,
      repoAccessible: true, releaseStatus: 'no_stable_release',
      message: 'Repositório encontrado, mas ainda não há Release estável pública. Envie a próxima versão ao GitHub. O workflow deve publicar automaticamente ZIP e manifesto SHA-256; confira a aba Actions se a Release não aparecer.'
    }
    if (repository.status === 404) return {
      installed: version, repo, available: false, assetsReady: false,
      repoAccessible: false, releaseStatus: 'repo_unavailable',
      message: 'Repositório não encontrado ou privado. Confira o endereço em Configurações e o acesso público às Releases.'
    }
    if (repository.status === 403 && repository.headers?.get('x-ratelimit-remaining') === '0') {
      throw Object.assign(new Error('Limite de consultas públicas do GitHub atingido. Tente novamente após a renovação da cota.'), { status: 502 })
    }
    throw Object.assign(new Error(`GitHub: HTTP ${repository.status}. Não foi possível verificar o repositório.`), { status: 502 })
  }
  if (response.status === 403 && response.headers?.get('x-ratelimit-remaining') === '0') {
    throw Object.assign(new Error('Limite de consultas públicas do GitHub atingido. Tente novamente após a renovação da cota.'), { status: 502 })
  }
  if (!response.ok) throw Object.assign(new Error(`GitHub: HTTP ${response.status}. Falha na consulta de Releases.`), { status: 502 })
  const size = response.headers?.get('content-length')
  if (size && Number(size) > 1048576) throw Object.assign(new Error('Resposta grande demais'), { status: 502 })
  const release = await response.json()
  const target = String(release.tag_name || '').replace(/^v/, '')
  const order = compareVersion(target, version)
  if (order === null) throw Object.assign(new Error('Tag da Release não é uma versão estável x.y.z'), { status: 502 })
  const assets = Array.isArray(release.assets) ? release.assets.map(a => a.name) : []
  const expected = [`AL-Sistemas-v${target}-VPS.zip`, 'update-manifest.json']
  const assetsReady = expected.every(name => assets.includes(name))
  const releaseNotes = typeof release.body === 'string' ? release.body.slice(0, 4000).trim() : ''
  const [readme, changelogText] = await Promise.all([
    releaseDocument(repo, `v${target}`, 'README.md', fetcher),
    releaseDocument(repo, `v${target}`, 'CHANGELOG.md', fetcher)
  ])
  let changes = null
  if (changelogText) {
    // Exibe somente o bloco da versão, sem misturar mudanças de releases antigas.
    const lines = changelogText.split('\n')
    const header = new RegExp(`^#{1,3}\\s+\\[?v?${target.replaceAll('.', '\\.')}\\]?\\b`, 'i')
    const start = lines.findIndex(line => header.test(line))
    if (start !== -1) {
      const end = lines.findIndex((line, idx) => idx > start && /^#{1,3}\s+/.test(line))
      changes = lines.slice(start, end === -1 ? undefined : end).join('\n').trim().slice(0, 2500)
    }
  }
  return {
    installed: version, latest: target, repo, available: order > 0,
    assetsReady, repoAccessible: true, releaseStatus: 'published',
    releaseNotes, changes, readme, readmeUrl: readme ? `https://github.com/${repo}/blob/v${target}/README.md` : null,
    message: order > 0 ? (assetsReady ? 'Pacote disponível. SHA-256 e estrutura serão conferidos antes de instalar.' : 'Release sem ZIP e manifesto SHA-256 necessários para atualização.') : 'Nenhuma versão mais recente encontrada.'
  }
}
