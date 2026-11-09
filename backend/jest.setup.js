// Silencia logs desnecessários durante os testes
process.env.NODE_ENV = 'test'

// Suprime console.log/error do mongoose e do próprio servidor
// (mantém apenas erros críticos)
const originalConsole = { ...console }
global.beforeAll?.(() => {
  console.log  = () => {}
  console.info = () => {}
})
global.afterAll?.(() => {
  console.log  = originalConsole.log
  console.info = originalConsole.info
})
