import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSModal, DSBtn } from '../../components/admin/ui/DS'
import { useState, useEffect, useMemo } from 'react'
import {
  Save, Loader2, Plus, Trash2,
  Eye, EyeOff, ExternalLink, Settings, Image,
  Layout, Star, Newspaper, Heart, Bus, CalendarDays,
  Globe, Tag, ChevronDown, ChevronRight
} from 'lucide-react'
import {
  configuracoesService,
  modulosService,
  noticiasExternasService,
  topicosService,
} from '../../services/api'
import toast from 'react-hot-toast'
import ConfirmModal from '../../components/ConfirmModal'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

// ─── Mapeamento de nomes de módulos ──────────────────────────
const MODULO_LABELS = {
  hero: 'Hero / Capa',
  topicos: 'Faixa de Tópicos',
  ultimas_noticias: 'Últimas Notícias',
  noticias_externas: 'Notícias do Brasil e do Mundo',
  destaques: 'Destaques',
  'horario-onibus': 'Horário de Ônibus',
  eventos: 'Agenda de Eventos',
  'historia-cidade': 'História da Cidade',
  'belezas-naturais': 'Belezas Naturais',
}

const MODULO_DESC = {
  'horario-onibus': 'Exibe o próximo horário de ônibus na faixa de tópicos da home',
  eventos: 'Exibe o próximo evento na faixa de tópicos da home',
}

// ─── Seção: Configurações do Hero ────────────────────────────
function SecaoHero({ cfg, onChange }) {
  const fields = [
    { key: 'hero_titulo_linha1', label: 'Título linha 1', placeholder: 'Nossa cidade,' },
    { key: 'hero_titulo_linha2', label: 'Título linha 2 (itálico)', placeholder: 'nossa história.' },
    { key: 'hero_subtitulo', label: 'Subtítulo', placeholder: 'Seu portal de notícias...' },
    { key: 'hero_imagem_url', label: 'URL da imagem de fundo', placeholder: 'https://... (deixe vazio para gradiente)' },
    { key: 'hero_btn1_label', label: 'Botão 1 — Texto', placeholder: 'Últimas Notícias' },
    { key: 'hero_btn1_link', label: 'Botão 1 — Link', placeholder: '/#noticias' },
    { key: 'hero_btn2_label', label: 'Botão 2 — Texto', placeholder: 'Curiosidades' },
    { key: 'hero_btn2_link', label: 'Botão 2 — Link', placeholder: '/?categoria=curiosidades' },
  ]

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4 }}>Configurações do Hero</h3>
        <p style={{ fontSize: 13, color: 'var(--adm-muted)' }}>Personalize a seção principal da home</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key} className="adm-field">
            <label className="adm-label">{f.label}</label>
            <input
              className="adm-input"
              value={cfg[f.key] || ''}
              placeholder={f.placeholder}
              onChange={e => onChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Seção: Redes Sociais & Rodapé ───────────────────────────
function SecaoFooter({ cfg, onChange }) {
  const fields = [
    { key: 'footer_texto_secundario', label: 'Frase em itálico do rodapé', placeholder: 'Iguatama é feita de histórias...' },
    { key: 'social_facebook', label: 'Facebook URL', placeholder: 'https://facebook.com/...' },
    { key: 'social_instagram', label: 'Instagram URL', placeholder: 'https://instagram.com/...' },
    { key: 'social_youtube', label: 'YouTube URL', placeholder: 'https://youtube.com/...' },
    { key: 'social_whatsapp', label: 'WhatsApp Link', placeholder: 'https://wa.me/55...' },
  ]

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4 }}>Redes Sociais e Rodapé</h3>
        <p style={{ fontSize: 13, color: 'var(--adm-muted)' }}>Configure os links exibidos no rodapé do site</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {fields.map(f => (
          <div key={f.key} className="adm-field">
            <label className="adm-label">{f.label}</label>
            <input
              className="adm-input"
              value={cfg[f.key] || ''}
              placeholder={f.placeholder}
              onChange={e => onChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Seção: Tópicos ──────────────────────────────────────────
const ICON_OPCOES = [
  { value: 'church', label: '⛪ Igreja (church)' },
  { value: 'mountain', label: '⛰️ Montanha (mountain)' },
  { value: 'users', label: '👥 Pessoas (users)' },
  { value: 'calendarDays', label: '📅 Eventos (calendarDays)' },
  { value: 'bus', label: '🚌 Ônibus (bus)' },
  { value: 'heart', label: '❤️ Coração (heart)' },
  { value: 'book', label: '📖 Livro (book)' },
  { value: 'globe', label: '🌎 Globo (globe)' },
  { value: 'star', label: '⭐ Estrela (star)' },
  { value: 'newspaper', label: '📰 Jornal (newspaper)' },
]

function SecaoTopicos() {
  const [topicos, setTopicos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(null)
  const [confirmTopico, setConfirmTopico] = useState({ aberto: false, id: null, carregando: false })

  useEffect(() => {
    topicosService.listarTodos().then(setTopicos).finally(() => setLoading(false))
  }, [])

  async function salvarTopico(t) {
    setSalvando(t.id)
    try {
      await topicosService.editar(t.id, {
        icone: t.icone, label: t.label, descricao: t.descricao,
        link: t.link, ativo: t.ativo, ordem: t.ordem,
      })
      toast.success('Tópico salvo!')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSalvando(null)
    }
  }

  async function excluirTopico(id) {
    setConfirmTopico({ aberto: true, id }); return
  }

  async function confirmarExcluirTopico() {
    const id = confirmTopico.id
    setConfirmTopico(c => ({ ...c, carregando: true }))
    try {
      await topicosService.excluir(id)
      setTopicos(t => t.filter(x => x.id !== id))
      toast.success('Tópico excluído!')
      setConfirmTopico({ aberto: false, id: null, carregando: false })
    } catch (e) {
      toast.error(e.message)
      setConfirmTopico(c => ({ ...c, carregando: false }))
    }
  }

  async function novoTopic() {
    try {
      const novo = await topicosService.criar({
        icone: 'star', label: 'Novo tópico', descricao: '', link: '/', ativo: true, ordem: topicos.length + 1
      })
      setTopicos(t => [...t, novo])
    } catch (e) {
      toast.error(e.message)
    }
  }

  function atualizar(id, campo, valor) {
    setTopicos(ts => ts.map(t => t.id === id ? { ...t, [campo]: valor } : t))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="adm-spin" style={{ color: 'var(--adm-muted)' }} /></div>

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <ConfirmModal
        aberto={confirmTopico.aberto}
        titulo="Excluir tópico?"
        mensagem="Este tópico será removido da faixa da home. Essa ação não pode ser desfeita."
        labelConfirmar="Excluir"
        carregando={confirmTopico.carregando}
        onConfirmar={confirmarExcluirTopico}
        onCancelar={() => setConfirmTopico({ aberto: false, id: null, carregando: false })}
      />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4 }}>Tópicos da Faixa</h3>
          <p style={{ fontSize: 13, color: 'var(--adm-muted)' }}>Gerencie os ícones exibidos abaixo do Hero</p>
        </div>
        <button onClick={novoTopic} className="adm-btn adm-btn-primary adm-btn-sm">
          <Plus size={14} style={{ marginRight: 6 }} /> Novo Tópico
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {topicos.map((t) => (
          <div key={t.id} style={{
            background: 'var(--adm-surface2)',
            border: '1px solid var(--adm-border)',
            borderRadius: 10,
            padding: 20,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div className="adm-field">
                <label className="adm-label">Ícone</label>
                <select className="adm-input" value={t.icone} onChange={e => atualizar(t.id, 'icone', e.target.value)}>
                  {ICON_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="adm-field">
                <label className="adm-label">Texto</label>
                <input className="adm-input" value={t.label} onChange={e => atualizar(t.id, 'label', e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Link</label>
                <input className="adm-input" value={t.link || ''} placeholder="/?categoria=..." onChange={e => atualizar(t.id, 'link', e.target.value)} />
              </div>
            </div>
            <div className="adm-field" style={{ marginBottom: 16 }}>
              <label className="adm-label">Descrição (opcional)</label>
              <input className="adm-input" value={t.descricao || ''} placeholder="Subtexto..." onChange={e => atualizar(t.id, 'descricao', e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={t.ativo} onChange={e => atualizar(t.id, 'ativo', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--adm-accent)' }} />
                <span style={{ fontSize: 13, color: 'var(--adm-text)' }}>Ativo</span>
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => salvarTopico(t)} disabled={salvando === t.id} className="adm-btn adm-btn-primary adm-btn-sm">
                  {salvando === t.id ? <Loader2 size={14} className="adm-spin" /> : <><Save size={14} style={{ marginRight: 6 }} /> Salvar</>}
                </button>
                <button onClick={() => excluirTopico(t.id)} className="adm-btn adm-btn-danger adm-btn-sm">
                  <Trash2 size={14} style={{ marginRight: 6 }} /> Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Seção: Notícias Externas ─────────────────────────────────
function SecaoNoticiasExternas() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(null)
  const [form, setForm] = useState({})
  const [confirmNoticia, setConfirmNoticia] = useState({ aberto: false, id: null, carregando: false })

  useEffect(() => {
    noticiasExternasService.listarTodas().then(setItems).finally(() => setLoading(false))
  }, [])

  const EMPTY = {
    titulo: '', imagem_url: '', fonte_nome: '', url_externa: '',
    categoria_label: '', categoria_cor: '#1B5E3B', ativo: true, ordem: 0
  }

  function abrirEditar(item) {
    setEditando(item?.id || 'novo')
    setForm(item ? { ...item } : { ...EMPTY, ordem: items.length + 1 })
  }

  async function salvar() {
    if (!form.titulo?.trim() || !form.fonte_nome?.trim() || !form.url_externa?.trim()) {
      toast.error('Título, fonte e URL são obrigatórios.')
      return
    }
    setSalvando(true)
    try {
      if (editando === 'novo') {
        const novo = await noticiasExternasService.criar(form)
        setItems(i => [...i, novo])
        toast.success('Notícia adicionada!')
      } else {
        const atualizado = await noticiasExternasService.editar(editando, form)
        setItems(i => i.map(x => x.id === editando ? atualizado : x))
        toast.success('Notícia atualizada!')
      }
      setEditando(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id) {
    setConfirmNoticia({ aberto: true, id, carregando: false })
  }

  async function confirmarExcluir() {
    const id = confirmNoticia.id
    setConfirmNoticia(c => ({ ...c, carregando: true }))
    try {
      await noticiasExternasService.excluir(id)
      setItems(i => i.filter(x => x.id !== id))
      toast.success('Excluída!')
      setConfirmNoticia({ aberto: false, id: null, carregando: false })
    } catch (e) {
      toast.error(e.message)
      setConfirmNoticia(c => ({ ...c, carregando: false }))
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={20} className="adm-spin" style={{ color: 'var(--adm-muted)' }} /></div>

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <ConfirmModal
        aberto={confirmNoticia.aberto}
        titulo="Excluir notícia externa?"
        mensagem="Essa notícia será removida da seção 'Brasil e Mundo'. Essa ação não pode ser desfeita."
        labelConfirmar="Excluir"
        carregando={confirmNoticia.carregando}
        onConfirmar={confirmarExcluir}
        onCancelar={() => setConfirmNoticia({ aberto: false, id: null, carregando: false })}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4 }}>Notícias do Brasil e do Mundo</h3>
          <p style={{ fontSize: 13, color: 'var(--adm-muted)' }}>Gerencie as notícias externas exibidas na home</p>
        </div>
        <button onClick={() => abrirEditar(null)} className="adm-btn adm-btn-primary adm-btn-sm">
          <Plus size={14} style={{ marginRight: 6 }} /> Nova Notícia
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            background: 'var(--adm-surface2)', border: '1px solid var(--adm-border)',
            borderRadius: 10, padding: 16,
          }}>
            {item.imagem_url && (
              <img src={item.imagem_url} alt={item.titulo} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, color: 'var(--adm-text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.titulo}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--adm-muted)' }}>{item.fonte_nome}</span>
                {item.categoria_label && (
                  <span style={{ fontSize: FONT.sm, fontWeight: 700, padding: `2px ${SPACE.md}px`, borderRadius: RADIUS.pill, background: item.categoria_cor || '#1B5E3B', color: '#fff' }}>
                    {item.categoria_label}
                  </span>
                )}
                {!item.ativo && <span style={{ fontSize: 11, color: 'var(--adm-red)' }}>Inativo</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <a href={item.url_externa} target="_blank" rel="noopener noreferrer" className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" title="Abrir link">
                <ExternalLink size={15} />
              </a>
              <button onClick={() => abrirEditar(item)} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" title="Editar">
                <Settings size={15} />
              </button>
              <button onClick={() => excluir(item.id)} className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm" title="Excluir">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Edição */}
      <DSModal open={!!editando} onClose={() => setEditando(null)}
        title={editando === 'novo' ? 'Nova notícia externa' : 'Editar notícia'}
        size="md"
        footer={<><DSBtn variant="primary" onClick={salvar}>Salvar</DSBtn><DSBtn onClick={() => setEditando(null)}>Cancelar</DSBtn></>}
      >
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
              <div className="adm-field">
                <label className="adm-label">Título *</label>
                <input className="adm-input" value={form.titulo || ''} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="adm-field">
                <label className="adm-label">URL da imagem</label>
                <input className="adm-input" placeholder="https://..." value={form.imagem_url || ''} onChange={e => setForm(f => ({ ...f, imagem_url: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="adm-field">
                  <label className="adm-label">Fonte (nome) *</label>
                  <input className="adm-input" placeholder="G1, UOL..." value={form.fonte_nome || ''} onChange={e => setForm(f => ({ ...f, fonte_nome: e.target.value }))} />
                </div>
                <div className="adm-field">
                  <label className="adm-label">Link externo *</label>
                  <input className="adm-input" placeholder="https://..." value={form.url_externa || ''} onChange={e => setForm(f => ({ ...f, url_externa: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="adm-field">
                  <label className="adm-label">Badge da categoria</label>
                  <input className="adm-input" placeholder="POLÍTICA" value={form.categoria_label || ''} onChange={e => setForm(f => ({ ...f, categoria_label: e.target.value }))} />
                </div>
                <div className="adm-field">
                  <label className="adm-label">Cor da badge</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="color" value={form.categoria_cor || '#1B5E3B'} onChange={e => setForm(f => ({ ...f, categoria_cor: e.target.value }))} style={{ width: 50, height: 38, borderRadius: 6, border: '1px solid var(--adm-border)', background: 'transparent', cursor: 'pointer' }} />
                    <input className="adm-input" value={form.categoria_cor || '#1B5E3B'} onChange={e => setForm(f => ({ ...f, categoria_cor: e.target.value }))} style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.ativo !== false} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--adm-accent)' }} />
                  <span style={{ fontSize: 13, color: 'var(--adm-text)' }}>Ativo</span>
                </label>
              </div>
            </div>
            <div style={{ padding: 20, borderTop: '1px solid var(--adm-border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditando(null)} className="adm-btn adm-btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="adm-btn adm-btn-primary">
                {salvando ? <Loader2 size={16} className="adm-spin" /> : <><Save size={16} style={{ marginRight: 6 }} /> Salvar</>}
              </button>
            </div>
      </DSModal>
    </div>
  )
}

// ─── Seção: Visibilidade dos módulos ─────────────────────────
function SecaoModulos({ modulos, onToggle }) {
  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4 }}>Visibilidade dos Módulos</h3>
        <p style={{ fontSize: 13, color: 'var(--adm-muted)' }}>Ative ou desative as seções exibidas na home</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modulos.map((m) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--adm-surface2)', border: '1px solid var(--adm-border)',
            borderRadius: 10, padding: '14px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: m.ativo ? 'var(--adm-accent)' : 'var(--adm-muted)',
                boxShadow: m.ativo ? '0 0 8px var(--adm-accent)' : 'none',
              }} />
              <div>
                <p style={{ fontWeight: 600, color: 'var(--adm-text)', marginBottom: 2 }}>{MODULO_LABELS[m.chave] || m.titulo}</p>
                <p style={{ fontSize: 11, color: 'var(--adm-muted)' }}>
                  {MODULO_DESC[m.chave] || `Ordem: ${m.ordem}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => onToggle(m)}
              className="adm-btn adm-btn-sm"
              style={{
                background: m.ativo ? 'rgba(var(--adm-accent-rgb,107,124,78),0.12)' : 'var(--adm-surface)',
                color: m.ativo ? 'var(--adm-accent)' : 'var(--adm-muted)',
                border: '1px solid var(--adm-border)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {m.ativo ? <><Eye size={13} /> Visível</> : <><EyeOff size={13} /> Oculto</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Admin Módulos — Página principal ─────────────────────────
export default function AdminModulos() {
  const [cfg, setCfg] = useState({})
  const [cfgEdit, setCfgEdit] = useState({})
  const [modulos, setModulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aba, setAba] = useState('hero')

  const isDirty = useMemo(
    () => JSON.stringify(cfg) !== JSON.stringify(cfgEdit),
    [cfg, cfgEdit]
  )
  const { showPrompt, confirm: confirmarSaida, cancel: cancelarSaida } = useUnsavedChanges(isDirty)

  useEffect(() => {
    Promise.all([
      configuracoesService.listar(),
      modulosService.listar(),
    ]).then(([c, m]) => {
      setCfg(c)
      setCfgEdit(c)
      setModulos(m)
    }).finally(() => setLoading(false))
  }, [])

  function onCfgChange(chave, valor) {
    setCfgEdit(e => ({ ...e, [chave]: valor }))
  }

  async function salvarConfiguracoes() {
    setSalvando(true)
    try {
      const pares = Object.entries(cfgEdit).map(([chave, valor]) => ({ chave, valor }))
      await configuracoesService.atualizarLote(pares)
      setCfg({ ...cfgEdit })
      toast.success('Configurações salvas!')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function toggleModulo(m) {
    const novoAtivo = !m.ativo
    try {
      await modulosService.atualizar(m.id, { ativo: novoAtivo })
      setModulos(ms => ms.map(x => x.id === m.id ? { ...x, ativo: novoAtivo } : x))
      toast.success(`Módulo "${MODULO_LABELS[m.chave] || m.titulo}" ${novoAtivo ? 'ativado' : 'ocultado'}!`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  const ABAS = [
    { key: 'hero', label: 'Hero', icon: <Image size={15} /> },
    { key: 'topicos', label: 'Tópicos', icon: <Layout size={15} /> },
    { key: 'noticias_externas', label: 'Externas', icon: <Globe size={15} /> },
    { key: 'footer', label: 'Rodapé', icon: <Heart size={15} /> },
    { key: 'modulos', label: 'Visibilidade', icon: <Settings size={15} /> },
  ]

  if (loading) return (
    <div className="adm-empty" style={{ marginTop: 80 }}>
      <div className="adm-spin" style={{ width: 24, height: 24, border: '2px solid var(--adm-border)', borderTopColor: 'var(--adm-accent)', borderRadius: '50%', margin: '0 auto' }} />
    </div>
  )

  return (
    <>
      {/* Modal: alterações não salvas */}
      {showPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) cancelarSaida() }}>
          <div style={{ background: 'var(--adm-surface)', border: '1px solid var(--adm-border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 8 }}>Sair sem salvar?</div>
            <div style={{ fontSize: 13, color: 'var(--adm-muted)', marginBottom: 20, lineHeight: 1.5 }}>As configurações da home foram alteradas mas ainda não foram salvas.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={cancelarSaida} className="adm-btn adm-btn-secondary">Continuar editando</button>
              <button onClick={confirmarSaida} className="adm-btn adm-btn-danger">Sair sem salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Módulos da Home</div>
          <div className="adm-page-sub">Configure textos, módulos e seções da home</div>
        </div>
        {(aba === 'hero' || aba === 'footer') && (
          <div className="adm-page-actions">
            <button onClick={salvarConfiguracoes} disabled={salvando} className="adm-btn adm-btn-primary">
              {salvando ? <><Loader2 size={14} className="adm-spin" style={{ marginRight: 6 }} /> Salvando...</> : <><Save size={14} style={{ marginRight: 6 }} /> Salvar</>}
            </button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="adm-tabs" style={{ marginBottom: 24 }}>
        {ABAS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setAba(key)} className={`adm-tab-btn${aba === key ? ' active' : ''}`}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon} {label}</span>
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'hero' && <SecaoHero cfg={cfgEdit} onChange={onCfgChange} />}
      {aba === 'topicos' && <SecaoTopicos />}
      {aba === 'noticias_externas' && <SecaoNoticiasExternas />}
      {aba === 'footer' && <SecaoFooter cfg={cfgEdit} onChange={onCfgChange} />}
      {aba === 'modulos' && <SecaoModulos modulos={modulos} onToggle={toggleModulo} />}
    </>
  )
}