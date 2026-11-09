/**
 * #11 — Configuração do migrate-mongo.
 * Uso: npm run migrate        (aplica pendentes)
 *       npm run migrate:down  (reverte último)
 *       npm run migrate:status
 */
require('dotenv').config()

const config = {
  mongodb: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/alsistemas',
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs',
  useFileHash: false,
  moduleSystem: 'commonjs',
}

module.exports = config
