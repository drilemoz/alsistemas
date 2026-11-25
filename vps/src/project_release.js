import { validateRepo } from './updates.js'
export const PORTAL_REPO = 'drilemoz/Meu-Site'
const MAX = 32 * 1024 * 1024
export async function lookupProjectRelease(repo = PORTAL_REPO, fetcher = fetch) {
  if (!validateRepo(repo)) throw new Error('Proprietário/repositório inválido.')
  const res = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AL-Sistemas-VPS' },
    redirect: 'error', signal: AbortSignal.timeout(10000)
  })
  if (res.status === 404) throw new Error('Repositório privado, inexistente ou sem Release pública estável. Confira GitHub Actions.')
  if (res.status === 403 || res.status === 429) throw new Error('GitHub recusou a consulta ou atingiu o limite de requisições. Tente novamente mais tarde.')
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}. Não foi possível consultar a Release.`)
  const reader = res.body.getReader(), chunks = []; let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      total += value.byteLength; if (total > 300000) throw new Error('Metadados da Release excedem o limite.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const latest = String(data.tag_name || '').replace(/^v/, '')
  if (data.draft || data.prerelease || !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(latest)) throw new Error('Release não é uma versão estável x.y.z.')
  const assets = (Array.isArray(data.assets) ? data.assets : []).filter(a => a && [`Atualizacao-v${latest}.zip`, `Meu-Site-update-v${latest}.zip`].includes(a.name) && Number.isSafeInteger(a.size) && a.size >= 512 && a.size <= MAX)
  const asset = assets.length === 1 ? assets[0] : null
  return { repo, latest, assetsReady: !!asset, asset: asset?.name || null, bytes: asset?.size || null,
    notes: String(data.body || '').slice(0, 1600), message: asset ? 'Pacote oficial encontrado.' : 'Release sem um único pacote oficial de atualização. Confira GitHub Actions.' }
}
