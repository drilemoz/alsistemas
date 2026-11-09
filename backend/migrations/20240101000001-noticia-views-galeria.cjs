/**
 * #11 — Migration: adicionar campos views e galeria às notícias existentes.
 * #5  — Campo views (default 0)
 * #18 — Campo galeria (array vazio)
 */
module.exports = {
  async up(db) {
    await db.collection('noticias').updateMany(
      { views: { $exists: false } },
      { $set: { views: 0, galeria: [] } }
    )
    console.log('✅ Campos views e galeria adicionados às notícias existentes')
  },

  async down(db) {
    await db.collection('noticias').updateMany(
      {},
      { $unset: { views: '', galeria: '' } }
    )
    console.log('⏪ Campos views e galeria removidos')
  },
}
