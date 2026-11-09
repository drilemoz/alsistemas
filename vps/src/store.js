import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const dir = process.env.ALS_DATA_DIR || '/var/lib/alsistemas'
export function dataPath(name) { return path.join(dir, name) }
export function readJson(name) {
  try { return JSON.parse(fs.readFileSync(dataPath(name), 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
export function writeJson(name, value) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const dest = dataPath(name)
  const temp = dataPath(`.${name}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`)
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    fs.renameSync(temp, dest)
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}
export function audit(event, data = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const allowed = ['name', 'action', 'success', 'ip', 'reason', 'enabled', 'package']
  const safe = Object.fromEntries(allowed.filter(k => Object.hasOwn(data, k)).map(k => [k, String(data[k]).slice(0, 160)]))
  const file = dataPath('audit.jsonl')
  try {
    if (fs.statSync(file).size > 1024 * 1024) {
      if (fs.existsSync(dataPath('audit.1.jsonl'))) fs.unlinkSync(dataPath('audit.1.jsonl'))
      fs.renameSync(file, dataPath('audit.1.jsonl'))
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e }
  fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event, ...safe }) + '\n', { mode: 0o600 })
}
export function lastAudit(limit = 30) {
  try {
    const data = fs.readFileSync(dataPath('audit.jsonl'), 'utf8')
    return data.trim().split('\n').slice(-limit).map(l => JSON.parse(l)).reverse()
  } catch (e) { if (e.code === 'ENOENT') return []; return [] }
}
