import { api } from './http.js'

export const authService = {
  async login(email, senha) {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) })
    return { data: { user: data.usuario }, error: null }
  },
  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    return { error: null }
  },
  async getSession() {
    try {
      const data = await api('/auth/me')
      return { data: { session: { user: data.usuario } }, error: null }
    } catch {
      return { data: { session: null }, error: null }
    }
  },
  onAuthChange(callback) {
    this.getSession().then(({ data }) => { callback('INITIAL_SESSION', data.session) })
    return { data: { subscription: { unsubscribe: () => {} } } }
  },
  async editarMe(dados) {
    const data = await api('/auth/me', { method: 'PUT', body: JSON.stringify(dados) })
    return { data: { user: data.usuario }, error: null }
  },
  async esqueciSenha(email) {
    return api('/auth/esqueci-senha', { method: 'POST', body: JSON.stringify({ email }) })
  },
  async redefinirSenha(token, senha) {
    return api('/auth/redefinir-senha', { method: 'POST', body: JSON.stringify({ token, senha }) })
  },
}
