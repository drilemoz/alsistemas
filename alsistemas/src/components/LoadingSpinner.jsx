export default function LoadingSpinner({ texto = 'Carregando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">{texto}</p>
    </div>
  )
}
