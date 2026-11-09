/**
 * AdminSetup.jsx — Instalador do AL Sistemas (componente-roteador).
 *
 * Gerencia apenas as 4 fases do instalador:
 *   verificando → instalar | painel → sucesso
 *
 * Toda a UI foi extraída para:
 *   components/admin/setup/SetupForms.jsx    — primitivos e dados
 *   components/admin/setup/ConfigMongo.jsx   — painel MongoDB
 *   components/admin/setup/ConfigCloudinary.jsx — painel Cloudinary
 */
import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { setupService }        from '../../services/api'
import toast                   from 'react-hot-toast'

import {
  C, Ico, Spin, wrap, card, labelSty, inputSty, errMsg,
  btnSty, infoBox, divider, secTitle,
  Campo, Check, CampoAcessoFixo, RegrasSenha,
  StatusBadge, SeletorDados, OPCOES_SEED,
} from '../../components/admin/setup/SetupForms'
import ConfigMongo      from '../../components/admin/setup/ConfigMongo'
import ConfigCloudinary from '../../components/admin/setup/ConfigCloudinary'
import ConfigIntegracoes from '../../components/admin/setup/ConfigIntegracoes'
import { SPACE, RADIUS, FONT } from '../../themes/tokens'

/* ═══════════════════════════════════════════════════════════════
   TELA — Verificando
═══════════════════════════════════════════════════════════════ */
function TelaVerificando() {
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.muted, fontSize: FONT.md }}>
        <Spin/> Verificando instalação…
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TELA — Formulário de instalação
═══════════════════════════════════════════════════════════════ */
function TelaInstalacao({ onSucesso, statusBanco }) {
  const [form, setForm] = useState({ nomeSite: '', nome: '', email: '', senha: '', confirmar: '' })
  const [erros, setErros] = useState({})
  const [seed, setSeed]   = useState(true)
  const [dadosSel, setDadosSel] = useState(OPCOES_SEED.map(o => o.id))
  const [loading, setLoading]   = useState(false)
  const [envConfig, setEnvConfig] = useState({})

  useEffect(() => {
    setupService.lerEnvConfig().then(data => setEnvConfig(data)).catch(() => {})
  }, [])

  const set = k => v => { setForm(f => ({ ...f, [k]: v })); setErros(e => ({ ...e, [k]: '' })) }

  function validar() {
    const e = {}
    if (!form.nomeSite.trim())         e.nomeSite  = 'Nome do site é obrigatório'
    if (!form.nome.trim())             e.nome      = 'Nome é obrigatório'
    if (!form.email.trim())            e.email     = 'Email é obrigatório'
    if (form.senha.length < 8)         e.senha     = 'Mínimo 8 caracteres'
    if (form.senha !== form.confirmar) e.confirmar = 'As senhas não coincidem'
    setErros(e)
    return !Object.keys(e).length
  }

  async function instalar() {
    if (!validar()) return
    setLoading(true)
    try {
      const res = await setupService.instalar({
        nome: form.nome, email: form.email, senha: form.senha,
        nome_site: form.nomeSite,
        importar_seed: seed,
        dados_escolhidos: seed ? dadosSel : [],
      })
      onSucesso(res)
    } catch (err) {
      toast.error(err.message || 'Erro na instalação')
    } finally { setLoading(false) }
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ width: 54, height: 54, background: C.green, borderRadius: RADIUS.xl2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'white' }}>
            {Ico.shield}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>Instalação do AL Sistemas</h1>
          <p style={{ fontSize: FONT.base, color: C.muted, lineHeight: 1.6, margin: 0 }}>
            Configure o acesso inicial ao painel.<br/>
            Este formulário só está disponível enquanto o banco estiver vazio.
          </p>
        </div>

        {statusBanco?.banco_nome && (
          <div style={infoBox(C.blue)}>
            <span style={{ color: C.blue, flexShrink: 0, marginTop: 1 }}>{Ico.db}</span>
            <span style={{ fontSize: FONT.base, color: '#93c5fd', lineHeight: 1.5 }}>
              Banco detectado: <strong>{statusBanco.banco_nome}</strong> — vazio e pronto para instalação.
            </span>
          </div>
        )}

        <ConfigMongo initialUri={envConfig.mongo_uri} />
        <ConfigCloudinary initialValues={envConfig} />

        <div style={{ ...card(), marginTop: 16 }}>
          <div style={infoBox(C.blue)}>
            <span style={{ color: C.blue, flexShrink: 0, marginTop: 1 }}>{Ico.info}</span>
            <span style={{ fontSize: FONT.base, color: '#93c5fd', lineHeight: 1.5 }}>
              Serão criados automaticamente os perfis&nbsp;
              <strong>Superadmin</strong>, <strong>Jornalista</strong> e&nbsp;<strong>Usuário</strong>.
            </span>
          </div>

          <p style={secTitle}>Sobre o site</p>
          <Campo label="Nome do site *" placeholder="Ex.: AL Sistemas" value={form.nomeSite} onChange={set('nomeSite')} erro={erros.nomeSite} autoComplete="off"/>

          <hr style={divider}/>

          <p style={secTitle}>Conta do administrador</p>
          <Campo label="Seu nome *"        type="text"     placeholder="Ex.: João da Silva"      value={form.nome}      onChange={set('nome')}      erro={erros.nome}      autoComplete="name"/>
          <Campo label="Email de acesso *" type="email"    placeholder="admin@exemplo.com"        value={form.email}     onChange={set('email')}     erro={erros.email}     autoComplete="email"/>
          <Campo label="Senha *"           type="password" placeholder="Mínimo 8 caracteres"     value={form.senha}     onChange={set('senha')}     erro={erros.senha}     autoComplete="new-password" mostrarForca/>
          <RegrasSenha senha={form.senha} />
          <div style={{ marginTop: 12 }}>
            <Campo label="Confirmar senha *" type="password" placeholder="Digite a senha novamente" value={form.confirmar} onChange={set('confirmar')} erro={erros.confirmar} autoComplete="new-password"/>
          </div>
          <CampoAcessoFixo />

          <hr style={divider}/>

          <Check checked={seed} onChange={setSeed} label="Importar dados de exemplo"
            desc="Popula o banco com categorias, notícias, eventos e horários de ônibus para explorar o painel." />

          {seed && (
            <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: '14px 14px 4px', marginBottom: SPACE.xl }}>
              <SeletorDados selecionados={dadosSel} onChange={setDadosSel} />
            </div>
          )}

          <button onClick={instalar} disabled={loading} style={btnSty('green', loading)}>
            {loading ? <><Spin/> Instalando…</> : <>{Ico.arrow} Concluir Instalação</>}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: FONT.sm, color: C.muted, marginTop: 14 }}>
          Rota: <code style={{ color: C.subtle, fontSize: FONT.sm }}>POST /api/setup</code>
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TELA — Sucesso
═══════════════════════════════════════════════════════════════ */
function TelaSucesso({ resultado, onIrPainel }) {
  const [desativarStatus, setDesativarStatus] = useState(null)
  const [desativarMsg,    setDesativarMsg]    = useState('')

  async function handleDesativar() {
    setDesativarStatus('loading')
    try {
      const data = await setupService.desativarArquivo()
      setDesativarStatus('done')
      setDesativarMsg(data.mensagem || 'Setup desativado com sucesso!')
    } catch (err) {
      setDesativarStatus('error')
      setDesativarMsg(err.message || 'Erro ao desativar setup.')
    }
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 500, textAlign: 'center' }}>
        <div style={{ color: C.greenAcc, marginBottom: 14 }}>{Ico.check}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>Instalação concluída!</h2>
        <p style={{ color: C.muted, fontSize: FONT.md, marginBottom: 24 }}>
          O sistema foi configurado e você já está autenticado.
        </p>

        {resultado?.usuario && (
          <div style={{ ...card({ textAlign: 'left' }), marginBottom: 14 }}>
            <p style={secTitle}>Conta criada</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.base }}>
                <span style={{ color: C.muted }}>Nome</span>
                <strong style={{ color: C.text }}>{resultado.usuario.nome}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.base }}>
                <span style={{ color: C.muted }}>Email</span>
                <strong style={{ color: C.text }}>{resultado.usuario.email}</strong>
              </div>
            </div>
          </div>
        )}

        {resultado?.perfis_criados?.length > 0 && (
          <div style={{ ...card({ textAlign: 'left' }), marginBottom: 14 }}>
            <p style={secTitle}>Perfis de acesso criados</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              {resultado.perfis_criados.map(p => (
                <span key={p} style={{ padding: '4px 10px', borderRadius: RADIUS.pill, fontSize: FONT.sm, fontWeight: 600, background: C.greenAcc + '22', color: C.greenAcc }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {resultado?.seed && Object.values(resultado.seed).some(v => v > 0) && (
          <div style={{ ...card({ textAlign: 'left' }), marginBottom: 14 }}>
            <p style={secTitle}>Dados de exemplo importados</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
              {Object.entries(resultado.seed).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} style={{ padding: '4px 10px', borderRadius: RADIUS.pill, fontSize: FONT.sm, fontWeight: 600, background: C.blue + '22', color: C.blue }}>{k}: {v}</span>
              ))}
            </div>
          </div>
        )}

        {resultado?.seed_erro && (
          <div style={{ ...infoBox(C.orange), textAlign: 'left', marginBottom: 14 }}>
            <span style={{ color: C.orange, flexShrink: 0 }}>{Ico.warn}</span>
            <div style={{ fontSize: FONT.base, color: '#fdba74', lineHeight: 1.5 }}>
              <strong>Dados de exemplo não importados:</strong><br/>
              {resultado.seed_erro}<br/>
              <span style={{ opacity: .8 }}>Você pode importá-los depois em <strong>Gerenciar Banco → Importar Seed</strong>.</span>
            </div>
          </div>
        )}

        {/* Segurança pós-instalação */}
        <div style={{ ...card({ textAlign: 'left' }), marginBottom: 20, borderColor: desativarStatus === 'done' ? C.green + '88' : C.border }}>
          <p style={secTitle}>🔒 Segurança pós-instalação</p>
          {desativarStatus === 'done' ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={C.greenAcc} strokeWidth="2.2" width="16" height="16" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12"/></svg>
              <div>
                <p style={{ fontSize: FONT.base, color: C.greenAcc, fontWeight: 700, marginBottom: 3 }}>Setup desativado com sucesso!</p>
                <p style={{ fontSize: FONT.sm, color: C.muted, lineHeight: 1.5 }}>{desativarMsg}</p>
              </div>
            </div>
          ) : desativarStatus === 'error' ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
              <span style={{ color: C.orange, flexShrink: 0 }}>{Ico.warn}</span>
              <p style={{ fontSize: FONT.sm, color: '#fdba74', lineHeight: 1.5 }}>{desativarMsg}</p>
            </div>
          ) : (
            <p style={{ fontSize: FONT.base, color: C.muted, lineHeight: 1.6, marginBottom: SPACE.lg }}>
              Recomendamos desativar o arquivo de setup após a instalação para impedir que terceiros acessem esta tela.
            </p>
          )}
          {desativarStatus !== 'done' && desativarStatus !== 'confirm' && (
            <button onClick={() => setDesativarStatus('confirm')} disabled={desativarStatus === 'loading'}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: RADIUS.md, border: `1px solid ${C.redDim}`, background: C.redDim + '44', color: '#fca5a5', fontSize: FONT.base, fontWeight: 600, cursor: 'pointer' }}>
              {Ico.trash} Desativar arquivo de setup
            </button>
          )}
          {desativarStatus === 'confirm' && (
            <div style={{ background: C.redDim + '33', border: `1px solid ${C.red}44`, borderRadius: RADIUS.md, padding: '12px 14px' }}>
              <p style={{ fontSize: FONT.base, color: '#fca5a5', marginBottom: 10, lineHeight: 1.5 }}>
                <strong>Atenção:</strong> Esta ação irá desativar as rotas de setup. Tem certeza?
              </p>
              <div style={{ display: 'flex', gap: SPACE.md }}>
                <button onClick={handleDesativar} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, padding: '8px 0', borderRadius: RADIUS.md, border: 'none', background: C.redDim, color: C.text, fontSize: FONT.base, fontWeight: 700, cursor: 'pointer' }}>
                  {Ico.trash} Sim, desativar
                </button>
                <button onClick={() => setDesativarStatus(null)} style={{ flex: 1, padding: '8px 0', borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: 'none', color: C.muted, fontSize: FONT.base, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {desativarStatus === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, color: C.muted, fontSize: FONT.base }}>
              <Spin size={13}/> Desativando arquivo de setup…
            </div>
          )}
        </div>

        <button onClick={onIrPainel} style={{ ...btnSty('green'), width: 'auto', padding: '12px 40px', fontSize: 14 }}>
          {Ico.arrow} Entrar no Painel
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TELA — Painel de banco (já instalado)
═══════════════════════════════════════════════════════════════ */
function PainelBanco({ status: statusInicial, onConcluido }) {
  const [nomeSite, setNomeSite] = useState('AL Sistemas')
  const [dadosSel, setDadosSel] = useState(OPCOES_SEED.map(o => o.id))
  const [limpar, setLimpar]     = useState(false)
  const [mantUser, setMantUser] = useState(true)
  const [resetTxt, setResetTxt] = useState('')
  const [loading, setLoading]   = useState('')
  const [contagens, setContagens] = useState(statusInicial?.contagens ?? {})
  const [bancoDone, setBancoDone] = useState(null)
  const [envConfig, setEnvConfig] = useState({})

  useEffect(() => {
    setupService.lerEnvConfig().then(data => setEnvConfig(data)).catch(() => {})
  }, [])

  async function recarregarContagens() {
    try { const s = await setupService.status(); setContagens(s.contagens ?? {}) } catch {}
  }

  async function importarSeed() {
    setLoading('seed'); setBancoDone(null)
    try {
      const res = await setupService.seed({ nome_site: nomeSite, limpar_antes: limpar, dados_escolhidos: dadosSel })
      const msg = res.mensagem || 'Dados importados com sucesso!'
      toast.success(msg)
      setBancoDone({ tipo: 'seed', msg })
      await recarregarContagens()
      onConcluido?.({ seed: res.importados, mensagem: msg })
    } catch (err) { toast.error(err.message || 'Erro ao importar') }
    finally { setLoading('') }
  }

  async function resetarBanco() {
    if (resetTxt !== 'CONFIRMAR_RESET') { toast.error('Digite CONFIRMAR_RESET'); return }
    setLoading('reset'); setBancoDone(null)
    try {
      await setupService.resetDb({ confirmar: resetTxt, manter_usuarios: mantUser })
      toast.success('Banco resetado!')
      setTimeout(() => window.location.reload(), 1200)
    } catch (err) { toast.error(err.message || 'Erro ao resetar') }
    finally { setLoading('') }
  }

  const cnt = contagens

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", padding: '16px 10px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Gerenciar Banco de Dados</h2>
        <p style={{ fontSize: FONT.base, color: C.muted, marginBottom: 24 }}>
          Banco: <strong style={{ color: C.subtle }}>{statusInicial?.banco_nome ?? '—'}</strong>
        </p>

        {bancoDone && (
          <div style={{ ...infoBox(bancoDone.tipo === 'reset' ? C.orange : C.greenAcc), marginBottom: 20 }}>
            <span style={{ color: bancoDone.tipo === 'reset' ? C.orange : C.greenAcc, flexShrink: 0 }}>
              {bancoDone.tipo === 'reset' ? Ico.trash : Ico.seed}
            </span>
            <span style={{ fontSize: FONT.base, color: bancoDone.tipo === 'reset' ? '#fdba74' : '#86efac', lineHeight: 1.5 }}>
              {bancoDone.msg}
            </span>
          </div>
        )}

        <ConfigMongo initialUri={envConfig.mongo_uri} />
        <ConfigCloudinary initialValues={envConfig} />
        <ConfigIntegracoes />
        <div style={{ marginBottom: SPACE.md }} />

        {/* Estado atual */}
        <div style={{ ...card(), marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: 14 }}>
            <span style={{ color: C.blue }}>{Ico.db}</span>
            <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>Estado atual</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
            {Object.entries(cnt).map(([k, v]) => (
              <div key={k} style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '7px 14px', textAlign: 'center', minWidth: 64 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: v > 0 ? C.greenAcc : C.muted }}>{v}</div>
                <div style={{ fontSize: FONT.xs, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Importar seed */}
        <div style={{ ...card(), marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: 14 }}>
            <span style={{ color: C.greenAcc }}>{Ico.seed}</span>
            <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>Importar dados de exemplo</span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelSty}>Nome do site nos dados</label>
            <input value={nomeSite} onChange={e => setNomeSite(e.target.value)} style={inputSty()} placeholder="Ex.: AL Sistemas" />
          </div>
          <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: RADIUS.lg, padding: '14px 14px 4px', marginBottom: 14 }}>
            <SeletorDados selecionados={dadosSel} onChange={setDadosSel} />
          </div>
          <Check checked={limpar} onChange={setLimpar} warnMode color={C.red}
            label="Limpar dados existentes antes de importar"
            desc="Remove notícias, categorias, eventos e ônibus antes de recriar os exemplos." />
          {limpar && (
            <div style={{ ...infoBox(C.orange), marginBottom: 14 }}>
              <span style={{ color: C.orange, flexShrink: 0 }}>{Ico.warn}</span>
              <span style={{ fontSize: FONT.sm, color: '#fdba74', lineHeight: 1.5 }}>
                Todas as notícias, categorias, eventos e ônibus serão excluídos antes da importação.
              </span>
            </div>
          )}
          <button onClick={importarSeed} disabled={loading === 'seed'} style={btnSty(limpar ? 'danger' : 'green', loading === 'seed')}>
            {loading === 'seed' ? <><Spin/> Importando…</> : <>{Ico.seed} Importar Seed</>}
          </button>
        </div>

        {/* Reset total */}
        <div style={{ ...card({ border: `1px solid ${C.red}44` }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: 14 }}>
            <span style={{ color: C.red }}>{Ico.trash}</span>
            <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>Reset do banco</span>
          </div>
          <div style={{ ...infoBox(C.red), marginBottom: 14 }}>
            <span style={{ color: C.red, flexShrink: 0, marginTop: 1 }}>{Ico.warn}</span>
            <span style={{ fontSize: FONT.sm, color: '#fca5a5', lineHeight: 1.5 }}>
              Ação <strong>irreversível</strong>. Todo conteúdo será apagado permanentemente.
            </span>
          </div>
          <Check checked={mantUser} onChange={setMantUser}
            label="Manter usuários e perfis de acesso"
            desc="Apenas o conteúdo (notícias, eventos, etc.) será removido." />
          <div style={{ marginBottom: SPACE.xl }}>
            <label style={labelSty}>Digite <strong style={{ color: C.subtle }}>CONFIRMAR_RESET</strong> para continuar</label>
            <input value={resetTxt} onChange={e => setResetTxt(e.target.value)} style={inputSty()} placeholder="CONFIRMAR_RESET" />
          </div>
          <button onClick={resetarBanco} disabled={loading === 'reset' || resetTxt !== 'CONFIRMAR_RESET'}
            style={btnSty('danger', loading === 'reset' || resetTxt !== 'CONFIRMAR_RESET')}>
            {loading === 'reset' ? <><Spin/> Resetando…</> : <>{Ico.trash} Resetar Banco</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════ */
export default function AdminSetup() {
  const navigate = useNavigate()
  const [fase,   setFase]   = useState('verificando')
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    setupService.status()
      .then(s => { setStatus(s); setFase(s.setup_needed ? 'instalar' : 'painel') })
      .catch(() => setFase('instalar'))
  }, [navigate])

  if (fase === 'verificando') return <TelaVerificando/>
  if (fase === 'painel')      return <PainelBanco status={status} onConcluido={res => { setResult(res); setFase('sucesso') }} />
  if (fase === 'sucesso')     return <TelaSucesso resultado={result} onIrPainel={() => { window.location.href = '/admin' }} />

  return <TelaInstalacao statusBanco={status} onSucesso={res => { setResult(res); setFase('sucesso') }} />
}
