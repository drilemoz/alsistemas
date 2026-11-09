/**
 * AdminUsuarios.jsx — Usuários & Perfis de Acesso (v2)
 *
 * Melhorias:
 *   - Estatísticas no topo (total, ativos, inativos, bloqueados)
 *   - Filtro por status (todos / ativos / inativos / bloqueados)
 *   - Filtro por perfil
 *   - Toggle ativo/inativo inline (sem abrir modal)
 *   - Redefinição de senha inline com gerador de senha segura
 *   - Modal de exclusão temático (sem confirm() nativo)
 *   - Coluna de última atividade com tempo relativo
 *   - Aba Perfis com visualização expandida de permissões
 *   - Ordenação por nome / email / último login / status
 */
import { useState, useMemo, useCallback } from 'react'
import { usuariosService } from '../../services/api'
import toast from 'react-hot-toast'
import { GRUPOS_PERMISSOES } from '../../utils/permissions'
import ForcaSenha from '../../components/admin/ui/ForcaSenha'
import AdminIcon from '../../components/admin/ui/AdminIcon'
import { useUsuarios } from '../../hooks/useUsuarios'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'
import { DSModal, DSBtn, DSBadge } from '../../components/admin/ui/DS'

// ── Helpers ───────────────────────────────────────────────────────
function relTime(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)    return 'agora'
  if (m < 60)   return `${m}min atrás`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h atrás`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d atrás`
  return new Date(d).toLocaleDateString('pt-BR')
}

function gerarSenhaForte() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const syms   = '!@#$%&*'
  const all    = upper + lower + digits + syms
  let senha    = upper[Math.floor(Math.random()*upper.length)]
             + lower[Math.floor(Math.random()*lower.length)]
             + digits[Math.floor(Math.random()*digits.length)]
             + syms[Math.floor(Math.random()*syms.length)]
  for (let i = 4; i < 14; i++) senha += all[Math.floor(Math.random()*all.length)]
  return senha.split('').sort(() => Math.random() - .5).join('')
}

function AvatarCircle({ nome, email, cor, size = 38 }) {
  const letra = (nome || email || '?')[0].toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: cor ? `${cor}22` : 'var(--adm-accent)',
      border: `2px solid ${cor || 'var(--adm-accent)'}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * .38,
      color: cor || '#fff',
    }}>
      {letra}
    </div>
  )
}

function StatCard({ label, value, cor }) {
  return (
    <div style={{
      flex: 1, minWidth: 80,
      background: C.surface2, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.lg, padding: `${SPACE.md}px ${SPACE.lg}px`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || C.text }}>{value}</div>
      <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Modal de Usuário ──────────────────────────────────────────────
function ModalUsuario({ usuario, perfis, onSalvar, onFechar }) {
  const editando = !!(usuario?.id || usuario?._id)
  const perfilIdInicial = usuario?.perfil_id?._id?.toString()
    || usuario?.perfil_id?.id
    || (typeof usuario?.perfil_id === 'string' ? usuario.perfil_id : '')

  const [form, setForm] = useState({
    nome:         usuario?.nome         || '',
    email:        usuario?.email        || '',
    senha:        '',
    confirmSenha: '',
    perfil_id:    perfilIdInicial,
    ativo:        usuario?.ativo ?? true,
  })
  const [loading,        setLoading]        = useState(false)
  const [mostrarSenha,   setMostrarSenha]   = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)

  const senhasIguais    = form.senha && form.senha === form.confirmSenha
  const senhasDiferentes = form.confirmSenha && form.senha !== form.confirmSenha

  function preencherSenhaGerada() {
    const nova = gerarSenhaForte()
    setForm(f => ({ ...f, senha: nova, confirmSenha: nova }))
    setMostrarSenha(true)
    navigator.clipboard?.writeText(nova).catch(() => null)
    toast.success('Senha gerada e copiada para a área de transferência!')
  }

  async function handleSalvar(e) {
    e?.preventDefault()
    if (!form.nome.trim() || !form.email.trim()) { toast.error('Nome e email são obrigatórios'); return }
    if (!editando && !form.senha) { toast.error('Senha é obrigatória'); return }
    if (form.senha && form.senha !== form.confirmSenha) { toast.error('As senhas não coincidem'); return }
    setLoading(true)
    try {
      const dados = { nome: form.nome, email: form.email, perfil_id: form.perfil_id || null, ativo: form.ativo }
      if (form.senha) dados.senha = form.senha
      if (editando) {
        const r = await usuariosService.editar(usuario.id || usuario._id, dados)
        toast.success('Usuário atualizado!'); onSalvar(r.usuario)
      } else {
        const r = await usuariosService.criar(dados)
        toast.success('Usuário criado!'); onSalvar(r.usuario)
      }
      onFechar()
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const perfilSelecionado = perfis.find(p => (p.id || p._id) === form.perfil_id)

  return (
    <DSModal open onClose={onFechar} title={editando ? 'Editar Usuário' : 'Novo Usuário'} size="sm"
      footer={
        <>
          <DSBtn variant="primary" loading={loading} onClick={handleSalvar}>
            {editando ? 'Salvar alterações' : 'Criar usuário'}
          </DSBtn>
          <DSBtn onClick={onFechar} disabled={loading}>Cancelar</DSBtn>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>

        {/* Nome + Email */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nome completo *</label>
            <input className="adm-input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="João da Silva" />
          </div>
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Email *</label>
            <input className="adm-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
          </div>
        </div>

        {/* Senha */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xs }}>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {editando ? 'Nova senha' : 'Senha *'}
              {editando && <span style={{ fontWeight: 400, marginLeft: 6 }}>(deixe vazio para manter)</span>}
            </label>
            <button type="button" onClick={preencherSenhaGerada}
              style={{ fontSize: FONT.xs, fontWeight: 700, color: C.blue, background: `${C.blue}12`,
                border: `1px solid ${C.blue}30`, borderRadius: RADIUS.sm, padding: '2px 8px', cursor: 'pointer' }}>
              ⚡ Gerar senha
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input className="adm-input" type={mostrarSenha ? 'text' : 'password'} value={form.senha}
              onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              placeholder="Mínimo 8 chars, letra, número e símbolo"
              style={{ paddingRight: 38 }} />
            <button type="button" onClick={() => setMostrarSenha(v => !v)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'flex' }}>
              <AdminIcon name={mostrarSenha ? 'eye' : 'eyeOff'} size={15} />
            </button>
          </div>
          {form.senha && <ForcaSenha senha={form.senha} />}
        </div>

        {/* Confirmar senha */}
        {form.senha && (
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Confirmar senha
            </label>
            <div style={{ position: 'relative' }}>
              <input className="adm-input" type={mostrarConfirm ? 'text' : 'password'} value={form.confirmSenha}
                onChange={e => setForm(f => ({ ...f, confirmSenha: e.target.value }))}
                placeholder="Repita a senha"
                style={{ paddingRight: 38, borderColor: senhasIguais ? 'var(--adm-accent)' : senhasDiferentes ? C.red : undefined }} />
              <button type="button" onClick={() => setMostrarConfirm(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'flex' }}>
                <AdminIcon name={mostrarConfirm ? 'eye' : 'eyeOff'} size={15} />
              </button>
            </div>
            {form.confirmSenha && (
              <div style={{ fontSize: FONT.sm, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
                color: senhasIguais ? 'var(--adm-accent)' : C.red, fontWeight: 600 }}>
                {senhasIguais ? '✓ Senhas conferem' : '✗ Senhas não conferem'}
              </div>
            )}
          </div>
        )}

        {/* Perfil + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: SPACE.md, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Perfil de acesso</label>
            <select className="adm-input" value={form.perfil_id} onChange={e => setForm(f => ({ ...f, perfil_id: e.target.value }))}>
              <option value="">Sem perfil</option>
              {perfis.map(p => <option key={p.id || p._id} value={p.id || p._id}>{p.nome}</option>)}
            </select>
            {perfilSelecionado && (
              <div style={{ marginTop: 4, fontSize: FONT.xs, color: C.muted }}>
                {perfilSelecionado.permissoes?.includes('*')
                  ? '⚡ Acesso total'
                  : `${perfilSelecionado.permissoes?.length || 0} permissão(ões)`}
              </div>
            )}
          </div>
          <div style={{ paddingBottom: perfilSelecionado ? 22 : 0 }}>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Status</label>
            <button type="button" onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: RADIUS.md, cursor: 'pointer', fontWeight: 700, fontSize: FONT.sm,
                background: form.ativo ? '#22c55e18' : `${C.red}18`,
                border: `1px solid ${form.ativo ? '#22c55e40' : `${C.red}40`}`,
                color: form.ativo ? '#16a34a' : C.red,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%',
                background: form.ativo ? '#22c55e' : C.red, flexShrink: 0 }} />
              {form.ativo ? 'Ativo' : 'Inativo'}
            </button>
          </div>
        </div>
      </div>
    </DSModal>
  )
}

// ── Modal de Redefinição de Senha ──────────────────────────────────
function ModalResetSenha({ usuario, onFechar, onOk }) {
  const [senha,        setSenha]        = useState('')
  const [mostrar,      setMostrar]      = useState(false)
  const [loading,      setLoading]      = useState(false)

  function preencher() {
    const nova = gerarSenhaForte()
    setSenha(nova)
    setMostrar(true)
    navigator.clipboard?.writeText(nova).catch(() => null)
    toast.success('Senha gerada e copiada!')
  }

  async function salvar() {
    if (senha.length < 8) { toast.error('Senha muito curta'); return }
    setLoading(true)
    try {
      await usuariosService.editar(usuario.id || usuario._id, { senha })
      toast.success(`Senha de "${usuario.nome}" redefinida!`)
      onOk()
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <DSModal open onClose={onFechar} title={`Redefinir senha — ${usuario.nome}`} size="sm"
      footer={
        <>
          <DSBtn variant="primary" loading={loading} disabled={senha.length < 8} onClick={salvar}>
            Salvar nova senha
          </DSBtn>
          <DSBtn onClick={onFechar} disabled={loading}>Cancelar</DSBtn>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: -SPACE.sm,
        }}>
          <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted,
            textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Nova senha
          </label>
          <button type="button" onClick={preencher}
            style={{ fontSize: FONT.xs, fontWeight: 700, color: C.blue, background: `${C.blue}12`,
              border: `1px solid ${C.blue}30`, borderRadius: RADIUS.sm, padding: '2px 8px', cursor: 'pointer' }}>
            ⚡ Gerar senha forte
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <input className="adm-input" type={mostrar ? 'text' : 'password'} value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            style={{ paddingRight: 38, fontFamily: 'monospace', letterSpacing: mostrar ? '.1em' : undefined }} />
          <button type="button" onClick={() => setMostrar(v => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex' }}>
            <AdminIcon name={mostrar ? 'eye' : 'eyeOff'} size={15} />
          </button>
        </div>
        {senha && <ForcaSenha senha={senha} />}
        <div style={{ fontSize: FONT.xs, color: C.muted, background: C.surface2,
          borderRadius: RADIUS.md, padding: '8px 12px', lineHeight: '15px' }}>
          💡 A senha será alterada imediatamente. Notifique o usuário após salvar.
        </div>
      </div>
    </DSModal>
  )
}

// ── Modal de Perfil ───────────────────────────────────────────────
function ModalPerfil({ perfil, onSalvar, onFechar }) {
  const editando  = !!perfil?.id
  const isSistema = perfil?.sistema
  const [form, setForm] = useState({
    nome:       perfil?.nome       || '',
    descricao:  perfil?.descricao  || '',
    permissoes: perfil?.permissoes || [],
    cor:        perfil?.cor        || '#6366f1',
  })
  const [loading, setLoading] = useState(false)
  const eSuperadmin = form.permissoes.includes('*')
  const totalPerms  = GRUPOS_PERMISSOES.reduce((acc, g) => acc + g.perms.length, 0)

  function togglePerm(id) {
    setForm(f => ({ ...f, permissoes: f.permissoes.includes(id) ? f.permissoes.filter(p => p !== id) : [...f.permissoes, id] }))
  }
  function toggleGrupo(perms) {
    const ids   = perms.map(p => p.id)
    const todos = ids.every(id => form.permissoes.includes(id))
    setForm(f => ({ ...f, permissoes: todos ? f.permissoes.filter(p => !ids.includes(p)) : [...new Set([...f.permissoes, ...ids])] }))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setLoading(true)
    try {
      if (editando) { const r = await usuariosService.editarPerfil(perfil.id, form); toast.success('Perfil atualizado!'); onSalvar(r.perfil) }
      else          { const r = await usuariosService.criarPerfil(form);            toast.success('Perfil criado!');    onSalvar(r.perfil) }
      onFechar()
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <DSModal open onClose={onFechar} title={editando ? 'Editar Perfil' : 'Novo Perfil'} size="md"
      footer={
        <>
          <DSBtn variant="primary" onClick={handleSalvar} loading={loading}>
            {editando ? 'Salvar' : 'Criar perfil'}
          </DSBtn>
          <DSBtn onClick={onFechar} disabled={loading}>Cancelar</DSBtn>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>

        {/* Nome + Cor + Descrição */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px', gap: SPACE.md }}>
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nome do perfil *</label>
            <input className="adm-input" value={form.nome} disabled={isSistema && editando}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Jornalista" />
          </div>
          <div>
            <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Cor</label>
            <div style={{ position: 'relative' }}>
              <input type="color" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                style={{ width: '100%', height: 38, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, cursor: 'pointer', padding: 3 }} />
            </div>
          </div>
        </div>
        <div>
          <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, display: 'block', marginBottom: SPACE.xs, textTransform: 'uppercase', letterSpacing: '.04em' }}>Descrição</label>
          <input className="adm-input" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o nível de acesso" />
        </div>

        {/* Permissões */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
            <div>
              <label style={{ fontSize: FONT.sm, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>Permissões</label>
              {!eSuperadmin && !isSistema && (
                <span style={{ marginLeft: 8, fontSize: FONT.xs, color: C.muted }}>
                  {form.permissoes.length}/{totalPerms} selecionadas
                </span>
              )}
            </div>
            {!isSistema && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: FONT.sm }}>
                <input type="checkbox" checked={eSuperadmin}
                  onChange={e => setForm(f => ({ ...f, permissoes: e.target.checked ? ['*'] : [] }))} />
                <span style={{ fontWeight: 700, color: eSuperadmin ? C.amber : C.muted }}>⚡ Acesso total</span>
              </label>
            )}
          </div>

          {isSistema ? (
            <div style={{ fontSize: FONT.sm, color: C.muted, background: C.surface2,
              borderRadius: RADIUS.md, padding: '10px 14px' }}>
              Perfil do sistema — permissões não editáveis.
            </div>
          ) : eSuperadmin ? (
            <div style={{ fontSize: FONT.sm, color: C.amber, background: `${C.amber}10`,
              border: `1px solid ${C.amber}30`, borderRadius: RADIUS.md, padding: '10px 14px' }}>
              ⚡ Este perfil terá acesso irrestrito a <strong>todas</strong> as funcionalidades do sistema.
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`,
              borderRadius: RADIUS.lg, padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {GRUPOS_PERMISSOES.map(({ grupo, perms }) => {
                const ativos = perms.filter(p => form.permissoes.includes(p.id)).length
                const todos  = ativos === perms.length
                return (
                  <div key={grupo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs,
                      padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                      <input type="checkbox" checked={todos} onChange={() => toggleGrupo(perms)} />
                      <span style={{ fontSize: FONT.xs, fontWeight: 700, color: todos ? C.text : C.muted,
                        textTransform: 'uppercase', letterSpacing: '.05em', flex: 1 }}>{grupo}</span>
                      <span style={{ fontSize: FONT.xs, color: C.muted }}>{ativos}/{perms.length}</span>
                    </div>
                    <div style={{ paddingLeft: SPACE.xl, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '3px 8px', marginTop: 4 }}>
                      {perms.map(p => (
                        <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center',
                          fontSize: FONT.sm, color: form.permissoes.includes(p.id) ? C.text : C.muted, cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.permissoes.includes(p.id)} onChange={() => togglePerm(p.id)} />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DSModal>
  )
}

// ── Componente principal ──────────────────────────────────────────
export default function AdminUsuarios() {
  const {
    aba, setAba,
    perfis, loading,
    busca, setBusca,
    usuariosFiltrados,
    excluirUsuario,
    excluirPerfil,
    onSalvarUsuario,
    onSalvarPerfil,
    usuarios,
  } = useUsuarios()

  const [modalUsr,   setModalUsr]   = useState(null)
  const [modalPrf,   setModalPrf]   = useState(null)
  const [modalReset, setModalReset] = useState(null)
  const [excluindo,  setExcluindo]  = useState(null)

  // Filtros adicionais
  const [filtroStatus, setFiltroStatus] = useState('todos')  // todos|ativo|inativo|bloqueado
  const [filtroPerfil, setFiltroPerfil] = useState('')
  const [ordem,        setOrdem]        = useState('nome')   // nome|email|login|status

  // Toggle ativo inline
  const [togglingId, setTogglingId] = useState(null)

  async function toggleAtivo(u) {
    const uid = u.id || u._id
    setTogglingId(uid)
    try {
      const r = await usuariosService.editar(uid, { ativo: !u.ativo })
      onSalvarUsuario(r.usuario)
      toast.success(r.usuario.ativo ? `"${u.nome}" ativado` : `"${u.nome}" desativado`)
    } catch (err) { toast.error(err.message) }
    finally { setTogglingId(null) }
  }

  async function handleExcluir() {
    if (excluindo.tipo === 'usuario') await excluirUsuario(excluindo.id)
    else await excluirPerfil(excluindo.id)
    setExcluindo(null)
  }

  // Estatísticas
  const stats = useMemo(() => ({
    total:     usuarios.length,
    ativos:    usuarios.filter(u => u.ativo !== false).length,
    inativos:  usuarios.filter(u => u.ativo === false).length,
    bloqueados: usuarios.filter(u => u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()).length,
  }), [usuarios])

  // Lista filtrada + ordenada
  const listaFinal = useMemo(() => {
    let lista = usuariosFiltrados
    if (filtroStatus === 'ativo')     lista = lista.filter(u => u.ativo !== false)
    if (filtroStatus === 'inativo')   lista = lista.filter(u => u.ativo === false)
    if (filtroStatus === 'bloqueado') lista = lista.filter(u => u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date())
    if (filtroPerfil) {
      lista = lista.filter(u => {
        const pId = u.perfil_id?.id || u.perfil_id?._id?.toString() || (typeof u.perfil_id === 'string' ? u.perfil_id : '')
        return pId === filtroPerfil
      })
    }
    return [...lista].sort((a, b) => {
      if (ordem === 'nome')   return (a.nome || '').localeCompare(b.nome || '')
      if (ordem === 'email')  return (a.email || '').localeCompare(b.email || '')
      if (ordem === 'login')  return new Date(b.ultimo_login || 0) - new Date(a.ultimo_login || 0)
      if (ordem === 'status') return (b.ativo !== false ? 1 : 0) - (a.ativo !== false ? 1 : 0)
      return 0
    })
  }, [usuariosFiltrados, filtroStatus, filtroPerfil, ordem])

  const FILTROS_STATUS = [
    { id: 'todos',     label: 'Todos',    count: stats.total },
    { id: 'ativo',     label: 'Ativos',   count: stats.ativos },
    { id: 'inativo',   label: 'Inativos', count: stats.inativos },
    { id: 'bloqueado', label: 'Bloqueados', count: stats.bloqueados },
  ]

  return (
    <div className="adm-page">

      {/* ── Modais ─────────────────────────────────────────── */}
      {modalUsr && (
        <ModalUsuario usuario={modalUsr === 'novo' ? null : modalUsr} perfis={perfis}
          onSalvar={onSalvarUsuario} onFechar={() => setModalUsr(null)} />
      )}
      {modalPrf && (
        <ModalPerfil perfil={modalPrf === 'novo' ? null : modalPrf}
          onSalvar={onSalvarPerfil} onFechar={() => setModalPrf(null)} />
      )}
      {modalReset && (
        <ModalResetSenha usuario={modalReset}
          onFechar={() => setModalReset(null)}
          onOk={() => setModalReset(null)} />
      )}

      {/* Modal de exclusão temático */}
      {excluindo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1001,
          background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.red}40`,
            borderRadius: RADIUS.xl, padding: SPACE.xl2, width: '100%', maxWidth: 360,
            display: 'flex', flexDirection: 'column', gap: SPACE.lg,
            boxShadow: `0 0 0 1px ${C.red}20, 0 16px 40px rgba(0,0,0,.4)` }}>
            <div style={{ display: 'flex', gap: SPACE.md }}>
              <div style={{ width: 38, height: 38, borderRadius: RADIUS.lg, flexShrink: 0,
                background: `${C.red}15`, border: `1px solid ${C.red}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AdminIcon name="trash" size={15} style={{ color: C.red }} />
              </div>
              <div>
                <div style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>
                  Excluir {excluindo.tipo === 'usuario' ? 'usuário' : 'perfil'}
                </div>
                <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 2 }}>
                  {excluindo.nome || 'Este item'} será removido permanentemente.
                </div>
              </div>
            </div>
            <div style={{ fontSize: FONT.xs, color: C.red, background: `${C.red}08`,
              border: `1px solid ${C.red}20`, borderRadius: RADIUS.md, padding: '8px 12px' }}>
              ⚠ Esta ação não pode ser desfeita.
            </div>
            <div style={{ display: 'flex', gap: SPACE.md }}>
              <DSBtn variant="ghost" style={{ flex: 1 }} onClick={() => setExcluindo(null)}>Cancelar</DSBtn>
              <DSBtn style={{ flex: 1, background: C.red, borderColor: C.red, color: '#fff', fontWeight: 700 }}
                onClick={handleExcluir}>
                <AdminIcon name="trash" size={12} /> Excluir
              </DSBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Usuários &amp; Perfis</div>
          <div className="adm-page-sub">
            {aba === 'usuarios'
              ? `${stats.ativos} ativo${stats.ativos !== 1 ? 's' : ''} · ${stats.inativos} inativo${stats.inativos !== 1 ? 's' : ''}`
              : `${perfis.length} perfil${perfis.length !== 1 ? 's' : ''} de acesso`
            }
          </div>
        </div>
        <DSBtn variant="primary" onClick={() => aba === 'usuarios' ? setModalUsr('novo') : setModalPrf('novo')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
          {aba === 'usuarios' ? 'Novo usuário' : 'Novo perfil'}
        </DSBtn>
      </div>

      {/* ── Abas ───────────────────────────────────────────── */}
      <div className="adm-tabs">
        {[['usuarios', 'Usuários'], ['perfis', 'Perfis de Acesso']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)} className={`adm-tab-btn${aba === id ? ' active' : ''}`}>
            {label}
            {id === 'usuarios' && <span style={{ marginLeft: 6, fontSize: FONT.xs, color: C.muted }}>({usuarios.length})</span>}
            {id === 'perfis'   && <span style={{ marginLeft: 6, fontSize: FONT.xs, color: C.muted }}>({perfis.length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>Carregando…</div>
      ) : aba === 'usuarios' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>

          {/* Estatísticas */}
          <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap' }}>
            <StatCard label="Total"     value={stats.total}     />
            <StatCard label="Ativos"    value={stats.ativos}    cor="#22c55e" />
            <StatCard label="Inativos"  value={stats.inativos}  cor={C.muted} />
            {stats.bloqueados > 0 && <StatCard label="Bloqueados" value={stats.bloqueados} cor={C.red} />}
          </div>

          {/* Filtros + Busca */}
          <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Busca */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="adm-input" style={{ paddingLeft: 32 }} placeholder="Buscar por nome ou email…"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>

            {/* Filtro status */}
            <div style={{ display: 'flex', gap: 4 }}>
              {FILTROS_STATUS.map(f => (
                <button key={f.id} onClick={() => setFiltroStatus(f.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 20, cursor: 'pointer', border: 'none',
                    fontSize: FONT.xs, fontWeight: filtroStatus === f.id ? 700 : 500,
                    background: filtroStatus === f.id ? C.blue : C.surface2,
                    color:      filtroStatus === f.id ? '#fff' : C.muted,
                  }}>
                  {f.label} {f.count > 0 && <span style={{ opacity: .7 }}>({f.count})</span>}
                </button>
              ))}
            </div>

            {/* Filtro perfil */}
            <select className="adm-input" style={{ minWidth: 130, width: 'auto' }}
              value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)}>
              <option value="">Todos os perfis</option>
              {perfis.map(p => <option key={p.id || p._id} value={p.id || p._id}>{p.nome}</option>)}
            </select>

            {/* Ordenação */}
            <select className="adm-input" style={{ minWidth: 130, width: 'auto' }}
              value={ordem} onChange={e => setOrdem(e.target.value)}>
              <option value="nome">Ordenar: Nome</option>
              <option value="email">Ordenar: Email</option>
              <option value="login">Ordenar: Último login</option>
              <option value="status">Ordenar: Status</option>
            </select>
          </div>

          {/* Lista */}
          <div className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
            {listaFinal.length === 0 ? (
              <p style={{ textAlign: 'center', color: C.muted, padding: '48px 0', fontSize: FONT.md }}>
                Nenhum usuário encontrado.
              </p>
            ) : (
              <div>
                {listaFinal.map((u, idx) => {
                  const uid    = u.id || u._id
                  const perfil = u.perfil_id
                  const acCor  = perfil?.cor || 'var(--adm-accent)'
                  const isBloqueado = u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()
                  const isToggling  = togglingId === uid

                  return (
                    <div key={uid} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: SPACE.md, padding: `${SPACE.lg}px 16px`, flexWrap: 'wrap',
                      borderBottom: idx < listaFinal.length - 1 ? `1px solid ${C.border}` : 'none',
                      borderLeft: `3px solid ${u.ativo !== false ? acCor : C.red}`,
                      opacity: u.ativo !== false ? 1 : 0.7,
                      background: isToggling ? `${C.blue}05` : 'transparent',
                      transition: 'background .3s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg, flex: 1, minWidth: 0 }}>
                        <AvatarCircle nome={u.nome} email={u.email} cor={perfil?.cor} />

                        <div style={{ minWidth: 0, flex: 1 }}>
                          {/* Nome + badges */}
                          <div style={{ fontWeight: 700, fontSize: FONT.md, color: C.text,
                            display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
                            {u.nome}
                            <DSBadge variant={u.ativo !== false ? 'green' : 'red'} style={{ fontSize: 9 }}>
                              {u.ativo !== false ? 'Ativo' : 'Inativo'}
                            </DSBadge>
                            {isBloqueado && <DSBadge variant="orange" style={{ fontSize: 9 }}>🔒 Bloqueado</DSBadge>}
                            {u.tentativas_login > 0 && (
                              <span style={{ fontSize: FONT.xs, color: C.amber }}>
                                ⚠ {u.tentativas_login} falha{u.tentativas_login !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {/* Email */}
                          <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 1 }}>{u.email}</div>

                          {/* Perfil + último login */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.xs, flexWrap: 'wrap' }}>
                            {perfil && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '1px 7px', borderRadius: RADIUS.sm,
                                fontSize: FONT.xs, fontWeight: 700,
                                background: `${perfil.cor || '#6366f1'}18`,
                                color: perfil.cor || '#6366f1',
                                border: `1px solid ${perfil.cor || '#6366f1'}30`,
                              }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%',
                                  background: perfil.cor || '#6366f1' }} />
                                {perfil.nome}
                              </span>
                            )}
                            <span style={{ fontSize: FONT.xs, color: C.muted }}>
                              {u.ultimo_login
                                ? `Login ${relTime(u.ultimo_login)}`
                                : u.ultimo_acesso
                                  ? `Acesso ${relTime(u.ultimo_acesso)}`
                                  : 'Sem login registrado'
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: SPACE.xs, flexShrink: 0, flexWrap: 'wrap' }}>
                        {/* Toggle ativo */}
                        <button
                          onClick={() => toggleAtivo(u)}
                          disabled={isToggling}
                          title={u.ativo !== false ? 'Desativar usuário' : 'Ativar usuário'}
                          style={{
                            padding: '5px 8px', borderRadius: RADIUS.sm, cursor: 'pointer',
                            background: u.ativo !== false ? '#22c55e12' : `${C.red}12`,
                            border: `1px solid ${u.ativo !== false ? '#22c55e30' : `${C.red}30`}`,
                            color: u.ativo !== false ? '#16a34a' : C.red,
                            fontSize: FONT.xs, fontWeight: 700,
                          }}>
                          {isToggling ? '…' : u.ativo !== false ? '✓ Ativo' : '✗ Inativo'}
                        </button>

                        {/* Reset senha */}
                        <button onClick={() => setModalReset(u)}
                          title="Redefinir senha"
                          className="adm-btn adm-btn-ghost adm-btn-sm">
                          <AdminIcon name="key" size={12} />
                        </button>

                        {/* Editar */}
                        <button onClick={() => setModalUsr(u)} className="adm-btn adm-btn-ghost adm-btn-sm">
                          <AdminIcon name="edit" size={12} />
                        </button>

                        {/* Excluir */}
                        <button onClick={() => setExcluindo({ tipo: 'usuario', id: uid, nome: u.nome })}
                          className="adm-btn adm-btn-danger adm-btn-sm">
                          <AdminIcon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {listaFinal.length > 0 && (
            <div style={{ fontSize: FONT.xs, color: C.muted, textAlign: 'right' }}>
              Exibindo {listaFinal.length} de {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      ) : (
        /* ── Aba Perfis ──────────────────────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: SPACE.lg }}>
          {perfis.map(p => {
            const pid      = p.id || p._id
            const qtdUsers = usuarios.filter(u => {
              const ref = u.perfil_id?.id || u.perfil_id?._id?.toString() || (typeof u.perfil_id === 'string' ? u.perfil_id : '')
              return ref === pid
            }).length
            const [expandido, setExpandido] = [false, () => {}]  // placeholder
            return (
              <div key={pid} className="adm-card" style={{ position: 'relative', padding: SPACE.xl2,
                borderTop: `3px solid ${p.cor || 'var(--adm-accent)'}` }}>
                {p.sistema && (
                  <span style={{ position: 'absolute', top: SPACE.md, right: SPACE.md,
                    fontSize: FONT.xs, fontWeight: 700, color: C.muted,
                    background: C.surface2, borderRadius: RADIUS.sm, padding: '2px 7px' }}>
                    SISTEMA
                  </span>
                )}

                {/* Header do card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.md }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: `${p.cor}22`, border: `2px solid ${p.cor}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: FONT.md, fontWeight: 800, color: p.cor }}>
                    {p.nome[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: FONT.md, color: C.text }}>{p.nome}</div>
                    {p.descricao && (
                      <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 1, lineHeight: '13px' }}>{p.descricao}</div>
                    )}
                  </div>
                </div>

                {/* Pills */}
                <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 20, background: `${p.cor || '#6366f1'}18`, color: p.cor || '#6366f1',
                    border: `1px solid ${p.cor || '#6366f1'}30` }}>
                    {p.permissoes?.includes('*') ? '⚡ Acesso total' : `${p.permissoes?.length || 0} permissões`}
                  </span>
                  <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 20, background: C.surface2, color: C.muted, border: `1px solid ${C.border}` }}>
                    {qtdUsers} usuário{qtdUsers !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Preview de permissões por grupo */}
                {!p.permissoes?.includes('*') && p.permissoes?.length > 0 && (
                  <div style={{ marginBottom: SPACE.md, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {GRUPOS_PERMISSOES.map(({ grupo, perms }) => {
                      const ativos = perms.filter(pm => p.permissoes.includes(pm.id)).length
                      if (ativos === 0) return null
                      const pct = Math.round((ativos / perms.length) * 100)
                      return (
                        <div key={grupo}>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            fontSize: FONT.xs, color: C.muted, marginBottom: 2 }}>
                            <span>{grupo}</span>
                            <span>{ativos}/{perms.length}</span>
                          </div>
                          <div style={{ height: 3, background: C.surface2, borderRadius: 2 }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${pct}%`,
                              background: p.cor || '#6366f1', transition: 'width .3s' }} />
                          </div>
                        </div>
                      )
                    }).filter(Boolean)}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display: 'flex', gap: SPACE.sm }}>
                  <button onClick={() => setModalPrf(p)} className="adm-btn adm-btn-ghost adm-btn-sm" style={{ flex: 1 }}>
                    <AdminIcon name="edit" size={12} /> Editar
                  </button>
                  {!p.sistema && (
                    <button onClick={() => setExcluindo({ tipo: 'perfil', id: pid, nome: p.nome })}
                      className="adm-btn adm-btn-danger adm-btn-sm">
                      <AdminIcon name="trash" size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
