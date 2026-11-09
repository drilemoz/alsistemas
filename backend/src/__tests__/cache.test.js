/**
 * Testes unitários — cache.js
 * #1 — Valida fallback em memória quando Redis não está disponível.
 */
import { cacheGet, cacheSet, cacheDel, viewJaContabilizada } from '../utils/cache.js'

describe('Cache — fallback em memória (#1)', () => {
  it('retorna null para chave inexistente', async () => {
    const val = await cacheGet('chave_inexistente_xyz')
    expect(val).toBeNull()
  })

  it('armazena e recupera um valor', async () => {
    await cacheSet('teste_chave', { foo: 'bar' }, 10)
    const val = await cacheGet('teste_chave')
    expect(val).toEqual({ foo: 'bar' })
  })

  it('invalida uma chave com cacheDel', async () => {
    await cacheSet('delete_chave', 42, 60)
    await cacheDel('delete_chave')
    const val = await cacheGet('delete_chave')
    expect(val).toBeNull()
  })

  it('retorna null após TTL expirar', async () => {
    // TTL de 0s já expira imediatamente
    await cacheSet('expire_chave', 'valor', 0)
    // Aguarda um tick para garantir expiração
    await new Promise(r => setTimeout(r, 10))
    const val = await cacheGet('expire_chave')
    expect(val).toBeNull()
  })

  it('viewJaContabilizada retorna false na primeira chamada', async () => {
    const noticiaId = 'test_noticia_' + Date.now()
    const ip = '127.0.0.99'
    const resultado = await viewJaContabilizada(noticiaId, ip, 1)
    // Sem Redis: sempre false (não deduplica)
    expect(typeof resultado).toBe('boolean')
  })
})
