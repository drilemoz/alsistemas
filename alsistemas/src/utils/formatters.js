export function formatarData(dataStr) {
  if (!dataStr) return ''
  const d = new Date(dataStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatarDataRelativa(dataStr) {
  if (!dataStr) return ''
  const data = new Date(dataStr)
  const agora = new Date()
  const diff = Math.floor((agora - data) / 1000)
  if (diff < 60)     return 'agora mesmo'
  if (diff < 3600)   return `${Math.floor(diff / 60)} min atrás`
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return `${h} hora${h !== 1 ? 's' : ''} atrás`
  }
  if (diff < 604800) {
    const d = Math.floor(diff / 86400)
    return `${d} dia${d !== 1 ? 's' : ''} atrás`
  }
  return formatarData(dataStr)
}
