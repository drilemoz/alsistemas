/**
 * #11 — Migration: criação dos índices compostos.
 * #3  — Índices listados na documentação de melhorias.
 * Idempotente: createIndex ignora se o índice já existe.
 */

module.exports = {
  async up(db) {
    const noticias = db.collection('noticias')
    const modulos  = db.collection('modulohomes')
    const extras   = db.collection('noticiaexternas')
    const topicos  = db.collection('topicos')
    const onibus   = db.collection('onibus')
    const eventos  = db.collection('eventos')

    // Notícias
    await noticias.createIndex({ categoria_id: 1, criado_em: -1 }, { name: 'idx_cat_data' })
    await noticias.createIndex({ destaque: 1, criado_em: -1 },     { name: 'idx_destaque_data' })
    await noticias.createIndex({ criado_em: -1 },                  { name: 'idx_data' })

    // Módulos
    await modulos.createIndex({ ativo: 1, ordem: 1 }, { name: 'idx_ativo_ordem' })

    // Notícias Externas
    await extras.createIndex({ ativo: 1, ordem: 1 },   { name: 'idx_ativo_ordem' })
    await extras.createIndex({ criado_em: -1 },         { name: 'idx_data' })

    // Tópicos
    await topicos.createIndex({ ativo: 1, ordem: 1 }, { name: 'idx_ativo_ordem' })

    // Ônibus
    await onibus.createIndex({ ativo: 1, ordem: 1 }, { name: 'idx_ativo_ordem' })

    // Eventos
    await eventos.createIndex({ ativo: 1, data: 1 }, { name: 'idx_ativo_data' })

    console.log('✅ Índices compostos criados')
  },

  async down(db) {
    await db.collection('noticias').dropIndex('idx_cat_data').catch(() => {})
    await db.collection('noticias').dropIndex('idx_destaque_data').catch(() => {})
    await db.collection('modulohomes').dropIndex('idx_ativo_ordem').catch(() => {})
    await db.collection('noticiaexternas').dropIndex('idx_ativo_ordem').catch(() => {})
    await db.collection('topicos').dropIndex('idx_ativo_ordem').catch(() => {})
    await db.collection('onibus').dropIndex('idx_ativo_ordem').catch(() => {})
    await db.collection('eventos').dropIndex('idx_ativo_data').catch(() => {})
    console.log('⏪ Índices compostos removidos')
  },
}
