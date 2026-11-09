import { useState } from 'react'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSBadge, DSBtn } from '../../components/admin/ui/DS'
import { Calendar, Plus, Trash2, Edit2, Save, X, Clock, MapPin, ChevronLeft, ChevronRight, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmModal from '../../components/ConfirmModal'
import { useEventos } from '../../hooks/useEventos'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const CORES = ['#1B5E3B','#1565C0','#C62828','#6A1B9A','#E65100','#F57F17','#00695C','#E91E63']

const TIPO_ENTRADA_LABELS = {
  gratuito: 'Gratuito',
  pago: 'Pago',
  doacoes: 'Aceita doações',
}
function tipoEntradaCor(tipo) {
  return tipo === 'pago' ? C.red : tipo === 'doacoes' ? C.orange : C.greenDk
}

function formatarDataBR(dataStr) {
  if (!dataStr) return ''
  const d = new Date(dataStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toInputDate(dataStr) {
  if (!dataStr) return ''
  const d = new Date(dataStr)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ─── Mini Calendário visual ─────────────────────────────────────
function MiniCalendario({ selectedDate, onChange, eventosDatas = [] }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())

  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes   = new Date(ano, mes + 1, 0).getDate()

  function prevMes() {
    if (mes === 0) { setMes(11); setAno(a => a - 1) }
    else setMes(m => m - 1)
  }
  function nextMes() {
    if (mes === 11) { setMes(0); setAno(a => a + 1) }
    else setMes(m => m + 1)
  }

  const cells = []
  for (let i = 0; i < primeiroDia; i++) cells.push(null)
  for (let d = 1; d <= diasNoMes; d++) cells.push(d)

  function handleClick(dia) {
    if (!dia) return
    const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    onChange(iso)
  }

  function isSelected(dia) {
    if (!dia || !selectedDate) return false
    const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    return selectedDate === iso
  }

  function hasEvento(dia) {
    if (!dia) return false
    const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    return eventosDatas.some(d => d.startsWith(iso))
  }

  function isHoje(dia) {
    return dia && ano === hoje.getFullYear() && mes === hoje.getMonth() && dia === hoje.getDate()
  }

  return (
    <div style={{
      background: 'var(--adm-surface)',
      border: '1px solid var(--adm-border)',
      borderRadius:RADIUS.xl,
      overflow: 'hidden',
      width: '100%',
    }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'var(--adm-accent)',
        color: C.text,
      }}>
        <button onClick={prevMes} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: 4, borderRadius:RADIUS.xs }}>
          <ChevronLeft size={18} />
        </button>
        <p style={{ fontWeight: 700, fontSize:FONT.lg-1, margin: 0 }}>{MESES[mes]} {ano}</p>
        <button onClick={nextMes} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: 4, borderRadius:RADIUS.xs }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Dias da semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--adm-border)' }}>
        {DIAS_SEMANA.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize:FONT.sm, fontWeight: 600, color: 'var(--adm-muted)', padding: '8px 0' }}>{d}</div>
        ))}
      </div>

      {/* Células */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, padding: 8 }}>
        {cells.map((dia, i) => (
          <button key={i} type="button"
            onClick={() => handleClick(dia)}
            disabled={!dia}
            style={{
              aspectRatio: '1 / 1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize:FONT.base, fontWeight: 600,
              borderRadius:RADIUS.md,
              border: 'none',
              background: isSelected(dia) ? 'var(--adm-accent)' : 'transparent',
              color: isSelected(dia) ? '#000' : isHoje(dia) ? 'var(--adm-accent)' : 'var(--adm-text)',
              cursor: dia ? 'pointer' : 'default',
              opacity: dia ? 1 : 0,
              transition: 'all 0.1s',
              position: 'relative',
              boxShadow: isHoje(dia) && !isSelected(dia) ? 'inset 0 0 0 2px var(--adm-accent)' : 'none',
            }}
          >
            {dia}
            {hasEvento(dia) && !isSelected(dia) && (
              <span style={{
                position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                width: 4, height: 4, borderRadius: '50%', background: 'var(--adm-accent)',
              }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Formulário de evento ───────────────────────────────────────
function EventoForm({ evento, eventosDatas, onSave, onCancel }) {
  const [form, setForm] = useState(evento ? {
    ...evento,
    data: toInputDate(evento.data),
    tipoEntrada: evento.tipoEntrada || 'gratuito',
  } : {
    titulo: '', descricao: '', data: '', horario: '', local: '',
    cor: '#1B5E3B', ativo: true, tipoEntrada: 'gratuito',
  })

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('Informe o título'); return }
    if (!form.data) { toast.error('Selecione uma data'); return }
    await onSave({ ...form, data: new Date(form.data + 'T12:00:00') })
  }

  return (
    <div className="adm-card" style={{ padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 20 }}>
        {evento ? 'Editar evento' : 'Novo evento'}
      </h3>

      {/* Layout responsivo: empilha em mobile, lado a lado em desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 24,
      }}
        className="adm-evento-form-grid"
      >
        {/* Calendário */}
        <div>
          <label className="adm-label" style={{ marginBottom: 8, display: 'block' }}>Selecione a data</label>
          <MiniCalendario
            selectedDate={form.data}
            onChange={d => setForm(f => ({ ...f, data: d }))}
            eventosDatas={eventosDatas}
          />
          {form.data && (
            <p style={{ marginTop: 12, fontSize:FONT.md, color: 'var(--adm-accent)', fontWeight: 600, textAlign: 'center' }}>
              📅 {formatarDataBR(form.data + 'T12:00:00')}
            </p>
          )}
        </div>

        {/* Campos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap:SPACE.xl }}>
          <div className="adm-field">
            <label className="adm-label">Título *</label>
            <input type="text" className="adm-input" value={form.titulo} placeholder="Nome do evento"
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
          </div>

          <div className="adm-field">
            <label className="adm-label">Descrição</label>
            <textarea className="adm-input" value={form.descricao} placeholder="Detalhes do evento..."
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap:SPACE.xl }}>
            <div className="adm-field">
              <label className="adm-label" style={{ display: 'flex', alignItems: 'center', gap:SPACE.xs }}><Clock size={12} /> Horário</label>
              <input type="time" className="adm-input" value={form.horario}
                onChange={e => setForm(f => ({ ...f, horario: e.target.value }))} />
            </div>
            <div className="adm-field">
              <label className="adm-label" style={{ display: 'flex', alignItems: 'center', gap:SPACE.xs }}><MapPin size={12} /> Local</label>
              <input type="text" className="adm-input" value={form.local} placeholder="Local do evento"
                onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
            </div>
          </div>

          {/* Tipo de entrada */}
          <div className="adm-field">
            <label className="adm-label" style={{ display: 'flex', alignItems: 'center', gap:SPACE.xs }}>
              <Tag size={12} /> Tipo de entrada
            </label>
            <div style={{ display: 'flex', gap:SPACE.md, flexWrap: 'wrap', marginTop: 6 }}>
              {Object.entries(TIPO_ENTRADA_LABELS).map(([key, label]) => {
                const ativo = (form.tipoEntrada || 'gratuito') === key
                const cor = tipoEntradaCor(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipoEntrada: key }))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize:FONT.base,
                      fontWeight: 700,
                      border: `2px solid ${ativo ? cor : 'var(--adm-border)'}`,
                      background: ativo ? cor + '18' : 'transparent',
                      color: ativo ? cor : 'var(--adm-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label">Cor do evento</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap:SPACE.md, marginTop: 6 }}>
              {CORES.map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, cor: c }))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
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

          {/* Preview */}
          {form.titulo && (
            <div style={{
              marginTop: 8, padding: 12,
              background: 'var(--adm-surface2)',
              border: '1px solid var(--adm-border)',
              borderRadius:RADIUS.lg,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 40, borderRadius:RADIUS.xs, background: form.cor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: 'var(--adm-text)', marginBottom: 2 }}>{form.titulo}</p>
                  <div style={{ display: 'flex', gap:SPACE.md, flexWrap: 'wrap', alignItems: 'center' }}>
                    {form.horario && <p style={{ fontSize:FONT.base, color: 'var(--adm-muted)' }}>{form.horario}</p>}
                    {form.tipoEntrada && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 20,
                        background: tipoEntradaCor(form.tipoEntrada) + '20',
                        color: tipoEntradaCor(form.tipoEntrada),
                      }}>
                        {TIPO_ENTRADA_LABELS[form.tipoEntrada]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (min-width: 640px) {
          .adm-evento-form-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', gap:SPACE.lg, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--adm-border)', flexWrap: 'wrap' }}>
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

// ─── Item de evento na lista ────────────────────────────────────
function EventoItem({ ev, onEdit, onDelete }) {
  const d = new Date(ev.data)
  const dia = d.getDate()
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  const cor = ev.cor || '#1B5E3B'
  const tipoEntrada = ev.tipoEntrada || 'gratuito'

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--adm-surface2)',
      border: '1px solid var(--adm-border)',
      borderRadius:RADIUS.xl,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: 64, padding: '14px 0', flexShrink: 0,
        background: cor + '15',
        borderRight: `3px solid ${cor}`,
      }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--adm-text)', lineHeight: 1 }}>{dia}</p>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--adm-muted)', textTransform: 'uppercase' }}>{mes}</p>
      </div>

      <div style={{ flex: 1, padding: '10px 14px', minWidth: 0 }}>
        <p style={{
          fontWeight: 700, color: 'var(--adm-text)', marginBottom: 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize:FONT.lg-1,
        }}>
          {ev.titulo}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {ev.horario && (
            <span style={{ display: 'flex', alignItems: 'center', gap:SPACE.xs, fontSize:FONT.sm, color: 'var(--adm-muted)' }}>
              <Clock size={10} /> {ev.horario}
            </span>
          )}
          {ev.local && (
            <span style={{ display: 'flex', alignItems: 'center', gap:SPACE.xs, fontSize:FONT.sm, color: 'var(--adm-muted)' }}>
              <MapPin size={10} /> {ev.local}
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 20,
            background: tipoEntradaCor(tipoEntrada) + '20',
            color: tipoEntradaCor(tipoEntrada),
          }}>
            {TIPO_ENTRADA_LABELS[tipoEntrada]}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap:SPACE.xs, padding: '0 10px', alignItems: 'center', flexShrink: 0 }}>
        <button onClick={onEdit} className="adm-btn adm-btn-ghost adm-btn-icon adm-btn-sm" aria-label="Editar">
          <Edit2 size={15} />
        </button>
        <button onClick={onDelete} className="adm-btn adm-btn-danger adm-btn-icon adm-btn-sm" aria-label="Excluir">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────
export default function AdminEventos() {
  const { loading, eventosDatas, futuros, passados, salvarEvento, excluirEvento } = useEventos()

  const [editando,   setEditando]   = useState(null)   // null | 'novo' | id
  const [editEvento, setEditEvento] = useState(null)
  const [confirm,    setConfirm]    = useState({ aberto: false, id: null, carregando: false })

  async function salvar(form) {
    try {
      await salvarEvento(editando, form)
      setEditando(null)
      setEditEvento(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function confirmarExclusao() {
    setConfirm(c => ({ ...c, carregando: true }))
    try {
      await excluirEvento(confirm.id)
      setConfirm({ aberto: false, id: null, carregando: false })
    } catch {
      toast.error('Erro ao excluir')
      setConfirm(c => ({ ...c, carregando: false }))
    }
  }

  // Quando editando !== null, exibir APENAS o formulário (sem a lista)
  // para evitar o bug de duas telas simultâneas
  const modoEdicao = editando !== null

  return (
    <>
      <ConfirmModal
        aberto={confirm.aberto}
        titulo="Excluir evento?"
        mensagem="Essa ação é permanente e não pode ser desfeita."
        labelConfirmar="Excluir"
        carregando={confirm.carregando}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setConfirm({ aberto: false, id: null, carregando: false })}
      />

      {/* Header */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Agenda de Eventos</div>
          <div className="adm-page-sub">Gerencie os eventos exibidos na agenda</div>
        </div>
        {!modoEdicao && (
          <div className="adm-page-actions">
            <button onClick={() => { setEditando('novo'); setEditEvento(null) }} className="adm-btn adm-btn-primary">
              <Plus size={16} style={{ marginRight: 6 }} /> Novo Evento
            </button>
          </div>
        )}
      </div>

      {/* ── MODO EDIÇÃO: mostra só o formulário ── */}
      {modoEdicao && (
        <EventoForm
          evento={editEvento}
          eventosDatas={eventosDatas}
          onSave={salvar}
          onCancel={() => { setEditando(null); setEditEvento(null) }}
        />
      )}

      {/* ── MODO LISTAGEM: mostra só a lista ── */}
      {!modoEdicao && (
        <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="adm-empty">
              <div className="adm-spin" style={{
                width: 24, height: 24,
                border: '2px solid var(--adm-border)',
                borderTopColor: 'var(--adm-accent)',
                borderRadius: '50%', margin: '0 auto',
              }} />
              <p style={{ marginTop: 16, color: 'var(--adm-muted)' }}>Carregando eventos...</p>
            </div>
          ) : (
            <div style={{ padding: 20 }}>
              {/* Próximos eventos */}
              {futuros.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{
                    fontSize:FONT.base, fontWeight: 700, color: 'var(--adm-muted)',
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14,
                  }}>
                    Próximos eventos ({futuros.length})
                  </h3>
                  {futuros.map(ev => (
                    <EventoItem
                      key={ev.id}
                      ev={ev}
                      onEdit={() => { setEditEvento(ev); setEditando(ev.id) }}
                      onDelete={() => setConfirm({ aberto: true, id: ev.id, carregando: false })}
                    />
                  ))}
                </div>
              )}

              {/* Eventos passados */}
              {passados.length > 0 && (
                <div>
                  <h3 style={{
                    fontSize:FONT.base, fontWeight: 700, color: 'var(--adm-muted)',
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14,
                  }}>
                    Eventos passados ({passados.length})
                  </h3>
                  <div style={{ opacity: 0.6 }}>
                    {passados.map(ev => (
                      <EventoItem
                        key={ev.id}
                        ev={ev}
                        onEdit={() => { setEditEvento(ev); setEditando(ev.id) }}
                        onDelete={() => setConfirm({ aberto: true, id: ev.id, carregando: false })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {futuros.length === 0 && passados.length === 0 && (
                <div className="adm-empty">
                  <Calendar size={32} style={{ opacity: 0.2, marginBottom: 16 }} />
                  <p style={{ color: 'var(--adm-muted)' }}>Nenhum evento cadastrado ainda.</p>
                  <button
                    onClick={() => { setEditando('novo'); setEditEvento(null) }}
                    className="adm-btn adm-btn-primary adm-btn-sm"
                    style={{ marginTop: 16 }}
                  >
                    <Plus size={14} style={{ marginRight: 6 }} /> Criar primeiro evento
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
