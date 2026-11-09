/**
 * Testes — /api/health e /metrics
 * #9  — Health check detalhado.
 * #8  — Endpoint de métricas.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../server.js'

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(MONGO_URI)
})

afterAll(async () => {
  await mongoose.connection.close()
})

describe('GET /api/health', () => {
  it('retorna estrutura detalhada (#9)', async () => {
    const res = await request(app).get('/api/health')
    expect([200, 503]).toContain(res.status)
    expect(res.body).toHaveProperty('ok')
    expect(res.body).toHaveProperty('servicos')
    expect(res.body.servicos).toHaveProperty('mongodb')
    expect(res.body.servicos).toHaveProperty('redis')
    expect(res.body.servicos).toHaveProperty('cloudinary')
    expect(res.body).toHaveProperty('latencia_ms')
  })

  it('MongoDB aparece como conectado', async () => {
    const res = await request(app).get('/api/health')
    expect(res.body.servicos.mongodb.ok).toBe(true)
  })

  it('inclui X-Request-Id (#10)', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers).toHaveProperty('x-request-id')
  })
})

describe('GET /metrics', () => {
  it('retorna métricas em formato Prometheus (#8)', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    // prom-client sempre inclui essas métricas de processo
    expect(res.text).toMatch(/alsistemas_/)
  })
})

describe('GET /sitemap.xml', () => {
  it('retorna XML válido (#16)', async () => {
    const res = await request(app).get('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/xml/)
    expect(res.text).toMatch(/<urlset/)
  })
})

describe('GET /rss', () => {
  it('retorna RSS 2.0 válido (#17)', async () => {
    const res = await request(app).get('/rss')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/xml/)
    expect(res.text).toMatch(/<rss/)
    expect(res.text).toMatch(/<channel>/)
  })
})
