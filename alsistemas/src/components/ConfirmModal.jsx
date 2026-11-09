import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * ConfirmModal — substitui window.confirm com um modal acessível.
 *
 * Props:
 *   aberto      boolean   — exibe o modal
 *   titulo      string    — ex: 'Excluir categoria'
 *   mensagem    string    — ex: 'As notícias desta categoria ficarão sem categoria.'
 *   labelConfirmar string — ex: 'Excluir' (padrão 'Confirmar')
 *   carregando  boolean   — desativa botões e mostra estado de loading
 *   onConfirmar fn        — chamada ao confirmar
 *   onCancelar  fn        — chamada ao cancelar (ou pressionar Esc)
 *   variante    'danger'|'warning'  — esquema de cor do botão de confirmação
 */
export default function ConfirmModal({
  aberto,
  titulo       = 'Confirmar ação',
  mensagem     = 'Tem certeza que deseja continuar?',
  labelConfirmar = 'Confirmar',
  carregando   = false,
  onConfirmar,
  onCancelar,
  variante     = 'danger',
}) {
  const cancelRef = useRef(null)

  // Foca no botão Cancelar ao abrir (a11y: foco gerenciado)
  useEffect(() => {
    if (aberto) setTimeout(() => cancelRef.current?.focus(), 50)
  }, [aberto])

  // Fecha com Esc
  useEffect(() => {
    if (!aberto) return
    function onKey(e) { if (e.key === 'Escape') onCancelar?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onCancelar])

  if (!aberto) return null

  const btnConfirm = variante === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white'
    : 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400 text-white'

  return (
    /* Overlay */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-titulo"
      aria-describedby="confirm-mensagem"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancelar?.() }}
    >
      {/* Fundo escurecido */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" aria-hidden="true" />

      {/* Painel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
        {/* Botão fechar */}
        <button
          onClick={onCancelar}
          aria-label="Fechar"
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600
                     hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={16} />
        </button>

        {/* Ícone + Título */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            variante === 'danger' ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            <AlertTriangle
              size={20}
              className={variante === 'danger' ? 'text-red-600' : 'text-amber-600'}
            />
          </div>
          <div>
            <h2 id="confirm-titulo" className="font-bold text-gray-900 text-base leading-snug">
              {titulo}
            </h2>
            <p id="confirm-mensagem" className="text-gray-500 text-sm mt-1 leading-relaxed">
              {mensagem}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-2 justify-end mt-6">
          <button
            ref={cancelRef}
            onClick={onCancelar}
            disabled={carregando}
            className="btn-secondary text-sm py-2 px-4"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={carregando}
            className={`inline-flex items-center gap-2 font-bold rounded-lg text-sm py-2 px-4
                        transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
                        disabled:opacity-50 disabled:cursor-not-allowed ${btnConfirm}`}
          >
            {carregando ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Aguarde...
              </>
            ) : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
