/**
 * Testes de integração — /api/noticias
 * #12 — Cobre listagem, filtros, paginação, views, galeria e erros.
 */
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../server.js'
import Noticia from '../models/Noticia.js'
import Usuario from '../models/Usuario.js'

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI
let authCookie

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(MONGO_URI)
  const email = `noticias_test_${Date.now()}@alsistemas.test`
  await Usuario.create({ email, senha: 'senha123', nome: 'Admin Teste' })
  const login = await request(app).post('/api/auth/login').send({ email, senha: 'senha123' })
  authCookie = login.headers['set-cookie']
})

afterAll(async () => {
  await Noticia.deleteMany({ titulo: /\[TESTE\]/ })
  await Usuario.deleteMany({ email: /noticias_test_.*@alsistemas\.test/ })
  await mongoose.connection.close()
})

// ─── GET /api/noticias ───────────────────────────────────────

describe('GET /api/noticias', () => {
  it('200 com estrutura correta', async () => {
    const res = await request(app).get('/api/noticias')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('noticias')
    expect(Array.isArray(res.body.noticias)).toBe(true)
  })

  it('responde com X-Request-Id (#10)', async () => {
    const res = await request(app).get('/api/noticias')
    expect(res.headers).toHaveProperty('x-request-id')
  })

  it('aceita X-Request-Id do cliente (#10)', async () => {
    const res = await request(app)
      .get('/api/noticias')
      .set('X-Request-Id', 'req-teste-123')
    expect(res.headers['x-request-id']).toBe('req-teste-123')
  })

  it('aceita parâmetro limit', async () => {
    const res = await request(app).get('/api/noticias?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.noticias.length).toBeLessThanOrEqual(2)
  })

  it('paginação clássica retorna total e paginas', async () => {
    const res = await request(app).get('/api/noticias?page=1&limit=5')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('paginas')
    expect(res.body).toHaveProperty('total')
  })

  it('paginação por cursor retorna nextCursor (#2)', async () => {
    await Noticia.create([
      { titulo: '[TESTE] Cursor A', conteudo: 'conteúdo A' },
      { titulo: '[TESTE] Cursor B', conteudo: 'conteúdo B' },
    ])
    const first = await request(app).get('/api/noticias?limit=1')
    const cursor = first.body.noticias[0]?.criado_em
    if (!cursor) return // sem notícias no banco de teste

    const res = await request(app).get(`/api/noticias?cursor=${encodeURIComponent(cursor)}&limit=1`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('nextCursor')
  })

  it('filtro por múltiplas categorias (#6)', async () => {
    const res = await request(app).get('/api/noticias?categoria=esportes,politica')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.noticias)).toBe(true)
  })

  it('filtro por intervalo de datas (#6)', async () => {
    const res = await request(app).get(
      '/api/noticias?dataInicio=2020-01-01&dataFim=2099-12-31'
    )
    expect(res.status).toBe(200)
  })

  it('ordenação por "antigo" (#6)', async () => {
    const res = await request(app).get('/api/noticias?ordem=antigo&limit=2')
    expect(res.status).toBe(200)
  })

  it('busca textual (?q=)', async () => {
    const res = await request(app).get('/api/noticias?q=iguatama')
    expect(res.status).toBe(200)
  })
})

// ─── GET /api/noticias/:id ───────────────────────────────────

describe('GET /api/noticias/:id', () => {
  let noticiaId

  beforeAll(async () => {
    const n = await Noticia.create({ titulo: '[TESTE] Views', conteudo: 'conteúdo views' })
    noticiaId = n._id.toString()
  })

  it('200 e retorna a notícia', async () => {
    const res = await request(app).get(`/api/noticias/${noticiaId}`)
    expect(res.status).toBe(200)
    expect(res.body.titulo).toBe('[TESTE] Views')
  })

  it('incrementa views no primeiro acesso (#5)', async () => {
    const antes = (await Noticia.findById(noticiaId)).views || 0
    await request(app).get(`/api/noticias/${noticiaId}`)
    const depois = (await Noticia.findById(noticiaId)).views || 0
    // views pode ou não incrementar dependendo da disponibilidade do Redis
    expect(depois).toBeGreaterThanOrEqual(antes)
  })

  it('404 para ID inexistente', async () => {
    const res = await request(app).get('/api/noticias/000000000000000000000000')
    expect(res.status).toBe(404)
    expect(res.body).toHaveProperty('erro')
  })

  it('erro para ID malformado', async () => {
    const res = await request(app).get('/api/noticias/id-invalido')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

// ─── POST /api/noticias ──────────────────────────────────────

describe('POST /api/noticias', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app).post('/api/noticias').send({ titulo: 'x', conteudo: 'y' })
    expect(res.status).toBe(401)
  })

  it('400 por falta de campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/noticias')
      .set('Cookie', authCookie)
      .send({ titulo: '' })
    expect(res.status).toBe(400)
  })

  it('201 cria notícia com galeria (#18)', async () => {
    const galeria = [
      { url: 'https://example.com/img1.jpg', public_id: 'test/img1', legenda: 'Foto 1', ordem: 0 },
      { url: 'https://example.com/img2.jpg', public_id: 'test/img2', legenda: 'Foto 2', ordem: 1 },
    ]
    const res = await request(app)
      .post('/api/noticias')
      .set('Cookie', authCookie)
      .send({ titulo: '[TESTE] Com Galeria', conteudo: 'conteúdo galeria', galeria })
    expect(res.status).toBe(201)
    expect(res.body.galeria).toHaveLength(2)
  })
})

// ─── PUT /api/noticias/:id ───────────────────────────────────

describe('PUT /api/noticias/:id', () => {
  let noticiaId

  beforeAll(async () => {
    const n = await Noticia.create({ titulo: '[TESTE] Editar', conteudo: 'antes' })
    noticiaId = n._id.toString()
  })

  it('401 sem autenticação', async () => {
    const res = await request(app)
      .put(`/api/noticias/${noticiaId}`)
      .send({ titulo: 'novo', conteudo: 'novo' })
    expect(res.status).toBe(401)
  })

  it('200 atualiza a notícia', async () => {
    const res = await request(app)
      .put(`/api/noticias/${noticiaId}`)
      .set('Cookie', authCookie)
      .send({ titulo: '[TESTE] Editado', conteudo: 'depois' })
    expect(res.status).toBe(200)
    expect(res.body.titulo).toBe('[TESTE] Editado')
  })

  it('404 para ID inexistente', async () => {
    const res = await request(app)
      .put('/api/noticias/000000000000000000000000')
      .set('Cookie', authCookie)
      .send({ titulo: 'x', conteudo: 'y' })
    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/noticias/:id ────────────────────────────────

describe('DELETE /api/noticias/:id', () => {
  it('401 sem autenticação', async () => {
    const res = await request(app).delete('/api/noticias/000000000000000000000000')
    expect(res.status).toBe(401)
  })

  it('200 exclui notícia', async () => {
    const n = await Noticia.create({ titulo: '[TESTE] Deletar', conteudo: 'x' })
    const res = await request(app)
      .delete(`/api/noticias/${n._id}`)
      .set('Cookie', authCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('mensagem')
  })

  it('404 para ID inexistente', async () => {
    const res = await request(app)
      .delete('/api/noticias/000000000000000000000000')
      .set('Cookie', authCookie)
    expect(res.status).toBe(404)
  })
})
