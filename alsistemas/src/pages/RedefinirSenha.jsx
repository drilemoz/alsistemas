import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Newspaper, Eye, EyeOff, KeyRound, ArrowLeft } from 'lucide-react'
import { authService } from '../services/api'
import toast from 'react-hot-toast'

// ── Indicador visual de força de senha ───────────────────────────────────────
function ForcaSenha({ senha }) {
  if (!senha) return null
  let pontos = 0
  if (senha.length >= 8)              pontos++
  if (/[a-zA-Z]/.test(senha))         pontos++
  if (/[0-9]/.test(senha))            pontos++
  if (/[^a-zA-Z0-9]/.test(senha))     pontos++

  const niveis = [
    { label: 'Muito fraca', cor: '#ef4444' },
    { label: 'Fraca',       cor: '#f97316' },
    { label: 'Média',       cor: '#eab308' },
    { label: 'Forte',       cor: '#22c55e' },
    { label: 'Muito forte', cor: '#16a34a' },
  ]
  const nivel = niveis[Math.max(0, pontos - 1)]

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-colors"
            style={{ background: i <= pontos ? nivel.cor : '#e5e7eb' }} />
        ))}
      </div>
      <span className="text-xs font-semibold" style={{ color: nivel.cor }}>{nivel.label}</span>
    </div>
  )
}

export default function RedefinirSenha() {
  const [params]           = useSearchParams()
  const navigate           = useNavigate()
  const token              = params.get('token') || ''

  const [senha,        setSenha]        = useState('')
  const [confirmacao,  setConfirmacao]  = useState('')
  const [mostrar1,     setMostrar1]     = useState(false)
  const [mostrar2,     setMostrar2]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [concluido,    setConcluido]    = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7 w-full max-w-sm text-center">
          <p className="text-gray-700 font-semibold mb-2">Link inválido</p>
          <p className="text-sm text-gray-500 mb-4">Este link de redefinição é inválido ou está incompleto.</p>
          <Link to="/esqueci-senha" className="btn-primary justify-center py-2.5 inline-flex text-sm">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (senha.length < 8)                  { toast.error('Senha mínimo 8 caracteres'); return }
    if (!/[0-9]/.test(senha))              { toast.error('Inclua ao menos um número'); return }
    if (!/[^a-zA-Z0-9]/.test(senha))       { toast.error('Inclua ao menos um símbolo'); return }
    if (senha !== confirmacao)             { toast.error('As senhas não coincidem'); return }

    try {
      setLoading(true)
      await authService.redefinirSenha(token, senha)
      setConcluido(true)
      toast.success('Senha redefinida com sucesso!')
    } catch (err) {
      toast.error(err.message || 'Token inválido ou expirado.')
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
          <p className="text-gray-500 text-sm mt-1">Redefinir senha</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7">
          {concluido ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound size={22} className="text-green-600" />
              </div>
              <h2 className="font-heading font-bold text-lg text-gray-800 mb-2">Senha alterada!</h2>
              <p className="text-gray-500 text-sm mb-6">
                Sua senha foi redefinida com sucesso. Faça login com a nova senha.
              </p>
              <button onClick={() => navigate('/login')}
                className="btn-primary w-full justify-center py-2.5 inline-flex items-center gap-2 text-sm">
                Ir para o login
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-heading font-bold text-xl text-gray-800 mb-2">Nova senha</h2>
              <p className="text-gray-500 text-sm mb-5">
                Escolha uma senha forte com pelo menos 8 caracteres, incluindo letras, números e um símbolo.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="senha">Nova senha</label>
                  <div className="relative">
                    <input
                      id="senha"
                      type={mostrar1 ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Mínimo 8 caracteres"
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      disabled={loading}
                    />
                    <button type="button" onClick={() => setMostrar1(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {mostrar1 ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <ForcaSenha senha={senha} />
                </div>

                <div>
                  <label className="label" htmlFor="confirmacao">Confirmar nova senha</label>
                  <div className="relative">
                    <input
                      id="confirmacao"
                      type={mostrar2 ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Repita a senha"
                      value={confirmacao}
                      onChange={e => setConfirmacao(e.target.value)}
                      disabled={loading}
                    />
                    <button type="button" onClick={() => setMostrar2(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {mostrar2 ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmacao && senha !== confirmacao && (
                    <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
                  )}
                  {confirmacao && senha === confirmacao && confirmacao.length >= 8 && (
                    <p className="text-xs text-green-600 mt-1">✓ Senhas coincidem</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full justify-center py-2.5">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <KeyRound size={16} /> Redefinir senha
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
