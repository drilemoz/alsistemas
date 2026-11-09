/**
 * Testes — Audit Log
 * #19 — Verifica gravação de ações admin e listagem.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../server.js'
import Noticia from '../models/Noticia.js'
import AuditLog from '../models/AuditLog.js'
import Usuario from '../models/Usuario.js'

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI
let authCookie
let adminId

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(MONGO_URI)
  const email = `audit_test_${Date.now()}@alsistemas.test`
  const user = await Usuario.create({ email, senha: 'senha123', nome: 'Admin Audit' })
  adminId = user._id.toString()
  const login = await request(app).post('/api/auth/login').send({ email, senha: 'senha123' })
  authCookie = login.headers['set-cookie']
})

afterAll(async () => {
  await Noticia.deleteMany({ titulo: /\[AUDIT\]/ })
  await AuditLog.deleteMany({ admin_id: adminId })
  await Usuario.deleteMany({ email: /audit_test_.*@alsistemas\.test/ })
  await mongoose.connection.close()
})

describe('Audit Log — gravação automática (#19)', () => {
  let noticiaId

  it('registra ação "criar" ao POST /api/noticias', async () => {
    const antes = await AuditLog.countDocuments({ admin_id: adminId, acao: 'criar' })

    const res = await request(app)
      .post('/api/noticias')
      .set('Cookie', authCookie)
      .send({ titulo: '[AUDIT] Criada', conteudo: 'conteúdo' })

    expect(res.status).toBe(201)
    noticiaId = res.body.id

    const depois = await AuditLog.countDocuments({ admin_id: adminId, acao: 'criar' })
    expect(depois).toBeGreaterThan(antes)
  })

  it('registra ação "editar" ao PUT /api/noticias/:id', async () => {
    if (!noticiaId) return

    const antes = await AuditLog.countDocuments({ admin_id: adminId, acao: 'editar' })

    const res = await request(app)
      .put(`/api/noticias/${noticiaId}`)
      .set('Cookie', authCookie)
      .send({ titulo: '[AUDIT] Editada', conteudo: 'novo conteúdo' })

    expect(res.status).toBe(200)

    const depois = await AuditLog.countDocuments({ admin_id: adminId, acao: 'editar' })
    expect(depois).toBeGreaterThan(antes)
  })

  it('registra ação "excluir" ao DELETE /api/noticias/:id', async () => {
    if (!noticiaId) return

    const antes = await AuditLog.countDocuments({ admin_id: adminId, acao: 'excluir' })

    const res = await request(app)
      .delete(`/api/noticias/${noticiaId}`)
      .set('Cookie', authCookie)

    expect(res.status).toBe(200)

    const depois = await AuditLog.countDocuments({ admin_id: adminId, acao: 'excluir' })
    expect(depois).toBeGreaterThan(antes)
  })

  it('não registra ação sem autenticação', async () => {
    const antes = await AuditLog.countDocuments()
    await request(app).post('/api/noticias').send({ titulo: 'x', conteudo: 'y' })
    const depois = await AuditLog.countDocuments()
    expect(depois).toBe(antes)
  })
})

describe('GET /api/audit-logs (#19)', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app).get('/api/audit-logs')
    expect(res.status).toBe(401)
  })

  it('200 retorna logs com paginação', async () => {
    const res = await request(app)
      .get('/api/audit-logs?limit=10')
      .set('Cookie', authCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('logs')
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('paginas')
    expect(Array.isArray(res.body.logs)).toBe(true)
  })

  it('filtra por recurso', async () => {
    const res = await request(app)
      .get('/api/audit-logs?recurso=noticias')
      .set('Cookie', authCookie)
    expect(res.status).toBe(200)
    res.body.logs.forEach(log => expect(log.recurso).toBe('noticias'))
  })
})
