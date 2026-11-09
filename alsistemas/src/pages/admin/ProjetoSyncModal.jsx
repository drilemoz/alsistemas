/**
 * ProjetoSyncModal.jsx — Modal de Sincronização e Commit GitHub
 *
 * Sprint 7 — GitHub Sync original (preservado na íntegra).
 * Sprint 8 — Painel de narração em tempo real via SSE.
 * Sprint 9 — Tela de Commit & Push via GitHub Git Data API.
 *
 * Telas:
 *   'status'       — Exibe vínculo, status e botões de ação
 *   'sincronizando'— Painel de narração SSE (pull: GitHub → local)
 *   'vincular'     — Seleção de repositório GitHub para vincular
 *   'commit'       — Formulário + painel SSE (push: local → GitHub)
 *
 * Props:
 *   projeto   {object}   — objeto do projeto local (nome, status, tecnologias…)
 *   onClose   {Function} — fecha o modal
 *   onSynced  {Function} — callback após sync bem-sucedido
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { T as C, SPACE, RADIUS, FONT }           from '../../themes/tokens'
import AdminIcon                                 from '../../components/admin/ui/AdminIcon'
import { useProjetosSync }                       from '../../modules/projetos/useProjetosSync.js'
import { useProjetosSyncStream }                 from '../../modules/projetos/useProjetosSyncStream.js'
import { useProjetosCommitStream }               from '../../modules/projetos/useProjetosCommitStream.js'
import { githubService }                         from '../../services/domains/github.js'

/* ════════════════════════════════════════════════════════════════
   HELPERS GLOBAIS
════════════════════════════════════════════════════════════════ */

function relTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const d    = Math.floor(diff / 86_400_000)
  if (d < 1)   return 'hoje'
  if (d < 7)   return `${d}d atrás`
  if (d < 30)  return `${Math.floor(d / 7)}sem atrás`
  if (d < 365) return `${Math.floor(d / 30)}mo atrás`
  return `${Math.floor(d / 365)}a atrás`
}

/* ── Badge de status de sync ────────────────────────────────── */
const SYNC_META = {
  atualizado:   { label: 'Em sincronia',  cor: C.greenSolid, icon: 'check'  },
  desatualizado:{ label: 'Desatualizado', cor: C.amber, icon: 'alert'  },
  desconhecido: { label: 'Desconhecido',  cor: C.subtle, icon: 'info'   },
}

function SyncBadge({ statusSync }) {
  const meta = SYNC_META[statusSync] || SYNC_META.desconhecido
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      fontSize:FONT.xs, fontWeight:700, color: meta.cor,
      background:`${meta.cor}18`, border:`1px solid ${meta.cor}30`,
      borderRadius:20, padding:'3px 10px',
    }}>
      <AdminIcon name={meta.icon} size={10} />
      {meta.label}
    </span>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', gap:SPACE.md, alignItems:'baseline' }}>
      <span style={{ fontSize:FONT.sm, color:C.muted, flexShrink:0, width:130 }}>{label}</span>
      <span style={{ fontSize:FONT.sm, color:C.text }}>{value || '—'}</span>
    </div>
  )
}

/* ── Item de repositório na lista de vincular ───────────────── */
function RepoItem({ repo, selecionado, onSelect }) {
  const ativo = selecionado?.nomeCompleto === repo.nomeCompleto
  return (
    <button
      onClick={() => onSelect(repo)}
      style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        width:'100%', background: ativo ? `${C.blue}18` : 'none',
        border:`1px solid ${ativo ? C.blue : C.border}`,
        borderRadius:7, padding:'8px 12px', cursor:'pointer',
        textAlign:'left', transition:'all .15s',
      }}
    >
      <div>
        <div style={{ fontSize:FONT.base, fontWeight:600, color: ativo ? C.blue : C.text }}>
          {repo.nomeCompleto}
        </div>
        {repo.descricao && (
          <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>
            {repo.descricao.slice(0, 80)}{repo.descricao.length > 80 ? '…' : ''}
          </div>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:SPACE.lg - 2, flexShrink:0, marginLeft:10 }}>
        {repo.linguagem && (
          <span style={{ fontSize:FONT.xs, color:C.muted }}>{repo.linguagem}</span>
        )}
        {ativo && <AdminIcon name="check" size={12} style={{ color:C.blue }} />}
      </div>
    </button>
  )
}

/* ════════════════════════════════════════════════════════════════
   ETAPA_LABEL — cobre sync (Sprint 8) e commit (Sprint 9)
════════════════════════════════════════════════════════════════ */
const ETAPA_LABEL = {
  /* ── Sync (pull) ── */
  verificando_vinculo: 'Verificando vínculo',
  verificando_github:  'Consultando GitHub',
  analisando_local:    'Analisando projeto local',
  comparando:          'Comparando versões',
  baixando:            'Baixando do GitHub',
  extraindo:           'Extraindo arquivos',
  enviando:            'Verificando integridade',
  validando_remoto:    'Validando estado remoto',
  /* ── Commit (push) ── */
  consultando_github:  'Consultando GitHub',
  listando_arquivos:   'Listando arquivos locais',
  criando_blobs:       'Enviando arquivos (blobs)',
  criando_tree:        'Construindo tree',
  criando_commit:      'Criando objeto de commit',
  atualizando_ref:     'Fazendo push da branch',
  /* ── Compartilhado ── */
  registrando:         'Registrando no banco',
  concluido:           'Concluído',
}

/* ── Cores de narração por nível ────────────────────────────── */
const NIVEL_COR = {
  info:    C.muted,
  warn:    C.amber,
  error:   C.red,
  success: C.greenSolid,
}

/* ── Metadados de status para o painel de sync ─────────────── */
const STATUS_SYNC_META = {
  running:      { cor: C.blue,    icon: 'spinSm',  label: 'Sincronizando…'           },
  success:      { cor: C.greenSolid, icon: 'checkLg', label: 'Sincronização concluída'  },
  error:        { cor: C.red, icon: 'alert',   label: 'Erro na sincronização'    },
  inconsistent: { cor: C.amber, icon: 'warn',    label: 'Inconsistência detectada' },
}

/* ── Metadados de status para o painel de commit ───────────── */
const STATUS_COMMIT_META = {
  running: { cor: C.blue,    icon: 'spinSm',  label: 'Enviando para o GitHub…'      },
  success: { cor: C.greenSolid, icon: 'checkLg', label: 'Commit realizado com sucesso' },
  error:   { cor: C.red, icon: 'alert',   label: 'Erro no commit'               },
}

/* ════════════════════════════════════════════════════════════════
   PAINEL DE NARRAÇÃO EM TEMPO REAL
   Reutilizado tanto para sync (Sprint 8) quanto para commit (Sprint 9).
   A prop `modo` e `statusMeta` diferenciam o comportamento.
════════════════════════════════════════════════════════════════ */
function PainelNarracao({ stream, onReiniciar, onFechar, nomeProjeto, modo = 'sync', statusMeta = STATUS_SYNC_META }) {
  const { eventos, etapaAtual, progresso, stepData, arquivos, status, relatorio } = stream

  /* Scroll automático */
  const logRef = useRef(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [eventos])

  const [mostrarArquivos, setMostrarArquivos] = useState(false)

  const finalMeta = statusMeta[status] || statusMeta.running || STATUS_SYNC_META.running
  const isRunning = status === 'running'

  const eventosLog = eventos.filter(e => e.tipo === 'narration')

  /* Separa enviados de falhados para o painel de arquivos */
  const enviados = arquivos.filter(a =>
    !a.startsWith('✗') && !a.startsWith('ERRO') && !a.startsWith('⚠ Falha')
  )
  const falhados = arquivos.filter(a =>
    a.startsWith('✗') || a.startsWith('ERRO') || a.startsWith('⚠ Falha')
  )

  /* Download log */
  function baixarLog() {
    const header = [
      `Projeto : ${nomeProjeto}`,
      `Modo    : ${modo === 'commit' ? 'Commit & Push' : 'Sincronização'}`,
      `Status  : ${status}`,
      `Data    : ${new Date().toLocaleString('pt-BR')}`,
      '─'.repeat(60),
      '',
    ].join('\n')
    const corpo = eventosLog.map(ev => {
      const ts  = ev.ts ? new Date(ev.ts).toLocaleTimeString('pt-BR', { hour12: false }) : '??:??:??'
      const pfx = ev.nivel === 'error' ? '✗' : ev.nivel === 'warn' ? '⚠' : ev.nivel === 'success' ? '✓' : '›'
      return `[${ts}] ${pfx} ${ev.msg}`
    }).join('\n')

    let resumo = ''
    if (modo === 'commit' && relatorio?.relatorio) {
      const r = relatorio.relatorio
      resumo = [
        '',
        '─'.repeat(60),
        `RESUMO DO COMMIT`,
        r.commitSha      ? `Commit SHA   : ${r.commitSha}`  : '',
        r.branch         ? `Branch       : ${r.branch}`     : '',
        r.mensagem       ? `Mensagem     : ${r.mensagem}`   : '',
        r.totalArquivos  ? `Enviados     : ${r.totalArquivos}` : '',
        r.ignorados      ? `Ignorados    : ${r.ignorados}`  : '',
        r.arquivosErro?.length ? `Com falha    : ${r.arquivosErro.length}` : '',
        r.arquivosErro?.length ? r.arquivosErro.map(e => `  - ${e}`).join('\n') : '',
      ].filter(Boolean).join('\n')
    }

    const blob = new Blob([header + corpo + resumo], { type: 'text/plain;charset=utf-8' })
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `log-${modo}-${nomeProjeto}-${Date.now()}.txt`,
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Barra de progresso com % ────────────────────────── */}
      <div style={{ marginBottom: SPACE.xl }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 4,
        }}>
          {/* Etapa atual */}
          {etapaAtual && (
            <span style={{
              fontSize: FONT.xs, color: C.muted,
              background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: RADIUS.xs, padding: '2px 7px',
            }}>
              {ETAPA_LABEL[etapaAtual] || etapaAtual}
              {/* Contador de blobs ao vivo */}
              {etapaAtual === 'criando_blobs' && stepData?.total > 0 && (
                <span style={{ marginLeft: 6, color: C.blue, fontWeight: 700 }}>
                  {stepData.idx}/{stepData.total}
                </span>
              )}
            </span>
          )}
          {/* Porcentagem */}
          <span style={{
            fontSize: FONT.xs, fontWeight: 700,
            color: status === 'error'   ? C.red
                 : status === 'success' ? C.greenSolid
                 : C.blue,
            marginLeft: 'auto',
          }}>
            {progresso}%
          </span>
        </div>
        <div style={{
          height: 5, background: C.border,
          borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progresso}%`,
            background: status === 'error'        ? C.red
                      : status === 'inconsistent' ? C.amber
                      : status === 'success'      ? C.greenSolid
                      : `linear-gradient(90deg, ${C.blue}, #6366f1)`,
            borderRadius: 3,
            transition: 'width .35s ease',
          }} />
        </div>
      </div>

      {/* ── Status geral ───────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE.md,
        marginBottom: SPACE.lg,
      }}>
        <AdminIcon
          name={isRunning ? 'spinSm' : finalMeta.icon}
          size={14}
          style={{ color: finalMeta.cor }}
        />
        <span style={{ fontSize: FONT.base, fontWeight: 700, color: finalMeta.cor }}>
          {finalMeta.label}
        </span>
        {/* Mini-contador inline durante blobs */}
        {isRunning && etapaAtual === 'criando_blobs' && stepData?.total > 0 && (
          <span style={{
            fontSize: FONT.xs, color: C.muted,
            background: `${C.blue}15`, border: `1px solid ${C.blue}30`,
            borderRadius: 20, padding: '1px 8px',
          }}>
            {stepData.idx} de {stepData.total} arquivo{stepData.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Terminal de narração ────────────────────────────── */}
      <div
        ref={logRef}
        style={{
          background:    C.surf2,
          border:        `1px solid ${C.border}`,
          borderRadius:  10,
          padding:       '12px 14px',
          minHeight:     200,
          maxHeight:     260,
          overflowY:     'auto',
          fontFamily:    '"SF Mono","Fira Code","Consolas",monospace',
          display:       'flex',
          flexDirection: 'column',
          gap:           3,
          scrollBehavior:'smooth',
        }}
      >
        <style>{`
          @keyframes cursor-blink{0%,100%{opacity:1}50%{opacity:0}}
          .sync-cursor{display:inline-block;width:7px;height:12px;
            background:${C.blue};border-radius:1px;margin-left:4px;
            animation:cursor-blink 1s steps(1) infinite;vertical-align:middle}
        `}</style>

        {eventosLog.length === 0 && (
          <span style={{ fontSize: FONT.sm, color: C.muted, fontStyle: 'italic' }}>
            Aguardando início…
          </span>
        )}

        {eventosLog.map((ev, i) => {
          const isLast    = i === eventosLog.length - 1
          const timestamp = ev.ts
            ? new Date(ev.ts).toLocaleTimeString('pt-BR', { hour12: false })
            : ''
          return (
            <div key={ev.id || i} style={{
              display: 'flex', alignItems: 'flex-start', gap: SPACE.md,
              fontSize: FONT.sm, lineHeight: '18px',
              color: NIVEL_COR[ev.nivel] || C.muted,
            }}>
              <span style={{ color: C.subtle, flexShrink: 0, userSelect: 'none' }}>
                {timestamp}
              </span>
              <span style={{ color: C.subtle, flexShrink: 0, userSelect: 'none' }}>
                {ev.nivel === 'error' ? '✗' : ev.nivel === 'warn' ? '⚠' : ev.nivel === 'success' ? '✓' : '›'}
              </span>
              <span style={{ flex: 1, wordBreak: 'break-word' }}>
                {ev.msg}
                {isLast && isRunning && <span className="sync-cursor" />}
              </span>
            </div>
          )
        })}

        {/* Marcador de conclusão no terminal */}
        {!isRunning && status && status !== 'idle' && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: `1px solid ${C.border}`,
            fontSize: FONT.xs, color: finalMeta.cor, fontWeight: 700,
            letterSpacing: '.05em', textTransform: 'uppercase',
          }}>
            {status === 'success'      && (modo === 'commit' ? '─── COMMIT REALIZADO COM SUCESSO ───' : '─── PROCESSO CONCLUÍDO COM SUCESSO ───')}
            {status === 'error'        && '─── PROCESSO ENCERRADO COM ERRO ───'}
            {status === 'inconsistent' && '─── INCONSISTÊNCIA DETECTADA ───'}
          </div>
        )}
      </div>

      {/* ── Card de inconsistência (sync) ──────────────────── */}
      {status === 'inconsistent' && relatorio && modo === 'sync' && (
        <div style={{
          marginTop: 12,
          background: '#f59e0b10', border: '1px solid #f59e0b40',
          borderRadius: 9, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: 6 }}>
            <AdminIcon name="warn" size={13} style={{ color: C.amber }} />
            <span style={{ fontSize: FONT.base, fontWeight: 700, color: C.amber }}>
              SYNC_INCONSISTENT
            </span>
          </div>
          <p style={{ fontSize: FONT.sm, color: C.text, margin: 0, lineHeight: '16px' }}>
            {relatorio.msg}
          </p>
          {relatorio.relatorio?.inconsistencia && (
            <p style={{ fontSize: FONT.xs, color: C.muted, margin: '6px 0 0', fontFamily: 'monospace' }}>
              {relatorio.relatorio.inconsistencia}
            </p>
          )}
        </div>
      )}

      {/* ── Card de commit bem-sucedido ─────────────────────── */}
      {status === 'success' && modo === 'commit' && relatorio?.relatorio?.commitSha && (
        <div style={{
          marginTop: 12,
          background: '#22c55e10', border: '1px solid #22c55e30',
          borderRadius: 9, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.md }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
              <AdminIcon name="checkLg" size={13} style={{ color: C.greenSolid }} />
              <span style={{ fontSize: FONT.base, fontWeight: 700, color: C.greenSolid }}>
                Commit {relatorio.relatorio.commitShaCurto}
              </span>
              <span style={{ fontSize: FONT.sm, color: C.muted }}>
                → {relatorio.relatorio.branch}
              </span>
            </div>
            <a
              href={relatorio.relatorio.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: FONT.sm, fontWeight: 600, color: C.greenSolid,
                background: '#22c55e18', border: '1px solid #22c55e40',
                borderRadius: RADIUS.sm, padding: '4px 10px',
                textDecoration: 'none',
              }}
            >
              <AdminIcon name="externalLink" size={11} />
              Ver no GitHub
            </a>
          </div>
          {relatorio.relatorio.mensagem && (
            <p style={{
              fontSize: FONT.sm, color: C.muted, margin: '8px 0 0',
              fontFamily: 'monospace', wordBreak: 'break-word',
            }}>
              "{relatorio.relatorio.mensagem}"
            </p>
          )}
          {/* Resumo numérico */}
          <div style={{ display: 'flex', gap: SPACE.sm, marginTop: 10, flexWrap: 'wrap' }}>
            {relatorio.relatorio.totalArquivos > 0 && (
              <span style={{
                fontSize: FONT.xs, fontWeight: 700,
                background: '#22c55e18', color: C.greenSolid,
                borderRadius: 20, padding: '2px 9px',
              }}>
                {relatorio.relatorio.totalArquivos} enviados
              </span>
            )}
            {relatorio.relatorio.ignorados > 0 && (
              <span style={{
                fontSize: FONT.xs, fontWeight: 700,
                background: `${C.amber}18`, color: C.amber,
                borderRadius: 20, padding: '2px 9px',
              }}>
                {relatorio.relatorio.ignorados} ignorados
              </span>
            )}
            {relatorio.relatorio.arquivosErro?.length > 0 && (
              <span style={{
                fontSize: FONT.xs, fontWeight: 700,
                background: `${C.red}18`, color: C.red,
                borderRadius: 20, padding: '2px 9px',
              }}>
                {relatorio.relatorio.arquivosErro.length} com falha
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Painel de arquivos enviados/falhados ────────────── */}
      {arquivos.length > 0 && (
        <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden' }}>
          <button
            onClick={() => setMostrarArquivos(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: C.surf2, border: 'none',
              padding: '9px 14px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AdminIcon name="index" size={12} style={{ color: C.muted }} />
              <span style={{ fontSize: FONT.sm, fontWeight: 600, color: C.text }}>
                {modo === 'commit' ? 'Arquivos do commit' : 'Arquivos afetados'}
              </span>
              {enviados.length > 0 && (
                <span style={{
                  fontSize: FONT.xs, fontWeight: 700,
                  background: '#22c55e20', color: '#16a34a',
                  borderRadius: RADIUS.lg, padding: '1px 7px',
                }}>
                  {enviados.length} enviados
                </span>
              )}
              {falhados.length > 0 && (
                <span style={{
                  fontSize: FONT.xs, fontWeight: 700,
                  background: `${C.red}20`, color: C.red,
                  borderRadius: RADIUS.lg, padding: '1px 7px',
                }}>
                  {falhados.length} falha{falhados.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <AdminIcon name={mostrarArquivos ? 'chevUp' : 'chevDown'} size={12} style={{ color: C.muted }} />
          </button>

          {mostrarArquivos && (
            <div style={{ background: C.bg }}>
              {enviados.length > 0 && (
                <div style={{ padding: '8px 14px 6px' }}>
                  <div style={{
                    fontSize: FONT.xs, fontWeight: 700, color: '#16a34a',
                    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
                  }}>
                    ✓ Enviados com sucesso ({enviados.length})
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                    {enviados.map((arq, i) => (
                      <div key={i} style={{
                        fontSize: FONT.xs, color: C.muted, lineHeight: '18px',
                        fontFamily: 'monospace', padding: '1px 0',
                        borderBottom: i < enviados.length - 1 ? `1px solid ${C.border}22` : 'none',
                      }}>
                        {arq}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {falhados.length > 0 && (
                <div style={{
                  padding: '8px 14px 10px',
                  borderTop: enviados.length > 0 ? `1px solid ${C.border}` : 'none',
                  background: `${C.red}06`,
                }}>
                  <div style={{
                    fontSize: FONT.xs, fontWeight: 700, color: C.red,
                    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
                  }}>
                    ✗ Não enviados ({falhados.length})
                  </div>
                  <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                    {falhados.map((arq, i) => (
                      <div key={i} style={{
                        fontSize: FONT.xs, color: C.red, lineHeight: '18px',
                        fontFamily: 'monospace', padding: '1px 0',
                      }}>
                        {arq}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Relatório numérico — sync ───────────────────────── */}
      {modo === 'sync' && (status === 'success' || status === 'error' || status === 'inconsistent') && relatorio?.relatorio && (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SPACE.sm }}>
          {relatorio.relatorio.totalArquivos !== undefined && (
            <div style={{
              background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '8px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                {relatorio.relatorio.totalArquivos}
              </div>
              <div style={{ fontSize: FONT.xs, color: C.muted }}>arquivos</div>
            </div>
          )}
          {relatorio.relatorio.tamanhoZipBytes !== undefined && (
            <div style={{
              background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '8px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                {(relatorio.relatorio.tamanhoZipBytes / 1024).toFixed(0)}
                <span style={{ fontSize: FONT.base }}> KB</span>
              </div>
              <div style={{ fontSize: FONT.xs, color: C.muted }}>baixados</div>
            </div>
          )}
          {relatorio.relatorio.erros?.length > 0 && (
            <div style={{
              gridColumn: 'span 2',
              background: `${C.amber}10`, border: `1px solid ${C.amber}30`,
              borderRadius: 7, padding: '7px 12px',
              fontSize: FONT.xs, color: C.amber,
            }}>
              ⚠ {relatorio.relatorio.erros.length} entrada(s) bloqueada(s) por segurança
            </div>
          )}
        </div>
      )}

      {/* ── Ações pós-processo ─────────────────────────────── */}
      {!isRunning && (
        <div style={{ display: 'flex', gap: SPACE.md, marginTop: 14, flexWrap: 'wrap' }}>
          {(status === 'error' || status === 'inconsistent') && (
            <button
              onClick={onReiniciar}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
                fontSize: FONT.base, fontWeight: 600, color: '#fff',
                background: C.blue, border: `1px solid ${C.blue}`,
                borderRadius: 7, padding: '9px 14px', cursor: 'pointer',
              }}
            >
              <AdminIcon name="refresh" size={13} />
              Tentar novamente
            </button>
          )}

          {status === 'success' && modo === 'sync' && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
              fontSize: FONT.base, fontWeight: 600, color: C.greenSolid,
              background: '#22c55e12', border: '1px solid #22c55e30',
              borderRadius: 7, padding: '9px 14px',
            }}>
              <AdminIcon name="checkLg" size={13} style={{ color: C.greenSolid }} />
              Projeto sincronizado com sucesso!
            </div>
          )}

          {/* Baixar log */}
          {eventosLog.length > 0 && (
            <button
              onClick={baixarLog}
              title="Baixar log completo (.txt)"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: FONT.sm, fontWeight: 600, color: C.muted,
                background: C.surf2, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: '9px 12px', cursor: 'pointer',
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Log
            </button>
          )}

          <button
            onClick={onFechar}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
              fontSize: FONT.base, fontWeight: 600, color: C.text,
              background: C.surf2, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '9px 14px', cursor: 'pointer',
              flex: status === 'success' ? '0 0 auto' : 1,
            }}
          >
            {status === 'success' ? 'Fechar' : 'Cancelar'}
          </button>
        </div>
      )}
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
════════════════════════════════════════════════════════════════ */
export default function ProjetoSyncModal({ projeto, onClose, onSynced, fonte = 'local' }) {
  /* ── Hook de status de sync (Sprint 7 — inalterado) ────────── */
  const {
    syncStatus, loadingSync, erroSync, carregarStatus,
    vincular,   desvincular, loadingLink, erroLink,
  } = useProjetosSync(projeto.nome)

  /* ── Hook de stream SSE de sync (Sprint 8) ─────────────────── */
  const stream = useProjetosSyncStream(projeto.nome)

  /* ── Hook de stream SSE de commit (Sprint 9) ───────────────── */
  const commitStream = useProjetosCommitStream(projeto.nome)

  /* ── Tela ───────────────────────────────────────────────────── */
  const [tela, setTela] = useState('status')

  /* ── Lista de repos GitHub ──────────────────────────────────── */
  const [repos,           setRepos]           = useState([])
  const [loadingRepos,    setLoadingRepos]    = useState(false)
  const [erroRepos,       setErroRepos]       = useState(null)
  const [busca,           setBusca]           = useState('')
  const [repoSelecionado, setRepoSelecionado] = useState(null)

  /* ── Confirmação de desvincular ─────────────────────────────── */
  const [confirmarDesv, setConfirmarDesv] = useState(false)

  /* ── Estado do formulário de commit ─────────────────────────── */
  const [commitMsg,       setCommitMsg]       = useState('')
  const [commitBranch,    setCommitBranch]    = useState('')
  const [commitAutor,     setCommitAutor]     = useState('')
  const [commitDestPath,  setCommitDestPath]  = useState('')

  /* Carrega status ao abrir */
  useEffect(() => { carregarStatus() }, [carregarStatus])

  /* Carrega repos ao entrar na tela de vincular */
  useEffect(() => {
    if (tela !== 'vincular') return
    setLoadingRepos(true)
    setErroRepos(null)
    githubService.repos({ per_page: 100, sort: 'updated' })
      .then(data => setRepos(data.repos || []))
      .catch(e   => setErroRepos(e.message || 'Erro ao carregar repositórios'))
      .finally(() => setLoadingRepos(false))
  }, [tela])

  /* Após sync concluído com sucesso, notifica o pai */
  useEffect(() => {
    if (stream.status === 'success' && onSynced) {
      onSynced()
    }
  }, [stream.status, onSynced])

  /* Filtro local de repos */
  const reposFiltrados = useMemo(() => {
    if (!busca.trim()) return repos
    const q = busca.toLowerCase()
    return repos.filter(r =>
      r.nomeCompleto.toLowerCase().includes(q) ||
      (r.descricao || '').toLowerCase().includes(q)
    )
  }, [repos, busca])

  /* ── Handlers ──────────────────────────────────────────────── */

  async function handleVincular() {
    if (!repoSelecionado) return
    const [owner, repo] = repoSelecionado.nomeCompleto.split('/')
    const ok = await vincular(owner, repo)
    if (ok) setTela('status')
  }

  async function handleDesvincular() {
    await desvincular()
    setConfirmarDesv(false)
  }

  function handleIniciarSync() {
    stream.resetar()
    setTela('sincronizando')
    setTimeout(() => stream.iniciarSync(), 100)
  }

  function handleReiniciarSync() {
    stream.resetar()
    setTimeout(() => stream.iniciarSync(), 100)
  }

  function handleAbrirCommit() {
    commitStream.resetar()
    const agora = new Date()
    const data = agora.toLocaleDateString('pt-BR')
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    setCommitMsg(`Update ${projeto.nome} — ${data} ${hora}`)
    setCommitBranch('')
    setCommitAutor('')
    // GridFS: sugere pasta = nome do projeto como default
    setCommitDestPath(fonte === 'gridfs' ? projeto.nome : '')
    setTela('commit')
  }

  function handleIniciarCommit() {
    if (!commitMsg.trim()) return
    commitStream.iniciarCommit({
      message:  commitMsg.trim(),
      branch:   commitBranch.trim() || undefined,
      autor:    commitAutor.trim()  || undefined,
      destPath: commitDestPath.trim() || undefined,
      fonte:    fonte !== 'local' ? fonte : undefined,
    })
  }

  function handleReiniciarCommit() {
    commitStream.resetar()
    // Volta ao formulário para o usuário poder alterar a mensagem se quiser
  }

  /* ── Fechar: bloqueia se qualquer stream em andamento ──────── */
  function handleTentarFechar() {
    if (stream.status === 'running')       return
    if (commitStream.status === 'running') return
    onClose()
  }

  /* ── Flag de "ao vivo" no header ───────────────────────────── */
  const aoVivo =
    (tela === 'sincronizando' && stream.status === 'running') ||
    (tela === 'commit'        && commitStream.status === 'running')

  /* ── Flag de stream ativo (bloqueia fechar/voltar) ─────────── */
  const streamAtivo =
    stream.status === 'running' ||
    commitStream.status === 'running'

  /* ── Ícone GitHub ──────────────────────────────────────────── */
  const GitHubIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#6e40c9">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )

  /* ── Título do modal por tela ──────────────────────────────── */
  const tituloModal =
    tela === 'vincular'      ? 'Vincular ao GitHub'          :
    tela === 'sincronizando' ? 'Sincronização em andamento'  :
    tela === 'commit'        ? 'Commit & Push'               :
    'Sincronização GitHub'

  /* ── Overlay e container ───────────────────────────────────── */
  return (
    <div
      onClick={e => e.target === e.currentTarget && handleTentarFechar()}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'20px',
      }}
    >
      <div style={{
        background:C.surface, border:`1px solid ${C.border}`,
        borderRadius:RADIUS.xl2, width:'100%', maxWidth:580,
        maxHeight:'92vh', display:'flex', flexDirection:'column',
        overflow:'hidden',
        boxShadow:'0 25px 60px rgba(0,0,0,.5)',
      }}>

        {/* ── Cabeçalho ────────────────────────────────────────── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'15px 20px', borderBottom:`1px solid ${C.border}`, flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:SPACE.lg - 2 }}>
            <GitHubIcon size={17} />
            <div>
              <div style={{ fontSize:FONT.md, fontWeight:700, color:C.text }}>
                {tituloModal}
              </div>
              <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:1 }}>
                {projeto.nome}
                {aoVivo && (
                  <span style={{ color:C.blue, marginLeft:6 }}>● ao vivo</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:SPACE.sm }}>
            {/* Botão Voltar */}
            {tela !== 'status' && !streamAtivo && (
              <button
                onClick={() => {
                  stream.resetar()
                  commitStream.resetar()
                  setTela('status')
                  carregarStatus()
                }}
                style={{
                  display:'flex', alignItems:'center', gap:5,
                  fontSize:FONT.sm, color:C.muted,
                  background:'none', border:`1px solid ${C.border}`,
                  borderRadius:RADIUS.sm, padding:'5px 10px', cursor:'pointer',
                }}
              >
                <AdminIcon name="chevL" size={11} />
                Voltar
              </button>
            )}

            {/* Botão fechar */}
            <button
              onClick={handleTentarFechar}
              disabled={streamAtivo}
              title={streamAtivo ? 'Aguarde o processo terminar' : 'Fechar'}
              style={{
                background:'none', border:'none',
                cursor: streamAtivo ? 'not-allowed' : 'pointer',
                color: streamAtivo ? C.border : C.muted,
                padding:4, borderRadius:RADIUS.xs, transition:'color .15s',
              }}
            >
              <AdminIcon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* ── Corpo ───────────────────────────────────────────── */}
        <div style={{ overflowY:'auto', flex:1, padding:'18px 20px' }}>

          {/* ════ TELA: SINCRONIZANDO (narração SSE — pull) ════ */}
          {tela === 'sincronizando' && (
            <PainelNarracao
              stream={stream}
              nomeProjeto={projeto.nome}
              onReiniciar={handleReiniciarSync}
              onFechar={handleTentarFechar}
              modo="sync"
              statusMeta={STATUS_SYNC_META}
            />
          )}

          {/* ════ TELA: COMMIT (formulário + narração SSE — push) ════ */}
          {tela === 'commit' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Formulário — visível enquanto não há stream rodando/concluído */}
              {commitStream.status === 'idle' && (
                <>
                  {/* Info do repositório vinculado */}
                  {syncStatus?.vinculado && (
                    <div style={{
                      display:'flex', alignItems:'center', gap:SPACE.md,
                      background:C.surf2, border:`1px solid ${C.border}`,
                      borderRadius:RADIUS.md, padding:'9px 12px',
                    }}>
                      <GitHubIcon size={12} />
                      <span style={{ fontSize:FONT.base, fontWeight:600, color:C.text }}>
                        {syncStatus.nomeCompleto || `${syncStatus.owner}/${syncStatus.repo}`}
                      </span>
                      <span style={{ fontSize:FONT.sm, color:C.muted }}>
                        → branch:{' '}
                        <code style={{ fontFamily:'monospace', fontSize:FONT.xs }}>
                          {commitBranch || syncStatus.branch || 'main'}
                        </code>
                      </span>
                    </div>
                  )}

                  {/* Aviso sobre fonte GridFS */}
                  {fonte === 'gridfs' && (
                    <div style={{
                      display:'flex', alignItems:'flex-start', gap:SPACE.md,
                      background:`#22c55e10`, border:`1px solid #22c55e30`,
                      borderRadius:RADIUS.md, padding:'10px 12px',
                    }}>
                      <span style={{ fontSize:13, flexShrink:0 }}>🗄️</span>
                      <span style={{ fontSize:FONT.sm, color:'#16a34a', lineHeight:'16px' }}>
                        Os arquivos serão lidos direto do <strong>MongoDB GridFS</strong> e enviados ao GitHub.
                        Configure a <strong>Pasta de destino</strong> abaixo para definir onde ficarão no repositório.
                      </span>
                    </div>
                  )}

                  {/* Aviso sobre o comportamento do commit (local) */}
                  {fonte !== 'gridfs' && (
                  <div style={{
                    display:'flex', alignItems:'flex-start', gap:SPACE.md,
                    background:`${C.amber}10`, border:`1px solid ${C.amber}30`,
                    borderRadius:RADIUS.md, padding:'10px 12px',
                  }}>
                    <AdminIcon name="warn" size={13} style={{ color:C.amber, flexShrink:0, marginTop:1 }} />
                    <span style={{ fontSize:FONT.sm, color:C.amber, lineHeight:'16px' }}>
                      Esta operação envia <strong>todos os arquivos locais</strong> do projeto para o
                      GitHub usando a Git Data API. As pastas{' '}
                      <code style={{ fontFamily:'monospace', fontSize:FONT.xs }}>node_modules</code>,{' '}
                      <code style={{ fontFamily:'monospace', fontSize:FONT.xs }}>dist</code>,{' '}
                      <code style={{ fontFamily:'monospace', fontSize:FONT.xs }}>.env</code> e similares
                      são excluídas automaticamente.
                    </span>
                  </div>
                  )}

                  {/* Mensagem do commit */}
                  <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm }}>
                    <label style={{ fontSize:FONT.sm, fontWeight:700, color:C.muted, letterSpacing:'.04em' }}>
                      MENSAGEM DO COMMIT *
                    </label>
                    <textarea
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value.slice(0, 4096))}
                      placeholder="feat: descrição das mudanças"
                      rows={3}
                      style={{
                        width:'100%', boxSizing:'border-box',
                        background:C.surf2, border:`1px solid ${commitMsg.trim() ? C.blue : C.border}`,
                        borderRadius:7, padding:'9px 12px',
                        fontSize:FONT.base, color:C.text,
                        fontFamily:'monospace',
                        resize:'vertical', outline:'none',
                        transition:'border-color .15s',
                      }}
                    />
                    <div style={{ fontSize:FONT.xs, color:C.muted, textAlign:'right' }}>
                      {commitMsg.length}/4096
                    </div>
                  </div>

                  {/* Pasta de destino no GitHub */}
                  <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm }}>
                    <label style={{ fontSize:FONT.sm, fontWeight:700, color:C.muted, letterSpacing:'.04em', display:'flex', alignItems:'center', gap:6 }}>
                      📁 Pasta de destino no GitHub
                      {fonte === 'gridfs'
                        ? <span style={{ fontWeight:500, color:'#16a34a', fontSize:FONT.xs }}>(recomendado para GridFS)</span>
                        : <span style={{ fontWeight:400, color:C.muted, fontSize:FONT.xs }}>(opcional)</span>}
                    </label>
                    <div style={{ position:'relative' }}>
                      <input
                        type="text"
                        value={commitDestPath}
                        onChange={e => setCommitDestPath(e.target.value.replace(/^\/|\/$/g, '').replace(/\s/g, '-'))}
                        placeholder={fonte === 'gridfs' ? projeto.nome : 'ex: projetos/meu-site'}
                        style={{
                          width:'100%', boxSizing:'border-box',
                          background:C.surf2,
                          border:`1px solid ${commitDestPath.trim() ? '#3b82f6' : C.border}`,
                          borderRadius:7, padding:'9px 12px 9px 34px',
                          fontSize:FONT.base, color:C.text, outline:'none',
                          fontFamily:'monospace', transition:'border-color .2s',
                        }}
                      />
                      <span style={{
                        position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
                        color:C.muted, fontSize:13, pointerEvents:'none',
                      }}>
                        /
                      </span>
                    </div>
                    <div style={{ fontSize:FONT.xs, color: commitDestPath.trim() ? '#3b82f6' : C.muted, lineHeight:'15px' }}>
                      {commitDestPath.trim()
                        ? <>
                            Os arquivos irão para{' '}
                            <code style={{ background:`#3b82f618`, color:'#3b82f6', padding:'1px 5px', borderRadius:3, fontFamily:'monospace' }}>
                              {commitDestPath}/
                            </code>
                            {' '}no repositório{syncStatus?.nomeCompleto ? ` ${syncStatus.nomeCompleto}` : ''}.
                          </>
                        : 'Deixe vazio para enviar direto à raiz do repositório. Use barras para subpastas: projetos/meu-site'}
                    </div>
                  </div>

                  {/* Branch de destino */}
                  <div style={{ display:'flex', gap:SPACE.md }}>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:SPACE.sm }}>
                      <label style={{ fontSize:FONT.sm, fontWeight:700, color:C.muted, letterSpacing:'.04em', display:'flex', alignItems:'center', gap:6 }}>
                        🌿 Branch de destino
                        <span style={{ fontWeight:400, color:C.muted, fontSize:FONT.xs }}>(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={commitBranch}
                        onChange={e => setCommitBranch(e.target.value.replace(/\s/g, ''))}
                        placeholder={syncStatus?.branch || 'main'}
                        style={{
                          width:'100%', boxSizing:'border-box',
                          background:C.surf2, border:`1px solid ${C.border}`,
                          borderRadius:7, padding:'9px 12px',
                          fontSize:FONT.base, color:C.text, outline:'none',
                          fontFamily:'monospace',
                        }}
                      />
                      <div style={{ fontSize:FONT.xs, color:C.muted }}>
                        Vazio = branch atual{syncStatus?.branch ? ` (${syncStatus.branch})` : ' (main)'}
                      </div>
                    </div>

                    {/* Atalho rápido de branches */}
                    {syncStatus?.branch && (
                      <div style={{ display:'flex', flexDirection:'column', gap:SPACE.xs, justifyContent:'flex-end', paddingBottom:18 }}>
                        {['main', 'develop', syncStatus.branch].filter((b, i, a) => a.indexOf(b) === i).map(b => (
                          <button key={b} onClick={() => setCommitBranch(b)}
                            style={{
                              padding:'3px 8px', borderRadius:4, cursor:'pointer',
                              fontSize:10, fontFamily:'monospace', fontWeight: commitBranch === b ? 700 : 400,
                              background: commitBranch === b ? `#3b82f618` : C.surface2,
                              border:`1px solid ${commitBranch === b ? '#3b82f6' : C.border}`,
                              color: commitBranch === b ? '#3b82f6' : C.muted,
                            }}>
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Autor */}
                  <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm }}>
                    <label style={{ fontSize:FONT.sm, fontWeight:700, color:C.muted, letterSpacing:'.04em', display:'flex', alignItems:'center', gap:6 }}>
                      👤 Autor do commit
                      <span style={{ fontWeight:400, color:C.muted, fontSize:FONT.xs }}>(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={commitAutor}
                      onChange={e => setCommitAutor(e.target.value)}
                      placeholder="Seu Nome <seu@email.com>"
                      style={{
                        width:'100%', boxSizing:'border-box',
                        background:C.surf2, border:`1px solid ${C.border}`,
                        borderRadius:7, padding:'9px 12px',
                        fontSize:FONT.base, color:C.text, outline:'none',
                        fontFamily:'monospace',
                      }}
                    />
                    <div style={{ fontSize:FONT.xs, color:C.muted }}>
                      Se vazio, usa as variáveis <code style={{ fontFamily:'monospace', background:C.surface2, padding:'0 4px', borderRadius:3 }}>GIT_AUTOR_NOME</code> e <code style={{ fontFamily:'monospace', background:C.surface2, padding:'0 4px', borderRadius:3 }}>GIT_AUTOR_EMAIL</code> do servidor.
                    </div>
                  </div>

                  {/* Botão de commit */}
                  <button
                    onClick={handleIniciarCommit}
                    disabled={!commitMsg.trim()}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'center', gap:SPACE.md,
                      width:'100%', padding:'11px 16px',
                      fontSize:FONT.md, fontWeight:700, color:'#fff',
                      background: commitMsg.trim()
                        ? `linear-gradient(135deg, #16a34a, #15803d)`
                        : C.surf2,
                      border: `1px solid ${commitMsg.trim() ? C.greenSolid : C.border}`,
                      borderRadius:9, cursor: commitMsg.trim() ? 'pointer' : 'not-allowed',
                      opacity: commitMsg.trim() ? 1 : .5,
                      transition:'all .15s',
                    }}
                  >
                    <AdminIcon name="cloudUp" size={14} />
                    Fazer Commit & Push
                  </button>
                </>
              )}

              {/* Painel de narração do commit — quando stream ativo ou concluído */}
              {commitStream.status !== 'idle' && (
                <PainelNarracao
                  stream={commitStream}
                  nomeProjeto={projeto.nome}
                  onReiniciar={handleReiniciarCommit}
                  onFechar={handleTentarFechar}
                  modo="commit"
                  statusMeta={STATUS_COMMIT_META}
                />
              )}
            </div>
          )}

          {/* ════ TELA: STATUS ══════════════════════════════════ */}
          {tela === 'status' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Carregando */}
              {loadingSync && (
                <div style={{ textAlign:'center', padding:'30px 0', color:C.muted, fontSize:FONT.base }}>
                  <AdminIcon name="spinSm" size={16} />
                  <span style={{ marginLeft:8 }}>Verificando status…</span>
                </div>
              )}

              {/* Erro */}
              {erroSync && !loadingSync && (
                <div style={{
                  background:`${C.red}10`, border:`1px solid ${C.red}30`,
                  borderRadius:RADIUS.md, padding:'12px 14px', fontSize:FONT.base, color:C.red,
                }}>
                  {erroSync}
                  <button
                    onClick={carregarStatus}
                    style={{ marginLeft:12, fontSize:FONT.sm, color:C.blue, background:'none', border:'none', cursor:'pointer' }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* Não vinculado */}
              {!loadingSync && syncStatus && !syncStatus.vinculado && (
                <div style={{
                  textAlign:'center', padding:'30px 20px',
                  background:C.surf2, borderRadius:RADIUS.lg, border:`1px solid ${C.border}`,
                }}>
                  <div style={{ color:C.muted, marginBottom:SPACE.lg }}>
                    <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
                    </svg>
                  </div>
                  <div style={{ fontSize:FONT.md, fontWeight:700, color:C.text, marginBottom:6 }}>
                    Sem repositório vinculado
                  </div>
                  <div style={{ fontSize:FONT.sm, color:C.muted, marginBottom:SPACE.xl }}>
                    Vincule este projeto a um repositório GitHub para habilitar a sincronização e o commit.
                  </div>
                  <button
                    onClick={() => setTela('vincular')}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:SPACE.sm,
                      fontSize:FONT.base, fontWeight:600, color:'#fff',
                      background:C.blue, border:'none', borderRadius:7,
                      padding:'8px 16px', cursor:'pointer',
                    }}
                  >
                    <AdminIcon name="plus" size={12} />
                    Vincular repositório
                  </button>
                </div>
              )}

              {/* Vinculado */}
              {!loadingSync && syncStatus?.vinculado && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                  {/* Card do repositório */}
                  <div style={{
                    background:C.surf2, borderRadius:RADIUS.lg, border:`1px solid ${C.border}`,
                    padding:'14px 16px',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:SPACE.md }}>
                        <GitHubIcon size={13} />
                        <a
                          href={syncStatus.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize:FONT.md, fontWeight:700, color:C.blue, textDecoration:'none' }}
                        >
                          {syncStatus.nomeCompleto || `${syncStatus.owner}/${syncStatus.repo}`}
                        </a>
                      </div>
                      {syncStatus.statusSync && (
                        <SyncBadge statusSync={syncStatus.statusSync} />
                      )}
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      <InfoRow label="Branch padrão"    value={syncStatus.branch} />
                      <InfoRow label="Último push"      value={syncStatus.dataPushGitHub ? relTime(syncStatus.dataPushGitHub) : '—'} />
                      <InfoRow label="Local modificado" value={syncStatus.dataLocalModificacao ? relTime(syncStatus.dataLocalModificacao) : '—'} />
                      <InfoRow label="Última sync"      value={syncStatus.ultimaSincronizacao ? relTime(syncStatus.ultimaSincronizacao) : 'Nunca'} />
                      {syncStatus.vinculadoEm && (
                        <InfoRow label="Vinculado"      value={relTime(syncStatus.vinculadoEm)} />
                      )}
                    </div>
                  </div>

                  {/* Aviso erro do GitHub */}
                  {syncStatus.erro && (
                    <div style={{
                      background:`${C.amber}10`, border:`1px solid ${C.amber}30`,
                      borderRadius:RADIUS.md, padding:'10px 12px', fontSize:FONT.sm, color:C.amber,
                    }}>
                      ⚠ Não foi possível verificar o GitHub: {syncStatus.erro}
                    </div>
                  )}

                  {/* Aviso desatualizado */}
                  {syncStatus.statusSync === 'desatualizado' && !syncStatus.erro && (
                    <div style={{
                      background:`${C.amber}10`, border:`1px solid ${C.amber}30`,
                      borderRadius:RADIUS.md, padding:'10px 12px', fontSize:FONT.sm, color:C.amber,
                    }}>
                      O repositório no GitHub possui commits mais recentes que o projeto local.
                      Clique em <strong>Sincronizar agora</strong> para atualizar.
                    </div>
                  )}

                  {/* ── Botão SINCRONIZAR AGORA (pull: GitHub → local) ── */}
                  <button
                    onClick={handleIniciarSync}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'center', gap:SPACE.md,
                      width:'100%', padding:'11px 16px',
                      fontSize:FONT.md, fontWeight:700, color:'#fff',
                      background:`linear-gradient(135deg, ${C.blue}, #1d4ed8)`,
                      border:'none', borderRadius:9, cursor:'pointer',
                      boxShadow:`0 4px 14px ${C.blue}40`,
                      transition:'opacity .15s',
                    }}
                  >
                    <AdminIcon name="cloudDown" size={14} />
                    Sincronizar agora
                    <span style={{ fontSize:FONT.xs, opacity:.8, fontWeight:400 }}>
                      GitHub → local
                    </span>
                  </button>

                  {/* ── Botão COMMIT & PUSH (push: local → GitHub) ────── */}
                  <button
                    onClick={handleAbrirCommit}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'center', gap:SPACE.md,
                      width:'100%', padding:'11px 16px',
                      fontSize:FONT.md, fontWeight:700, color:'#fff',
                      background:`linear-gradient(135deg, #16a34a, #15803d)`,
                      border:'none', borderRadius:9, cursor:'pointer',
                      boxShadow:'0 4px 14px #16a34a40',
                      transition:'opacity .15s',
                    }}
                  >
                    <AdminIcon name="cloudUp" size={14} />
                    Commit & Push
                    <span style={{ fontSize:FONT.xs, opacity:.8, fontWeight:400 }}>
                      local → GitHub
                    </span>
                  </button>

                  {/* Ações secundárias */}
                  <div style={{ display:'flex', gap:SPACE.md }}>
                    <button
                      onClick={() => setTela('vincular')}
                      style={{
                        flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:SPACE.sm,
                        fontSize:FONT.sm, fontWeight:600, color:C.text,
                        background:C.surf2, border:`1px solid ${C.border}`,
                        borderRadius:7, padding:'8px 12px', cursor:'pointer',
                      }}
                    >
                      <AdminIcon name="refresh" size={11} />
                      Trocar repo
                    </button>
                    <button
                      onClick={carregarStatus}
                      disabled={loadingSync}
                      title="Atualizar status"
                      style={{
                        display:'flex', alignItems:'center', gap:SPACE.xs,
                        fontSize:FONT.sm, fontWeight:600, color:C.muted,
                        background:'none', border:`1px solid ${C.border}`,
                        borderRadius:7, padding:'8px 11px', cursor:'pointer',
                      }}
                    >
                      <AdminIcon name={loadingSync ? 'spinSm' : 'refresh'} size={12} />
                    </button>
                  </div>

                  {/* Desvincular */}
                  {!confirmarDesv ? (
                    <button
                      onClick={() => setConfirmarDesv(true)}
                      style={{
                        background:'none', border:'none', cursor:'pointer',
                        fontSize:FONT.sm, color:C.muted, textAlign:'left',
                        textDecoration:'underline', padding:'2px 0',
                      }}
                    >
                      Desvincular repositório
                    </button>
                  ) : (
                    <div style={{
                      background:`${C.red}08`, border:`1px solid ${C.red}25`,
                      borderRadius:RADIUS.md, padding:'10px 12px',
                      display:'flex', alignItems:'center', justifyContent:'space-between', gap:SPACE.md,
                    }}>
                      <span style={{ fontSize:FONT.sm, color:C.text }}>
                        Remover vínculo com <strong>{syncStatus.nomeCompleto}</strong>?
                      </span>
                      <div style={{ display:'flex', gap:SPACE.sm, flexShrink:0 }}>
                        <button
                          onClick={() => setConfirmarDesv(false)}
                          style={{
                            fontSize:FONT.sm, color:C.muted, background:'none',
                            border:`1px solid ${C.border}`, borderRadius:5,
                            padding:'4px 10px', cursor:'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleDesvincular}
                          disabled={loadingLink}
                          style={{
                            fontSize:FONT.sm, fontWeight:600, color:'#fff',
                            background:C.red, border:'none',
                            borderRadius:5, padding:'4px 10px', cursor:'pointer',
                          }}
                        >
                          {loadingLink ? 'Removendo…' : 'Remover'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════ TELA: VINCULAR ════════════════════════════════ */}
          {tela === 'vincular' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontSize:FONT.base, color:C.muted }}>
                Selecione o repositório GitHub que corresponde ao projeto{' '}
                <strong style={{ color:C.text }}>{projeto.nome}</strong>.
              </div>

              <input
                type="text"
                placeholder="Buscar repositório…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{
                  width:'100%', boxSizing:'border-box',
                  background:C.surf2, border:`1px solid ${C.border}`,
                  borderRadius:7, padding:'8px 12px',
                  fontSize:FONT.base, color:C.text, outline:'none',
                }}
              />

              <div style={{
                display:'flex', flexDirection:'column', gap:SPACE.sm,
                maxHeight:300, overflowY:'auto',
              }}>
                {loadingRepos && (
                  <div style={{ textAlign:'center', padding:'20px', color:C.muted, fontSize:FONT.base }}>
                    <AdminIcon name="spinSm" size={14} /> Carregando repositórios…
                  </div>
                )}
                {erroRepos && !loadingRepos && (
                  <div style={{ fontSize:FONT.base, color:C.red, padding:'10px 0' }}>{erroRepos}</div>
                )}
                {!loadingRepos && !erroRepos && reposFiltrados.length === 0 && (
                  <div style={{ fontSize:FONT.base, color:C.muted, padding:'10px 0' }}>
                    Nenhum repositório encontrado.
                  </div>
                )}
                {!loadingRepos && reposFiltrados.map(r => (
                  <RepoItem
                    key={r.nomeCompleto}
                    repo={r}
                    selecionado={repoSelecionado}
                    onSelect={setRepoSelecionado}
                  />
                ))}
              </div>

              {erroLink && (
                <div style={{
                  background:`${C.red}10`, border:`1px solid ${C.red}30`,
                  borderRadius:RADIUS.md, padding:'10px 12px', fontSize:FONT.sm, color:C.red,
                }}>
                  {erroLink}
                </div>
              )}

              <div style={{ display:'flex', gap:SPACE.md }}>
                <button
                  onClick={() => setTela('status')}
                  style={{
                    fontSize:FONT.base, fontWeight:600, color:C.text,
                    background:C.surf2, border:`1px solid ${C.border}`,
                    borderRadius:7, padding:'9px 14px', cursor:'pointer',
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={handleVincular}
                  disabled={!repoSelecionado || loadingLink}
                  style={{
                    flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:SPACE.sm,
                    fontSize:FONT.base, fontWeight:600, color:'#fff',
                    background: !repoSelecionado || loadingLink ? C.surf2 : C.blue,
                    border:`1px solid ${!repoSelecionado || loadingLink ? C.border : C.blue}`,
                    borderRadius:7, padding:'9px 14px',
                    cursor: !repoSelecionado || loadingLink ? 'not-allowed' : 'pointer',
                    opacity: !repoSelecionado ? .6 : 1,
                  }}
                >
                  {loadingLink
                    ? <><AdminIcon name="spinSm" size={13} /> Vinculando…</>
                    : <><AdminIcon name="save" size={13} /> Confirmar vínculo</>
                  }
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
