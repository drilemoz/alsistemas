import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Newspaper, Mail, ArrowLeft } from 'lucide-react'
import { authService } from '../services/api'
import toast from 'react-hot-toast'

export default function EsqueciSenha() {
  const [email,    setEmail]   = useState('')
  const [loading,  setLoading] = useState(false)
  const [enviado,  setEnviado] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) { toast.error('Informe seu email'); return }
    try {
      setLoading(true)
      await authService.esqueciSenha(email.trim())
      setEnviado(true)
    } catch (err) {
      // Mesmo em erro, exibimos mensagem genérica para não revelar emails cadastrados
      setEnviado(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50
                    flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center
                          mx-auto mb-3 shadow-lg">
            <Newspaper size={26} className="text-white" />
          </div>
          <h1 className="font-heading text-2xl font-bold">
            Igua<span className="text-green-600">News</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Recuperação de senha</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7">
          {enviado ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={22} className="text-green-600" />
              </div>
              <h2 className="font-heading font-bold text-lg text-gray-800 mb-2">Verifique seu email</h2>
              <p className="text-gray-500 text-sm mb-6">
                Se o email <strong>{email}</strong> estiver cadastrado, você receberá as instruções em breve.
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Não recebeu? Verifique a pasta de spam ou solicite novamente em alguns minutos.
              </p>
              <Link to="/login" className="btn-primary w-full justify-center py-2.5 inline-flex items-center gap-2 text-sm">
                <ArrowLeft size={15} /> Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-heading font-bold text-xl text-gray-800 mb-2">Esqueceu sua senha?</h2>
              <p className="text-gray-500 text-sm mb-5">
                Informe seu email e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email cadastrado</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    placeholder="admin@al-sistemas.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Mail size={16} /> Enviar link de recuperação
                    </span>
                  )}
                </button>
              </form>

              <div className="text-center mt-4">
                <Link to="/login" className="text-xs text-gray-400 hover:text-green-600 transition-colors inline-flex items-center gap-1">
                  <ArrowLeft size={12} /> Voltar ao login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
