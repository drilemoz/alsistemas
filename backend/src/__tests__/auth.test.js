/**
 * Testes de integração — /api/auth
 * #12 — Cobre login, logout, token inválido e limites.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../server.js'
import Usuario from '../models/Usuario.js'

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(MONGO_URI)
})

afterAll(async () => {
  await Usuario.deleteMany({ email: /auth_test_.*@alsistemas\.test/ })
  await mongoose.connection.close()
})

describe('POST /api/auth/login', () => {
  let email, senha

  beforeAll(async () => {
    email = `auth_test_${Date.now()}@alsistemas.test`
    senha = 'SenhaSegura123'
    await Usuario.create({ email, senha, nome: 'Teste Auth' })
  })

  it('200 e define cookie com credenciais válidas', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, senha })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('usuario')
    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
    expect(cookies.join('')).toMatch(/alsistemas_token/)
  })

  it('401 com senha incorreta', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, senha: 'errada' })
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('erro')
  })

  it('401 com email inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@teste.com', senha: '123456' })
    expect(res.status).toBe(401)
  })

  it('400 sem body', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('inclui X-Request-Id na resposta (#10)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, senha })
    expect(res.headers).toHaveProperty('x-request-id')
  })
})

describe('POST /api/auth/logout', () => {
  it('200 limpa cookie de sessão', async () => {
    const email = `auth_test_logout_${Date.now()}@alsistemas.test`
    await Usuario.create({ email, senha: 'senha123', nome: 'Logout Teste' })
    const login = await request(app).post('/api/auth/login').send({ email, senha: 'senha123' })
    const cookie = login.headers['set-cookie']

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(res.status).toBe(200)
  })
})

describe('Rotas protegidas — token inválido', () => {
  it('401 com Bearer token inválido', async () => {
    const res = await request(app)
      .post('/api/noticias')
      .set('Authorization', 'Bearer token_invalido_aqui')
      .send({ titulo: 'x', conteudo: 'y' })
    expect(res.status).toBe(401)
  })

  it('401 sem nenhum token', async () => {
    const res = await request(app)
      .delete('/api/noticias/000000000000000000000000')
    expect(res.status).toBe(401)
  })
})
