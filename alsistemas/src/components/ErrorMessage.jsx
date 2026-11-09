import { AlertCircle, RefreshCw } from 'lucide-react'

export default function ErrorMessage({ mensagem, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
        <AlertCircle size={28} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-gray-700">Algo deu errado</p>
        <p className="text-gray-400 text-sm mt-1">{mensagem}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-sm">
          <RefreshCw size={15} /> Tentar novamente
        </button>
      )}
    </div>
  )
}
