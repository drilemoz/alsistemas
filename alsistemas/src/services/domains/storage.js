import { api, BASE_URL } from './http.js'

export const storageService = {
  async upload(file, onProgress) {
    if (!file) throw new Error('Nenhum arquivo selecionado')
    if (!file.type.startsWith('image/')) throw new Error('Apenas imagens são permitidas')
    if (file.size > 5 * 1024 * 1024) throw new Error('Imagem deve ter no máximo 5MB')

    const formData = new FormData()
    formData.append('imagem', file)
    onProgress?.(30)

    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.erro || 'Erro no upload')
    onProgress?.(100)
    return { url: data.url, public_id: data.public_id }
  },
  async remover(public_id) {
    if (!public_id) return
    await api('/upload', { method: 'DELETE', body: JSON.stringify({ public_id }) })
  },
}
