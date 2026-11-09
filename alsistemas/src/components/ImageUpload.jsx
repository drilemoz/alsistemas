import { useState, useRef } from 'react'
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react'
import { storageService } from '../services/api'
import toast from 'react-hot-toast'

export default function ImageUpload({ value, onChange }) {
  const [progresso, setProgresso] = useState(0)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setProgresso(0)
      const resultado = await storageService.upload(file, setProgresso)
      // resultado = { url, public_id } — repassado ao pai para salvar ambos
      onChange(resultado)
      toast.success('Imagem enviada!')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      setProgresso(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remover() {
    onChange('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*"
        onChange={handleFile} className="hidden" id="img-upload" />

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          <img src={value} alt="Preview" className="w-full h-52 object-cover" />
          <button type="button" onClick={remover}
            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600
                       text-white rounded-full p-1.5 transition-colors shadow">
            <X size={14} />
          </button>
        </div>
      ) : (
        <label htmlFor="img-upload"
          className={`flex flex-col items-center justify-center gap-3 h-44 border-2
                      border-dashed rounded-xl cursor-pointer transition-colors
                      ${uploading
                        ? 'border-green-300 bg-green-50 cursor-wait'
                        : 'border-gray-300 hover:border-green-400 hover:bg-green-50'}`}>
          {uploading ? (
            <>
              <Loader2 size={26} className="text-green-500 animate-spin" />
              <div className="w-32 bg-gray-200 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${progresso}%` }} />
              </div>
              <p className="text-sm text-green-600 font-medium">Enviando {progresso}%</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <ImageIcon size={22} className="text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1 justify-center">
                  <Upload size={14} /> Clique para enviar
                </p>
                <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, WebP • máx 1MB</p>
              </div>
            </>
          )}
        </label>
      )}
    </div>
  )
}
