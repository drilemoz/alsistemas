import { useState, useEffect } from 'react'
import { Bus, Plus, Trash2, Edit2, Save, X, PlusCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { onibusService } from '../../services/api'
import ConfirmModal from '../../components/ConfirmModal'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

const TODOS_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
const DIAS_LABEL = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' }

const CORES = ['#1B5E3B','#1565C0','#C62828','#6A1B9A','#E65100','#F57F17','#00695C','#2E7D32']

// ─── Componente interno: HorarioForm ──────────────────────────
function HorarioForm({ horario, onChange, onRemove }) {
  return (
    <div style={{
      background: 'var(--adm-surface2)',
      border: '1px solid var(--adm-border)',
      borderRadius: RADIUS.lg,
      padding: '14px',
      marginBottom: SPACE.lg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg, marginBottom: SPACE.lg }}>
        <div style={{ flex: 1 }}>
          <label className="adm-label" style={{ marginBottom: 4 }}>Horário</label>
          <input
            type="time"
            value={horario.hora}
            onChange={e => onChange({ ...horario, hora: e.target.value })}
            className="adm-input"
            style={{ width: 130 }}
          />
        </div>
        <button
          onClick={onRemove}
          className="adm-btn adm-btn-icon adm-btn-sm"
          style={{ color: 'var(--adm-red)', marginTop: 20 }}
          aria-label="Remover horário"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div style={{ marginBottom: SPACE.lg }}>
        <label className="adm-label" style={{ marginBottom: 6 }}>Dias da semana</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
          {TODOS_DIAS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => {
                const dias = horario.dias?.includes(d)
                  ? horario.dias.filter(x => x !== d)
                  : [...(horario.dias || []), d]
                onChange({ ...horario, dias })
              }}
              style={{
                padding: '4px 10px',
                borderRadius: RADIUS.sm,
                fontSize: FONT.sm,
                fontWeight: 700,
                border: '1px solid',
                borderColor: horario.dias?.includes(d) ? 'var(--adm-accent)' : 'var(--adm-border)',
                background: horario.dias?.includes(d) ? 'var(--adm-accent)' : 'transparent',
                color: horario.dias?.includes(d) ? '#000' : 'var(--adm-muted)',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            >
              {DIAS_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="adm-label" style={{ marginBottom: 4 }}>Observação (opcional)</label>
        <input
          type="text"
          value={horario.observacao || ''}
          placeholder="Ex: Via Divinópolis"
          onChange={e => onChange({ ...horario, observacao: e.target.value })}
          className="adm-input"
        />
      </div>
    </div>
  )
}

// ─── Componente interno: LinhaForm ────────────────────────────
function LinhaForm({ linha, onSave, onCancel }) {
  const [form, setForm] = useState(linha || {
    destino: '', origem: 'Iguatama', empresa: '', cor: '#1B5E3B', ativo: true, horarios: []
  })

  function addHorario() {
    setForm(f => ({
      ...f,
      horarios: [...(f.horarios || []), { hora: '07:00', dias: ['seg','ter','qua','qui','sex'], observacao: '' }]
    }))
  }

  function updateHorario(i, h) {
    setForm(f => {
      const arr = [...(f.horarios || [])]
      arr[i] = h
      return { ...f, horarios: arr }
    })
  }

  function removeHorario(i) {
    setForm(f => ({ ...f, horarios: (f.horarios || []).filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    if (!form.destino.trim()) { toast.error('Informe o destino'); return }
    await onSave(form)
  }

  return (
    <div className="adm-card" style={{ padding: SPACE.xl3, marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: SPACE.xl2 }}>
        {linha ? 'Editar linha' : 'Nova linha'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: SPACE.xl, marginBottom: 24 }}>
        <div>
          <label className="adm-label">Destino *</label>
          <input
            type="text"
            value={form.destino}
            placeholder="Ex: Divinópolis"
            onChange={e => setForm(f => ({ ...f, destino: e.target.value }))}
            className="adm-input"
          />
        </div>
        <div>
          <label className="adm-label">Origem</label>
          <input
            type="text"
            value={form.origem}
            onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
            className="adm-input"
          />
        </div>
        <div>
          <label className="adm-label">Empresa / Viação</label>
          <input
            type="text"
            value={form.empresa}
            placeholder="Ex: Viação Cidade Verde"
            onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
            className="adm-input"
          />
        </div>
        <div>
          <label className="adm-label">Cor da linha</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md, marginTop: 6 }}>
            {CORES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setForm(f => ({ ...f, cor: c }))}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: c,
                  border: form.cor === c ? '2px solid white' : '2px solid transparent',
                  boxShadow: form.cor === c ? '0 0 0 2px var(--adm-accent)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Seção de horários */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.lg }}>
          <label className="adm-label" style={{ marginBottom: 0 }}>Horários de saída</label>
          <button
            onClick={addHorario}
            className="adm-btn adm-btn-secondary adm-btn-sm"
            style={{ gap: SPACE.sm }}
          >
            <PlusCircle size={14} /> Adicionar horário
          </button>
        </div>
        {(form.horarios || []).length === 0 && (
          <p style={{
            fontSize: FONT.md,
            color: 'var(--adm-muted)',
            textAlign: 'center',
            padding: '20px',
            border: '1px dashed var(--adm-border)',
            borderRadius: RADIUS.lg,
          }}>
            Nenhum horário adicionado
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {(form.horarios || []).map((h, i) => (
            <HorarioForm
              key={i}
              horario={h}
              onChange={updated => updateHorario(i, updated)}
              onRemove={() => removeHorario(i)}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: SPACE.lg, borderTop: '1px solid var(--adm-border)', paddingTop: 20 }}>
        <button onClick={handleSave} className="adm-btn adm-btn-primary">
          <Save size={15} style={{ marginRight: 6 }} /> Salvar
        </button>
        <button onClick={onCancel} className="adm-btn adm-btn-secondary">
          <X size={15} style={{ marginRight: 6 }} /> Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────
export default function AdminOnibus() {
  const [linhas, setLinhas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // null, 'novo' ou id
  const [editLinha, setEditLinha] = useState(null)
  const [confirm, setConfirm] = useState({ aberto: false, id: null, carregando: false })

  async function carregar() {
    try {
      setLoading(true)
      const data = await onibusService.listarTodos()
      setLinhas(data)
    } catch {
      toast.error('Erro ao carregar linhas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  async function salvar(form) {
    try {
      if (editando === 'novo') {
        await onibusService.criar(form)
        toast.success('Linha criada!')
      } else {
        await onibusService.editar(editando, form)
        toast.success('Linha atualizada!')
      }
      setEditando(null)
      setEditLinha(null)
      carregar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function confirmarExclusao() {
    setConfirm(c => ({ ...c, carregando: true }))
    try {
      await onibusService.excluir(confirm.id)
      toast.success('Linha excluída')
      setConfirm({ aberto: false, id: null, carregando: false })
      carregar()
    } catch {
      toast.error('Erro ao excluir')
      setConfirm(c => ({ ...c, carregando: false }))
    }
  }

  return (
    <>
      <ConfirmModal
        aberto={confirm.aberto}
        titulo="Excluir linha?"
        mensagem="Todos os horários desta linha serão removidos permanentemente."
        labelConfirmar="Excluir"
        carregando={confirm.carregando}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setConfirm({ aberto: false, id: null, carregando: false })}
      />

      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Horário de Ônibus</div>
          <div className="adm-page-sub">Gerencie as linhas e horários exibidos na home.</div>
        </div>
        {editando === null && (
          <div className="adm-page-actions">
            <button
              onClick={() => { setEditando('novo'); setEditLinha(null) }}
              className="adm-btn adm-btn-primary"
            >
              <Plus size={16} style={{ marginRight: 6 }} /> Nova Linha
            </button>
          </div>
        )}
      </div>

      {/* Formulário de edição/criação */}
      {editando !== null && (
        <LinhaForm
          linha={editLinha}
          onSave={salvar}
          onCancel={() => { setEditando(null); setEditLinha(null) }}
        />
      )}

      {/* Lista de linhas */}
      <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="adm-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="adm-spin" width="24" height="24">
              <path d="M21 12a9 9 0 11-18 0" strokeOpacity=".3"/><path d="M21 12a9 9 0 00-9-9"/>
            </svg>
            <p style={{ marginTop: 12 }}>Carregando...</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="adm-empty">
            <Bus size={32} style={{ opacity: 0.2, marginBottom: SPACE.md }} />
            <p>Nenhuma linha cadastrada ainda.</p>
          </div>
        ) : (
          <div style={{ padding: '16px 20px' }}>
            {linhas.map(l => (
              <div
                key={l.id}
                style={{
                  background: 'var(--adm-surface2)',
                  border: '1px solid var(--adm-border)',
                  borderRadius: RADIUS.lg,
                  padding: '16px',
                  marginBottom: SPACE.lg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: RADIUS.lg,
                    backgroundColor: (l.cor || '#1B5E3B') + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Bus size={20} style={{ color: l.cor || '#1B5E3B' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: 'var(--adm-text)', marginBottom: 2 }}>
                      Iguatama → {l.destino}
                    </p>
                    <p style={{ fontSize: FONT.base, color: 'var(--adm-muted)' }}>
                      {l.empresa || 'Empresa não informada'} · {l.horarios?.length || 0} horários
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: SPACE.xs }}>
                    <button
                      onClick={() => { setEditLinha(l); setEditando(l.id) }}
                      className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm"
                      aria-label="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => setConfirm({ aberto: true, id: l.id, carregando: false })}
                      className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm"
                      style={{ color: 'var(--adm-red)' }}
                      aria-label="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {l.horarios?.length > 0 && (
                  <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
                    {l.horarios.map((h, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: SPACE.xs,
                          fontSize: FONT.sm,
                          fontWeight: 700,
                          background: 'var(--adm-surface)',
                          border: '1px solid var(--adm-border)',
                          color: 'var(--adm-text)',
                          padding: '3px 10px',
                          borderRadius: RADIUS.pill,
                        }}
                      >
                        <Clock size={10} /> {h.hora}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}