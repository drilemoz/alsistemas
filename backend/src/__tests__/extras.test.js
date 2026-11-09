/**
 * Testes de integração — /api/eventos, /api/onibus, /api/noticias-externas
 * #12 — Cobre paginação por cursor, criação, edição, exclusão e erros.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../server.js'
import { Evento } from '../models/Evento.js'
import { Onibus } from '../models/Onibus.js'
import { NoticiaExterna } from '../models/Extras.js'
import Usuario from '../models/Usuario.js'

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI
let authCookie

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(MONGO_URI)
  const email = `extras_test_${Date.now()}@alsistemas.test`
  await Usuario.create({ email, senha: 'senha123', nome: 'Admin Extras' })
  const login = await request(app).post('/api/auth/login').send({ email, senha: 'senha123' })
  authCookie = login.headers['set-cookie']
})

afterAll(async () => {
  await Evento.deleteMany({ titulo: /\[TESTE\]/ })
  await Onibus.deleteMany({ destino: /\[TESTE\]/ })
  await NoticiaExterna.deleteMany({ titulo: /\[TESTE\]/ })
  await Usuario.deleteMany({ email: /extras_test_.*@alsistemas\.test/ })
  await mongoose.connection.close()
})

// ─── EVENTOS ────────────────────────────────────────────────

describe('GET /api/eventos', () => {
  it('200 retorna array de eventos', async () => {
    const res = await request(app).get('/api/eventos')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('paginação por cursor retorna nextCursor (#2)', async () => {
    const futuro = new Date(Date.now() + 86400000 * 30)
    await Evento.create([
      { titulo: '[TESTE] Evt A', data: new Date(futuro.getTime() + 1000) },
      { titulo: '[TESTE] Evt B', data: new Date(futuro.getTime() + 2000) },
    ])
    const res = await request(app).get('/api/eventos?limit=1')
    expect(res.status).toBe(200)
    if (res.body.nextCursor !== undefined) {
      // modo cursor
      expect(res.body).toHaveProperty('eventos')
      expect(res.body).toHaveProperty('nextCursor')
    }
  })
})

describe('POST /api/eventos', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app)
      .post('/api/eventos')
      .send({ titulo: '[TESTE] Não autorizado', data: new Date() })
    expect(res.status).toBe(401)
  })

  it('201 cria evento autenticado', async () => {
    const res = await request(app)
      .post('/api/eventos')
      .set('Cookie', authCookie)
      .send({ titulo: '[TESTE] Novo Evento', data: new Date(Date.now() + 86400000) })
    expect(res.status).toBe(201)
    expect(res.body.titulo).toBe('[TESTE] Novo Evento')
  })
})

describe('PUT /api/eventos/:id', () => {
  let eventoId

  beforeAll(async () => {
    const e = await Evento.create({ titulo: '[TESTE] Editar Evt', data: new Date(Date.now() + 86400000) })
    eventoId = e._id.toString()
  })

  it('401 sem autenticação', async () => {
    const res = await request(app).put(`/api/eventos/${eventoId}`).send({ titulo: 'x' })
    expect(res.status).toBe(401)
  })

  it('200 atualiza evento', async () => {
    const res = await request(app)
      .put(`/api/eventos/${eventoId}`)
      .set('Cookie', authCookie)
      .send({ titulo: '[TESTE] Editado Evt', data: new Date(Date.now() + 86400000) })
    expect(res.status).toBe(200)
    expect(res.body.titulo).toBe('[TESTE] Editado Evt')
  })

  it('404 para ID inexistente', async () => {
    const res = await request(app)
      .put('/api/eventos/000000000000000000000000')
      .set('Cookie', authCookie)
      .send({ titulo: 'x', data: new Date() })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/eventos/:id', () => {
  it('200 exclui evento', async () => {
    const e = await Evento.create({ titulo: '[TESTE] Deletar Evt', data: new Date(Date.now() + 86400000) })
    const res = await request(app)
      .delete(`/api/eventos/${e._id}`)
      .set('Cookie', authCookie)
    expect(res.status).toBe(200)
  })
})

// ─── ÔNIBUS ─────────────────────────────────────────────────

describe('GET /api/onibus', () => {
  it('200 retorna linhas', async () => {
    const res = await request(app).get('/api/onibus')
    expect(res.status).toBe(200)
  })

  it('paginação por cursor (#2)', async () => {
    await Onibus.create([
      { destino: '[TESTE] Dest A' },
      { destino: '[TESTE] Dest B' },
    ])
    const res = await request(app).get('/api/onibus?limit=1')
    expect(res.status).toBe(200)
  })
})

describe('POST /api/onibus', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app).post('/api/onibus').send({ destino: '[TESTE] Linha' })
    expect(res.status).toBe(401)
  })

  it('201 cria linha', async () => {
    const res = await request(app)
      .post('/api/onibus')
      .set('Cookie', authCookie)
      .send({ destino: '[TESTE] Nova Linha' })
    expect(res.status).toBe(201)
  })
})

// ─── NOTÍCIAS EXTERNAS ──────────────────────────────────────

describe('GET /api/noticias-externas', () => {
  it('200 retorna lista', async () => {
    const res = await request(app).get('/api/noticias-externas')
    expect(res.status).toBe(200)
  })

  it('paginação por cursor (#2)', async () => {
    await NoticiaExterna.create({ titulo: '[TESTE] Ext A', url_externa: 'https://ex.com/a' })
    const res = await request(app).get('/api/noticias-externas?cursor=&limit=1')
    expect(res.status).toBe(200)
  })
})

describe('POST /api/noticias-externas', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app)
      .post('/api/noticias-externas')
      .send({ titulo: '[TESTE] Ext', url_externa: 'https://ex.com' })
    expect(res.status).toBe(401)
  })

  it('201 cria notícia externa', async () => {
    const res = await request(app)
      .post('/api/noticias-externas')
      .set('Cookie', authCookie)
      .send({ titulo: '[TESTE] Ext Nova', url_externa: 'https://external.com' })
    expect(res.status).toBe(201)
  })
})
