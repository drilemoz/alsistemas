import { useState, useRef } from 'react'
import { Bold, Italic, Heading2, List, Link2, Eye, Edit3, Quote } from 'lucide-react'
import { markdownParaHtml } from '../utils/markdown'

export default function MarkdownEditor({ value, onChange, error }) {
  const [aba, setAba] = useState('escrever')
  const ref           = useRef(null)

  // Insere sintaxe em volta da seleção atual
  function wrap(antes, depois = antes) {
    const el = ref.current
    if (!el) return
    const s   = el.selectionStart
    const e   = el.selectionEnd
    const sel = value.slice(s, e) || 'texto'
    const novo = value.slice(0, s) + antes + sel + depois + value.slice(e)
    onChange(novo)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(s + antes.length, s + antes.length + sel.length)
    }, 0)
  }

  // Insere texto no início da linha atual
  function prefixLinha(prefix) {
    const el = ref.current
    if (!el) return
    const s     = el.selectionStart
    const inicio = value.lastIndexOf('\n', s - 1) + 1
    const novo  = value.slice(0, inicio) + prefix + value.slice(inicio)
    onChange(novo)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(s + prefix.length, s + prefix.length)
    }, 0)
  }

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); wrap('**') }
      if (e.key === 'i') { e.preventDefault(); wrap('*') }
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const el  = e.target
      const s   = el.selectionStart
      const novo = value.slice(0, s) + '  ' + value.slice(el.selectionEnd)
      onChange(novo)
      setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0)
    }
  }

  const ferramentas = [
    { icon: Bold,    title: 'Negrito · Ctrl+B', fn: () => wrap('**') },
    { icon: Italic,  title: 'Itálico · Ctrl+I', fn: () => wrap('*')  },
    { icon: Heading2,title: 'Título H2',        fn: () => prefixLinha('## ') },
    { icon: List,    title: 'Lista',             fn: () => prefixLinha('- ')  },
    { icon: Quote,   title: 'Citação',           fn: () => prefixLinha('> ')  },
    { icon: Link2,   title: 'Link',              fn: () => wrap('[', '](url)') },
  ]

  return (
    <div className={`border rounded-xl overflow-hidden bg-white
                     ${error ? 'border-red-400' : 'border-gray-200 focus-within:border-green-400'}`}>

      {/* Barra de ferramentas */}
      <div className="flex items-center justify-between px-3 py-2
                      bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-0.5">
          {ferramentas.map(({ icon: Icon, title, fn }) => (
            <button key={title} type="button" title={title} onClick={fn}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800
                         hover:bg-gray-200 transition-colors">
              <Icon size={14} strokeWidth={2.5}/>
            </button>
          ))}
        </div>

        {/* Tabs Escrever / Visualizar */}
        <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
          {[
            { id: 'escrever', icon: Edit3, label: 'Escrever' },
            { id: 'preview',  icon: Eye,   label: 'Visualizar' },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold
                          transition-colors ${aba === id
                            ? 'bg-forest-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={11}/> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Área de conteúdo */}
      {aba === 'escrever' ? (
        <textarea
          ref={ref}
          rows={14}
          className="w-full px-4 py-3 text-sm text-gray-800 leading-relaxed resize-y
                     font-mono focus:outline-none placeholder-gray-400"
          placeholder={"Escreva o conteúdo...\n\nDica: **negrito**  *itálico*  ## Título  - item de lista"}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className="min-h-[14rem] px-5 py-4 overflow-auto">
          {value.trim() ? (
            <div
              className="prose-news"
              dangerouslySetInnerHTML={{ __html: markdownParaHtml(value) }}
            />
          ) : (
            <p className="text-gray-400 italic text-sm">Nada para visualizar ainda…</p>
          )}
        </div>
      )}

      {/* Rodapé com dica */}
      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex items-center
                      justify-between">
        <span className="text-[11px] text-gray-400 font-mono">
          **negrito** · *itálico* · ## título · - lista · {'>'} citação
        </span>
        <span className="text-[11px] text-gray-400">{value.length} chars</span>
      </div>
    </div>
  )
}
