import { useState } from 'react'
import { Mail, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { newsletterService } from '../services/api'

/**
 * NewsletterForm — formulário de inscrição na newsletter.
 *
 * Props:
 *   variante  'dark' (padrão, para fundo escuro do rodapé)
 *           | 'light' (para fundo claro)
 */
export default function NewsletterForm({ variante = 'dark' }) {
  const [email,      setEmail]      = useState('')
  const [nome,       setNome]       = useState('')
  const [enviando,   setEnviando]   = useState(false)
  const [sucesso,    setSucesso]    = useState(false)
  const [erro,       setErro]       = useState('')

  const isDark = variante === 'dark'

  async function handleSubmit(e) {
    e.preventDefault()
    const emailTrim = email.trim()
    if (!emailTrim) { setErro('Informe seu email.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) { setErro('Email inválido.'); return }

    setErro('')
    setEnviando(true)
    try {
      await newsletterService.assinar(emailTrim, nome.trim())
      setSucesso(true)
      setEmail('')
      setNome('')
    } catch (err) {
      setErro(err.message || 'Não foi possível realizar a inscrição. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  if (sucesso) {
    return (
      <div className={`flex flex-col items-center gap-3 py-2 text-center ${isDark ? 'text-white' : 'text-gray-800'}`}>
        <CheckCircle2 size={36} className="text-green-400" aria-hidden="true" />
        <p className="font-bold text-lg">Inscrição confirmada!</p>
        <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-500'}`}>
          Você receberá um resumo semanal das principais notícias de Iguatama.
        </p>
        <button
          onClick={() => setSucesso(false)}
          className={`text-xs underline mt-1 ${isDark ? 'text-white/50 hover:text-white/80' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Inscrever outro email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-md mx-auto space-y-3">
      <div className={`flex items-center gap-2 mb-1 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        <Mail size={18} aria-hidden="true" />
        <p className="font-bold text-base">Receba as notícias por email</p>
      </div>
      <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-500'}`}>
        Resumo semanal das principais histórias de Iguatama, direto na sua caixa de entrada.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label htmlFor="newsletter-nome" className="sr-only">Seu nome (opcional)</label>
          <input
            id="newsletter-nome"
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Seu nome (opcional)"
            maxLength={80}
            className={`w-full text-sm rounded-xl px-4 py-2.5 border focus:outline-none focus:ring-2
              ${isDark
                ? 'bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-white/30 focus:border-white/40'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-forest-400 focus:border-forest-400'
              }`}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="newsletter-email" className="sr-only">Seu email</label>
          <input
            id="newsletter-email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErro('') }}
            placeholder="seu@email.com"
            required
            aria-required="true"
            aria-describedby={erro ? 'newsletter-erro' : undefined}
            aria-invalid={!!erro}
            className={`w-full text-sm rounded-xl px-4 py-2.5 border focus:outline-none focus:ring-2
              ${erro
                ? 'border-red-400 focus:ring-red-300'
                : isDark
                  ? 'bg-white/10 border-white/20 text-white placeholder-white/40 focus:ring-white/30 focus:border-white/40'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-forest-400 focus:border-forest-400'
              }`}
          />
        </div>
        <button
          type="submit"
          disabled={enviando}
          aria-label="Inscrever na newsletter"
          className={`flex-shrink-0 flex items-center gap-1.5 font-bold text-sm rounded-xl px-4 py-2.5
                      transition-all disabled:opacity-50 disabled:cursor-not-allowed
                      ${isDark
                        ? 'bg-white text-gray-900 hover:bg-gray-100'
                        : 'bg-brand-500 text-white hover:bg-brand-600'
                      }`}
        >
          {enviando
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <ArrowRight size={16} aria-hidden="true" />
          }
          {enviando ? 'Aguarde...' : 'Inscrever'}
        </button>
      </div>

      {erro && (
        <p id="newsletter-erro" role="alert" className="text-red-400 text-xs font-semibold">
          {erro}
        </p>
      )}
    </form>
  )
}
