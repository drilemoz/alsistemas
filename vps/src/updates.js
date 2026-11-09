import fs from 'node:fs'
import { readJson, writeJson } from './store.js'

export const DEFAULT_REPO = 'drilemoz/alsistemas'
const keyPath = process.env.ALS_UPDATE_KEY_FILE || '/etc/alsistemas-vps/update-public-key.pem'
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
export function updateInfo(version) {
  const config = readJson('updates-config.json')
  const repo = validateRepo(config?.repo) ? config.repo : DEFAULT_REPO
  let status = null
  try { status = readJson('update-status.json') } catch { /* estado ainda não disponível */ }
  return { installed: version, repo, signingReady: fs.existsSync(keyPath), status }
}
export async function checkRelease(version, fetcher = fetch) {
  const { repo, signingReady } = updateInfo(version)
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
      installed: version, repo, available: false, signingReady, assetsReady: false,
      repoAccessible: true, releaseStatus: 'no_stable_release',
      message: 'Repositório encontrado, mas ainda não há Release estável pública. Envie o código e publique uma Release assinada com ZIP, manifesto e assinatura para habilitar a atualização.'
    }
    if (repository.status === 404) return {
      installed: version, repo, available: false, signingReady, assetsReady: false,
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
  const expected = [`AL-Sistemas-v${target}-VPS.zip`, 'update-manifest.json', 'update-manifest.json.sig']
  const assetsReady = expected.every(name => assets.includes(name))
  return {
    installed: version, latest: target, repo, available: order > 0,
    signingReady, assetsReady, repoAccessible: true, releaseStatus: 'published',
    message: order > 0 ? (assetsReady ? 'Pacote encontrado. A assinatura será validada antes de instalar.' : 'Release sem os três arquivos obrigatórios para atualização segura.') : 'Nenhuma versão mais recente encontrada.'
  }
}
