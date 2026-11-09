/** @type {import('jest').Config} */
export default {
  // Suporte a ESM (o projeto usa "type": "module")
  transform: {},
  testEnvironment: 'node',

  // Padrão de arquivos de teste
  testMatch: ['**/__tests__/**/*.test.js'],

  // Cobertura de código
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/server.js', // arquivo de entrada — coberto pelos testes de integração
  ],

  // Variáveis de ambiente para testes
  testTimeout: 15000, // MongoDB pode demorar para conectar

  // Silencia logs do mongoose durante testes
  setupFiles: ['./jest.setup.js'],
}
