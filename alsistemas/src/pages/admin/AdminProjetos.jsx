/**
 * AdminProjetos.jsx — Módulo Projetos Locais
 *
 * Sprint 3 — ADIÇÃO PURA.
 * Sprint 7 — GitHub Sync: badge de status + botão de sincronização por card.
 *
 * DS Sprint (conformidade total):
 *   - DSPageHeader  → substitui header div inline com título/contador/botão manuais
 *   - DSBtn         → substitui todos os <button> raw com inline styles (7×)
 *   - DSBadge       → substitui StatusBadge com span inline
 *   - DSEmptyState  → substitui empty state manual
 *   - C.surface2    → corrige alias errado C.surf2 (8×)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjetos }                    from '../../modules/projetos/useProjetos.js'
import { useProjetosGridFS }              from '../../hooks/useProjetosGridFS.js'
import { useProjetosR2 }                  from '../../hooks/useProjetosR2.js'
import { projetosService }                from '../../services/domains/projetos.js'
import { BASE_URL }                       from '../../services/domains/http.js'
import { T as C, SPACE, RADIUS, FONT }   from '../../themes/tokens'
import {
  DSPageHeader,
  DSBtn, DSBadge, DSEmptyState,
} from '../../components/admin/ui/DS'
import AdminIcon         from '../../components/admin/ui/AdminIcon'
import ProjetoSyncModal  from './ProjetoSyncModal.jsx'
import toast from 'react-hot-toast'

/* ── Cores por status ────────────────────────────────────────── */
const STATUS_META = {
  ativo:        { label: 'Ativo',        cor: C.greenSolid },
  pausado:      { label: 'Pausado',      cor: C.amber      },
  arquivado:    { label: 'Arquivado',    cor: C.muted      },
  desconhecido: { label: 'Desconhecido', cor: C.subtle     },
}

// ✅ DSBadge substitui <span style={{ fontSize:FONT.xs, fontWeight:700, ... }}> manual
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.desconhecido
  return (
    <DSBadge style={{
      background: `${meta.cor}18`, color: meta.cor,
      border: `1px solid ${meta.cor}30`,
      textTransform: 'uppercase', letterSpacing: '.06em',
    }}>
      {meta.label}
    </DSBadge>
  )
}

/* ── Chips de tecnologia ─────────────────────────────────────── */
const TECH_COR = {
  'Node.js': '#68a063', Python: '#3572a5', Rust: '#dea584',
  Go: '#00add8', Java: '#b07219', PHP: '#4f5d95', Ruby: '#701516',
  Docker: '#2496ed', 'GitHub CI': '#2088ff',
}

function TechChip({ tech }) {
  const cor = TECH_COR[tech] || C.accent
  return (
    <span style={{
      fontSize: FONT.xs, fontWeight: 600, color: C.text,
      background: `${cor}22`, border: `1px solid ${cor}44`,
      borderRadius: RADIUS.xs, padding: '2px 6px',
    }}>
      {tech}
    </span>
  )
}

/* ── Formatador de data ──────────────────────────────────────── */
function relTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1)   return 'hoje'
  if (d < 7)   return `${d}d atrás`
  if (d < 30)  return `${Math.floor(d / 7)}sem atrás`
  if (d < 365) return `${Math.floor(d / 30)}mo atrás`
  return `${Math.floor(d / 365)}a atrás`
}

/* ── Badge de sincronização GitHub ──────────────────────────────
   Carrega o sync-status de forma lazy (apenas ao expandir o card
   ou quando solicitado) para não sobrecarregar a API do GitHub.
──────────────────────────────────────────────────────────────── */
const SYNC_COR = {
  atualizado:    C.greenSolid,
  desatualizado: C.amber,
  desconhecido:  C.subtle,
}
const SYNC_LABEL = {
  atualizado:    'Em sincronia',
  desatualizado: 'Desatualizado',
  desconhecido:  'Sem info',
}

function GitHubSyncBadge({ syncStatus, loading }) {
  if (loading) {
    return (
      <span style={{ fontSize: FONT.xs, color: C.muted, display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
        <AdminIcon name="spinSm" size={10} />
        verificando…
      </span>
    )
  }

  if (!syncStatus) return null

  if (!syncStatus.vinculado) {
    return (
      <span style={{
        fontSize: FONT.xs, fontWeight: 600, color: C.muted,
        border: `1px dashed ${C.border}`, borderRadius: RADIUS.xs,
        padding: '2px 6px',
      }}>
        sem vínculo GitHub
      </span>
    )
  }

  const cor   = SYNC_COR[syncStatus.statusSync]   || SYNC_COR.desconhecido
  const label = SYNC_LABEL[syncStatus.statusSync] || SYNC_LABEL.desconhecido

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: SPACE.xs,
      fontSize: FONT.xs, fontWeight: 700, color: cor,
      background: `${cor}18`, border: `1px solid ${cor}30`,
      borderRadius: RADIUS.xs, padding: '2px 7px',
    }}>
      <svg width={8} height={8} viewBox="0 0 24 24" fill={cor}>
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
      {label}
    </span>
  )
}

/* ── Card de projeto ─────────────────────────────────────────── */
function ProjetoCard({ projeto, onOpenSync }) {
  const [expandido, setExpandido] = useState(false)

  const [syncStatus,    setSyncStatus]    = useState(null)
  const [loadingSync,   setLoadingSync]   = useState(false)
  const [syncCarregado, setSyncCarregado] = useState(false)

  useEffect(() => {
    if (!expandido || syncCarregado) return
    setLoadingSync(true)
    projetosService.syncStatus(projeto.nome)
      .then(data  => { setSyncStatus(data); setSyncCarregado(true) })
      .catch(()   => { setSyncStatus({ vinculado: false }); setSyncCarregado(true) })
      .finally(() => setLoadingSync(false))
  }, [expandido, syncCarregado, projeto.nome])

  function handleSynced() {
    setSyncCarregado(false)
    setSyncStatus(null)
  }

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.lg, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* ── Linha principal ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.md }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>{projeto.nome}</span>
            <StatusBadge status={projeto.status} />
            {expandido && <GitHubSyncBadge syncStatus={syncStatus} loading={loadingSync} />}
          </div>
          <div style={{ fontSize: FONT.sm, color: C.muted, lineHeight: 1.4 }}>
            {projeto.descricao !== '—'
              ? projeto.descricao.length > 120
                ? projeto.descricao.slice(0, 120) + '…'
                : projeto.descricao
              : <span style={{ fontStyle: 'italic' }}>Sem descrição</span>
            }
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexShrink: 0 }}>
          {/* Link GitHub — só quando expandido e vinculado */}
          {expandido && syncStatus?.vinculado && syncStatus?.url && (
            <a
              href={syncStatus.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Abrir ${syncStatus.nomeCompleto || syncStatus.repo} no GitHub`}
              style={{
                background: 'none', border: `1px solid ${C.border}`,
                color: C.muted, padding: '5px 7px', borderRadius: RADIUS.sm,
                display: 'flex', alignItems: 'center', gap: SPACE.xs,
                textDecoration: 'none', transition: 'all .15s',
              }}
            >
              <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              <span style={{ fontSize: 10, fontWeight: 600 }}>GitHub ↗</span>
            </a>
          )}

          {/* ✅ DSBtn substitui <button style={{ background:'none', border:`1px solid ${C.border}`, ... }}> */}
          <DSBtn size="sm" variant="ghost" onClick={() => onOpenSync(projeto)} title="Sincronizar com GitHub">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>GitHub</span>
          </DSBtn>

          {/* ✅ DSBtn substitui <button style={{ background:'none', border:'none', ... }}> */}
          <DSBtn size="icon" variant="ghost" onClick={() => setExpandido(v => !v)}
            title={expandido ? 'Recolher' : 'Ver detalhes'}>
            <AdminIcon name={expandido ? 'chevUp' : 'chevDown'} size={14} />
          </DSBtn>
        </div>
      </div>

      {/* ── Tecnologias + meta ───────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {projeto.tecnologias?.length > 0
            ? projeto.tecnologias.map(t => <TechChip key={t} tech={t} />)
            : <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>stack não detectada</span>
          }
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
          {projeto.package?.versao && (
            <span style={{ fontSize: 10, color: C.muted }}>v{projeto.package.versao}</span>
          )}
          <span style={{ fontSize: 10, color: C.muted }}>{relTime(projeto.ultimaAlteracao)}</span>
        </div>
      </div>

      {/* ── Último commit + link GitHub ──────────────────── */}
      {(projeto.metadados?.ultimoCommitSha || projeto.metadados?.ultimoCommitMensagem) && (() => {
        const sha      = projeto.metadados.ultimoCommitSha
        const shaCurto = sha?.slice(0, 7)
        const msg      = projeto.metadados.ultimoCommitMensagem
        const data     = projeto.metadados.ultimoCommitData
        const branch   = projeto.metadados.ultimoCommitBranch || 'main'
        // Monta URL do repositório a partir dos metadados (disponível sem expandir)
        const ghOwner = projeto.metadados?.githubOwner || syncStatus?.owner
        const ghRepo  = projeto.metadados?.githubRepo  || syncStatus?.repo
        const repoUrl = ghOwner && ghRepo
          ? `https://github.com/${ghOwner}/${ghRepo}`
          : syncStatus?.url || null
        const treeUrl = repoUrl ? `${repoUrl}/tree/${branch}` : null

        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: SPACE.sm, flexWrap: 'wrap',
            padding: '6px 8px', borderRadius: RADIUS.sm,
            background: C.surface2, border: `1px solid ${C.border}`,
          }}>
            {/* Info do commit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
                stroke={C.muted} strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="3"/>
                <line x1="3" y1="12" x2="9" y2="12"/>
                <line x1="15" y1="12" x2="21" y2="12"/>
              </svg>
              <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>Último commit</span>
              {shaCurto && (
                <code style={{
                  fontSize: 10, fontFamily: 'monospace',
                  background: `${C.blue}18`, color: C.blue,
                  padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                }}>{shaCurto}</code>
              )}
              {msg && (
                <span style={{
                  fontSize: 10, color: C.text, fontStyle: 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, minWidth: 0,
                }}>
                  {msg.length > 50 ? msg.slice(0, 50) + '…' : msg}
                </span>
              )}
              {data && (
                <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, opacity: .7 }}>
                  · {relTime(data)}
                </span>
              )}
            </div>

            {/* Link direto para o diretório no GitHub */}
            {treeUrl && (
              <a
                href={treeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Abrir ${branch} no GitHub`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10, fontWeight: 600, color: C.muted,
                  textDecoration: 'none', flexShrink: 0,
                  padding: '2px 6px', borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  transition: 'color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = C.blue}
                onMouseLeave={e => e.currentTarget.style.color = C.muted}
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                Ver no GitHub ↗
              </a>
            )}
          </div>
        )
      })()}

      {/* ── Detalhes expandidos ──────────────────────────── */}
      {expandido && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
          <div style={{ fontSize: FONT.sm, color: C.muted }}>
            <span style={{ color: C.subtle }}>Caminho:</span>{' '}
            {/* ✅ C.surf2 → C.surface2 */}
            <code style={{ fontSize: 10, background: C.surface2, padding: '1px 5px', borderRadius: 3, color: C.text }}>
              {projeto.caminho}
            </code>
          </div>

          {projeto.package?.scripts?.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.muted }}>Scripts:</span>
              {projeto.package.scripts.map(s => (
                <code key={s} style={{ fontSize: FONT.xs, background: C.surface2, padding: '1px 5px', borderRadius: RADIUS.xs, color: C.blue }}>
                  {s}
                </code>
              ))}
            </div>
          )}

          {syncStatus?.vinculado && (
            <div style={{
              marginTop: 4, background: C.surface2, borderRadius: 7,  /* ✅ C.surf2 → C.surface2 */
              border: `1px solid ${C.border}`, padding: '8px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md,
            }}>
              <div style={{ fontSize: 10, color: C.muted }}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill={C.muted} style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                {syncStatus.nomeCompleto || `${syncStatus.owner}/${syncStatus.repo}`}
                {syncStatus.ultimaSincronizacao && (
                  <span style={{ marginLeft: 8 }}>· sync {relTime(syncStatus.ultimaSincronizacao)}</span>
                )}
              </div>
              {/* ✅ DSBtn substitui <button style={{ fontSize:FONT.xs, fontWeight:700, color:C.blue, ... }}> */}
              <DSBtn size="sm" variant="ghost" onClick={() => onOpenSync(projeto)}>
                Gerenciar
              </DSBtn>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Skeleton ────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg, height: 90, opacity: 1 - i * 0.15,
        }} />
      ))}
    </div>
  )
}

/* ── Chips de filtro por status ──────────────────────────────── */
const FILTROS = ['todos', 'ativo', 'pausado', 'arquivado', 'desconhecido']

function FiltroChips({ atual, onChange, contagens }) {
  return (
    <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: 14 }}>
      {FILTROS.map(f => {
        const ativo = f === atual
        const meta  = STATUS_META[f] || { label: 'Todos', cor: C.blue }
        const label = f === 'todos' ? 'Todos' : meta.label
        const cor   = f === 'todos' ? C.blue : meta.cor
        return (
          // ✅ DSBtn substitui <button style={{ fontSize:FONT.sm, fontWeight:700, borderRadius:20, ... }}>
          <DSBtn
            key={f}
            size="sm"
            variant="ghost"
            onClick={() => onChange(f)}
            style={{
              color:      ativo ? cor  : C.muted,
              background: ativo ? `${cor}18` : 'none',
              border:     `1px solid ${ativo ? `${cor}40` : C.border}`,
              borderRadius: 20,
            }}
          >
            {label}
            {contagens[f] > 0 && (
              <span style={{ marginLeft: 5, fontSize: FONT.xs, opacity: .8 }}>
                {contagens[f]}
              </span>
            )}
          </DSBtn>
        )
      })}
    </div>
  )
}

/* ── Componente principal ────────────────────────────────────── */
/* ════════════════════════════════════════════════════════════════
   GRIDFS — Sprint 11
   Componentes da aba Online (GridFS)
════════════════════════════════════════════════════════════════ */

function fmtBytes(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(1)} ${u[i]}`
}

/* ── Modal de Upload GridFS ──────────────────────────────────── */
function UploadGridFSModal({ onClose, onSuccess, onCommit, nomeProjeto: nomeInicial = '' }) {
  const modoCommit  = Boolean(nomeInicial)
  const inputRef    = useRef(null)
  const pollRef     = useRef(null)
  const [arquivo,   setArquivo]   = useState(null)
  const [nome,      setNome]      = useState(nomeInicial)
  const [substituir,setSubstituir]= useState(modoCommit)
  const [enviando,  setEnviando]  = useState(false)
  const [etapa,     setEtapa]     = useState(null)   // null | 'zip' | 'extrai' | 'limpa' | 'gridfs' | 'meta' | 'ok' | 'erro'
  const [pct,       setPct]       = useState(0)
  const [detalhe,   setDetalhe]   = useState('')
  const [erro,      setErro]      = useState('')
  const [uploadConcluido, setUploadConcluido] = useState(false)
  const [totalEnviados,   setTotalEnviados]   = useState(0)

  useEffect(() => () => clearInterval(pollRef.current), [])

  function onFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.zip')) { setErro('Apenas arquivos .zip'); return }
    setErro(''); setArquivo(f)
    if (!nomeInicial) setNome(f.name.replace(/\.zip$/i,'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,60))
  }

  async function enviar() {
    if (!arquivo || !nome.trim()) return
    setEnviando(true); setErro(''); setEtapa('zip'); setPct(0); setDetalhe('Conectando ao servidor…')

    try {
      /* ── FASE 1: enviar ZIP via XHR com progresso de transferência ── */
      const { jobId, total } = await new Promise((resolve, reject) => {
        const fd = new FormData()
        fd.append('zip', arquivo)
        fd.append('nomeProjeto', nome.trim())
        fd.append('substituir', String(substituir))
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE_URL}/projetos/upload-gridfs`)
        xhr.withCredentials = true
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const p = Math.round(e.loaded / e.total * 100)
            setPct(Math.round(p * 0.25))
            setDetalhe(`Enviando ZIP: ${p}% (${(e.loaded/1024/1024).toFixed(1)} MB)`)
          }
        })
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 400) reject(new Error(data.erro || `Servidor retornou ${xhr.status}`))
            else resolve(data)
          } catch { reject(new Error(`Resposta inválida (${xhr.status})`)) }
        }
        xhr.onerror   = () => reject(new Error('Falha de rede ao enviar o ZIP'))
        xhr.ontimeout = () => reject(new Error('Timeout — ZIP muito grande ou conexão lenta'))
        xhr.timeout   = 60_000
        xhr.send(fd)
      })

      setPct(27); setEtapa('extrai'); setDetalhe(`ZIP recebido — ${total} arquivo${total !== 1 ? 's' : ''} detectado${total !== 1 ? 's' : ''}`)

      /* ── FASE 2: polling do job no backend ───────────────── */
      await new Promise((resolve, reject) => {
        let tentativas = 0
        const MAX = 180   // 180 × 2s = 6 min máximo

        pollRef.current = setInterval(async () => {
          tentativas++
          if (tentativas > MAX) {
            clearInterval(pollRef.current)
            reject(new Error('Tempo limite excedido (6 min). Verifique o MongoDB manualmente.'))
            return
          }
          try {
            const r   = await fetch(`${BASE_URL}/projetos/upload-gridfs/status/${jobId}`, { credentials: 'include' })
            const job = await r.json()

            if (job.erro && !job.status) {
              clearInterval(pollRef.current); reject(new Error(job.erro)); return
            }

            const { fase, enviados = 0, status } = job
            if (fase === 'limpando_antigos') {
              setEtapa('limpa'); setPct(30)
              setDetalhe('Removendo cada arquivo da versão atual do GridFS — evita arquivos órfãos na nova gravação')
            } else if (fase === 'extraindo') {
              setEtapa('extrai'); setPct(33)
              setDetalhe(`Extraindo ${total} arquivo${total !== 1 ? 's' : ''} do ZIP…`)
            } else if (fase === 'enviando') {
              setEtapa('gridfs')
              const p = total > 0 ? Math.round(35 + (enviados / total) * 58) : 36
              setPct(Math.min(p, 97))
              setDetalhe(`Gravando no MongoDB GridFS: ${enviados} / ${total} arquivo${total !== 1 ? 's' : ''}`)
            } else if (fase === 'finalizando') {
              setEtapa('meta'); setPct(98)
              setDetalhe('Salvando metadados do projeto…')
            }

            if (status === 'done') {
              clearInterval(pollRef.current)
              setPct(100); setEtapa('ok')
              setTotalEnviados(job.enviados || 0)
              setDetalhe(`${job.enviados} arquivo${job.enviados !== 1 ? 's' : ''} gravados no GridFS`)
              if (job.erros?.length) toast.success(`${job.enviados} salvos, ${job.erros.length} com erro`)
              else toast.success(`${job.enviados} arquivo${job.enviados !== 1 ? 's' : ''} publicado${job.enviados !== 1 ? 's' : ''} no GridFS!`)
              onSuccess()
              setUploadConcluido(true)
              setEnviando(false)
              resolve()
            } else if (status === 'error') {
              clearInterval(pollRef.current)
              reject(new Error(job.msg || 'Falha no processamento GridFS'))
            }
          } catch (e) {
            if (tentativas > 3) { clearInterval(pollRef.current); reject(e) }
          }
        }, 2000)
      })
    } catch (e) {
      clearInterval(pollRef.current)
      setErro(e.message); setEnviando(false); setEtapa(null); setPct(0)
    }
  }

  const ETAPAS = {
    zip:    { icon: '📤', label: 'Enviando ZIP',             cor: '#3b82f6' },
    extrai: { icon: '📦', label: 'Extraindo arquivos',       cor: '#8b5cf6' },
    limpa:  { icon: '🧹', label: 'Substituindo versão anterior', cor: '#f97316' },
    gridfs: { icon: '🗄️', label: 'Gravando no GridFS',       cor: '#22c55e' },
    meta:   { icon: '📋', label: 'Salvando metadados',       cor: '#06b6d4' },
    ok:     { icon: '✅', label: 'Concluído',                 cor: '#22c55e' },
    erro:   { icon: '❌', label: 'Erro',                      cor: '#ef4444' },
  }
  const GFS_GREEN = '#22c55e'

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'#00000077', display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => e.target === e.currentTarget && !enviando && onClose()}>
      <div style={{
        background:C.surface, border:`1px solid ${C.border}`,
        borderRadius:RADIUS.xl, padding:SPACE.xl2, width:'100%', maxWidth:460,
        display:'flex', flexDirection:'column', gap:SPACE.lg,
      }}>

        {/* Cabeçalho */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:FONT.lg, fontWeight:800, color:C.text, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color: GFS_GREEN }}>🗄️</span>
              {modoCommit ? `Commit: ${nomeInicial}` : 'Upload para GridFS'}
            </div>
            <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>
              {modoCommit
                ? 'Extrai o ZIP e substitui a versão atual no MongoDB GridFS'
                : 'Extrai o ZIP e armazena cada arquivo no MongoDB GridFS'}
            </div>
          </div>
          <button onClick={onClose} disabled={enviando}
            style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:18, flexShrink:0 }}>✕</button>
        </div>

        {/* Dropzone — oculta durante envio */}
        {!enviando && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
            style={{
              border:`2px dashed ${arquivo ? GFS_GREEN : C.border}`,
              borderRadius:RADIUS.lg, padding:`${SPACE.xl2}px ${SPACE.xl}px`,
              textAlign:'center', cursor:'pointer',
              background: arquivo ? `${GFS_GREEN}08` : C.surface2,
              transition:'all .2s',
            }}>
            <input ref={inputRef} type="file" accept=".zip" style={{ display:'none' }}
              onChange={e => onFile(e.target.files[0])} />
            {arquivo ? (
              <>
                <div style={{ fontSize:28, marginBottom:SPACE.sm }}>📦</div>
                <div style={{ fontWeight:700, color:C.text, fontSize:FONT.md }}>{arquivo.name}</div>
                <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:2 }}>
                  {(arquivo.size/1024/1024).toFixed(2)} MB · Clique para trocar
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:32, marginBottom:SPACE.sm }}>⬆</div>
                <div style={{ fontWeight:600, color:C.text }}>Arraste o ZIP ou clique</div>
                <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:4 }}>Máximo 200 MB</div>
              </>
            )}
          </div>
        )}

        {/* Nome do projeto */}
        {!modoCommit && arquivo && !enviando && (
          <div>
            <label style={{ fontSize:FONT.xs, fontWeight:700, color:C.muted, display:'block',
              marginBottom:SPACE.xs, textTransform:'uppercase' }}>Nome do projeto</label>
            <input value={nome} onChange={e => setNome(e.target.value.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,60))}
              placeholder="meu-projeto"
              style={{ width:'100%', padding:'8px 12px', borderRadius:RADIUS.md,
                border:`1px solid ${C.border}`, background:C.surface, color:C.text,
                fontSize:FONT.base, boxSizing:'border-box', outline:'none' }} />
          </div>
        )}

        {/* Substituir — oculto no modo commit */}
        {!modoCommit && arquivo && !enviando && (
          <label style={{ display:'flex', alignItems:'center', gap:SPACE.md, cursor:'pointer',
            fontSize:FONT.base, color:C.text }}>
            <input type="checkbox" checked={substituir} onChange={e => setSubstituir(e.target.checked)} />
            Substituir se já existir
          </label>
        )}

        {/* ── Painel de progresso narrado ───────────────────── */}
        {enviando && (
          <div style={{ display:'flex', flexDirection:'column', gap:SPACE.lg }}>
            <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm }}>
              {Object.entries(ETAPAS).filter(([k]) => k !== 'erro').map(([key, info]) => {
                const keys     = Object.keys(ETAPAS).filter(k => k !== 'erro')
                const curIdx   = keys.indexOf(etapa)
                const keyIdx   = keys.indexOf(key)
                const isAtual  = etapa === key
                const isFutura = curIdx === -1 || keyIdx > curIdx
                const isPasta  = !isFutura && !isAtual
                return (
                  <div key={key} style={{
                    display:'flex', alignItems:'center', gap:10,
                    opacity: isFutura ? 0.3 : 1,
                    transition:'opacity .3s',
                  }}>
                    <span style={{ fontSize:16, width:22, textAlign:'center', flexShrink:0 }}>
                      {isPasta ? '✅' : info.icon}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{
                        fontSize:FONT.sm, fontWeight: isAtual ? 700 : 500,
                        color: isAtual ? info.cor : C.text,
                      }}>{info.label}</div>
                      {isAtual && detalhe && (
                        <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:1,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {detalhe}
                        </div>
                      )}
                    </div>
                    {isAtual && (
                      <span style={{ fontSize:10, color:info.cor, fontWeight:700, flexShrink:0 }}>
                        {pct}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Barra de progresso */}
            <div style={{ height:6, background:C.surface2, borderRadius:RADIUS.xs, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:RADIUS.xs, width:`${pct}%`,
                background: etapa === 'ok'
                  ? '#22c55e'
                  : `linear-gradient(90deg, #22c55e, #06b6d4)`,
                transition:'width .5s ease',
              }} />
            </div>

            {/* Contador ao vivo */}
            {etapa === 'gridfs' && detalhe && (
              <div style={{ textAlign:'center', fontSize:FONT.xs, color:C.muted, fontFamily:'monospace' }}>
                {detalhe}
              </div>
            )}
          </div>
        )}

        {/* ── Tela pós-upload: sucesso + opção de commit ────── */}
        {uploadConcluido && (
          <div style={{ display:'flex', flexDirection:'column', gap:SPACE.lg }}>
            {/* Resumo */}
            <div style={{
              background:`${GFS_GREEN}10`, border:`1px solid ${GFS_GREEN}35`,
              borderRadius:RADIUS.lg, padding:`${SPACE.md}px ${SPACE.lg}px`,
              display:'flex', alignItems:'center', gap:SPACE.md,
            }}>
              <span style={{ fontSize:22 }}>✅</span>
              <div>
                <div style={{ fontWeight:700, color:GFS_GREEN, fontSize:FONT.base }}>
                  Upload concluído com sucesso
                </div>
                <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>
                  <strong style={{ color:C.text }}>{nome}</strong>
                  {' · '}{totalEnviados} arquivo{totalEnviados !== 1 ? 's' : ''} no GridFS
                  {substituir && <span style={{ marginLeft:6, color:C.amber }}>· versão anterior substituída</span>}
                </div>
              </div>
            </div>

            {/* CTA commit */}
            <div style={{
              background:C.surface2, border:`1px solid ${C.border}`,
              borderRadius:RADIUS.lg, padding:SPACE.lg,
              display:'flex', flexDirection:'column', gap:SPACE.md,
            }}>
              <div style={{ fontSize:FONT.sm, fontWeight:700, color:C.text }}>
                Deseja registrar esta versão no GitHub?
              </div>
              <div style={{ fontSize:FONT.xs, color:C.muted, lineHeight:1.5 }}>
                Faça um <strong style={{ color:C.text }}>Commit &amp; Push</strong> para vincular os arquivos
                recém-enviados a um commit no repositório do projeto.
              </div>
              <button
                onClick={() => { onCommit && onCommit(nome); onClose() }}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  padding:'10px 16px', borderRadius:RADIUS.md,
                  background:'#16a34a', border:'none', cursor:'pointer',
                  color:'#fff', fontWeight:700, fontSize:FONT.base,
                  boxShadow:'0 4px 14px #16a34a40',
                  transition:'opacity .15s',
                }}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                Commit &amp; Push no GitHub
              </button>
            </div>

            {/* Fechar sem commit */}
            <DSBtn variant="ghost" onClick={onClose} style={{ alignSelf:'flex-end' }}>
              Fechar sem commit
            </DSBtn>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div style={{
            padding:`${SPACE.sm}px ${SPACE.md}px`, borderRadius:RADIUS.md,
            background:`#ef444412`, border:`1px solid #ef444430`,
            color:'#ef4444', fontSize:FONT.sm,
          }}>{erro}</div>
        )}

        {/* Botões — só visíveis antes do envio e antes da tela de sucesso */}
        {!enviando && !uploadConcluido && (
          <div style={{ display:'flex', gap:SPACE.md, justifyContent:'flex-end' }}>
            <DSBtn variant="ghost" onClick={onClose}>Cancelar</DSBtn>
            <DSBtn
              variant="primary"
              onClick={enviar}
              disabled={!arquivo || !nome.trim()}
              style={{ background: GFS_GREEN, borderColor: GFS_GREEN }}
            >
              <AdminIcon name="save" size={13} />
              {modoCommit ? '↑ Commit' : 'Enviar para GridFS'}
            </DSBtn>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Ícone por extensão de arquivo ───────────────────────────── */
const EXT_ICONE = {
  js: '🟨', jsx: '⚛️', ts: '🔷', tsx: '⚛️',
  json: '📋', md: '📝', html: '🌐', css: '🎨', scss: '🎨',
  py: '🐍', rs: '🦀', go: '🐹', java: '☕', php: '🐘',
  sh: '💻', bash: '💻', env: '🔧', yml: '⚙️', yaml: '⚙️',
  toml: '⚙️', xml: '📄', sql: '🗄️', txt: '📄',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
  zip: '📦', tar: '📦', gz: '📦',
  pdf: '📕', doc: '📄', docx: '📄',
}
function iconeArq(nome) {
  const ext = nome.split('.').pop()?.toLowerCase() || ''
  return EXT_ICONE[ext] || '📄'
}

/* ── Árvore de arquivos (recursiva) ──────────────────────────── */
function ArvorePasta({ no, nivel = 0, onSelect, arquivoAtivo }) {
  const [aberta, setAberta] = useState(nivel === 0)
  return (
    <div>
      {no.nome && (
        <div
          onClick={() => setAberta(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: SPACE.sm,
            padding: `4px ${SPACE.md}px 4px ${nivel * 14 + SPACE.md}px`,
            cursor: 'pointer', fontSize: FONT.sm, color: C.muted, userSelect: 'none',
          }}
        >
          <span style={{ fontSize: 10 }}>{aberta ? '▾' : '▸'}</span>
          <span>📁</span>
          <span style={{ fontWeight: 600 }}>{no.nome}</span>
        </div>
      )}
      {(aberta || !no.nome) && (
        <div>
          {(no.pastas || []).map(p => (
            <ArvorePasta key={p.nome} no={p} nivel={nivel + (no.nome ? 1 : 0)} onSelect={onSelect} arquivoAtivo={arquivoAtivo} />
          ))}
          {(no.arquivos || []).map(a => (
            <div
              key={a.relPath}
              onClick={() => onSelect(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: SPACE.sm,
                padding: `4px ${SPACE.md}px 4px ${(nivel + (no.nome ? 1 : 0)) * 14 + SPACE.md}px`,
                cursor: 'pointer', fontSize: FONT.sm,
                background: arquivoAtivo?.relPath === a.relPath ? `${C.blue}18` : 'transparent',
                color: arquivoAtivo?.relPath === a.relPath ? C.blue : C.text,
                borderRadius: RADIUS.sm,
              }}
            >
              <span>{iconeArq(a.nome)}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
              <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>{fmtBytes(a.tamanho)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Visualizador de código ───────────────────────────────────── */
function CodeViewer({ arquivo, nomeProjeto }) {
  const [conteudo, setConteudo] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState(null)

  useEffect(() => {
    if (!arquivo || !nomeProjeto) return
    setConteudo(null); setErro(null); setLoading(true)
    projetosService.arquivoGridFS(nomeProjeto, arquivo.relPath)
      .then(res => setConteudo(res))
      .catch(e  => setErro(e.message))
      .finally(() => setLoading(false))
  }, [arquivo, nomeProjeto])

  if (!arquivo) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, flexDirection: 'column', gap: SPACE.md }}>
      <span style={{ fontSize: 32 }}>👈</span>
      <span style={{ fontSize: FONT.md }}>Selecione um arquivo para visualizar</span>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      {/* Header do arquivo */}
      <div style={{
        padding: `${SPACE.md}px ${SPACE.lg}px`,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: SPACE.md, flexShrink: 0,
      }}>
        <span>{iconeArq(arquivo.nome)}</span>
        <span style={{ fontSize: FONT.sm, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {arquivo.relPath}
        </span>
        {conteudo && !conteudo.binario && (
          <span style={{ fontSize: FONT.xs, color: C.muted, flexShrink: 0 }}>
            {conteudo.linhas} linhas · {fmtBytes(conteudo.tamanho)}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl2, gap: SPACE.md, color: C.muted }}>
            <AdminIcon name="spinSm" size={14} /> Carregando...
          </div>
        )}
        {erro && (
          <div style={{ padding: SPACE.xl, color: C.red, fontSize: FONT.sm }}>{erro}</div>
        )}
        {conteudo?.binario && (
          <div style={{ padding: SPACE.xl, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: SPACE.md }}>🔒</div>
            <div style={{ fontSize: FONT.md, fontWeight: 600 }}>Arquivo binário</div>
            <div style={{ fontSize: FONT.sm, marginTop: SPACE.sm }}>
              {arquivo.nome} · {fmtBytes(arquivo.tamanho)}
            </div>
          </div>
        )}
        {conteudo && !conteudo.binario && (
          <div style={{ display: 'flex', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
            {/* Números de linha */}
            <div style={{
              padding: `${SPACE.lg}px ${SPACE.md}px`,
              borderRight: `1px solid ${C.border}`,
              color: C.muted, textAlign: 'right', userSelect: 'none',
              minWidth: 40, flexShrink: 0,
              background: C.surf2,
            }}>
              {conteudo.conteudo.split('\n').map((_, i) => (
                <div key={i} style={{ paddingRight: SPACE.sm }}>{i + 1}</div>
              ))}
            </div>
            {/* Código */}
            <pre style={{
              margin: 0, padding: `${SPACE.lg}px ${SPACE.xl}px`,
              flex: 1, overflow: 'visible', whiteSpace: 'pre', color: C.text,
            }}>
              {conteudo.conteudo}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Card de projeto GridFS ──────────────────────────────────── */
function CardGridFS({ projeto, onAbrir, onDeletar, onCommit, onUpload, onDownload }) {
  const [expandido, setExpandido] = useState(false)
  const ghOwner = projeto.metadados?.githubOwner
  const ghRepo  = projeto.metadados?.githubRepo
  const repoUrl = ghOwner && ghRepo ? `https://github.com/${ghOwner}/${ghRepo}` : null
  const branch  = projeto.metadados?.ultimoCommitBranch || 'main'

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.lg, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* ── Linha principal ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.md }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>{projeto.nome}</span>
            <DSBadge style={{ background: `${C.greenSolid}18`, color: C.greenSolid,
              border: `1px solid ${C.greenSolid}30`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              GridFS
            </DSBadge>
            {repoUrl && <GHRepoLink repoUrl={repoUrl} branch={branch}
              nomeCompleto={`${ghOwner}/${ghRepo}`} compact />}
          </div>
          <div style={{ fontSize: FONT.sm, color: C.muted, lineHeight: 1.4 }}>
            {projeto.totalArquivos} arquivo{projeto.totalArquivos !== 1 ? 's' : ''} · {fmtBytes(projeto.tamanhoTotal)}
            {projeto.ultimoUpload && (
              <span style={{ marginLeft: 8, opacity: .7 }}>· upload {relTime(projeto.ultimoUpload)}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexShrink: 0 }}>
          <DSBtn size="sm" variant="ghost" onClick={() => onCommit(projeto)} title="Commit & Push para o GitHub">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 600 }}>Commit</span>
          </DSBtn>
          <DSBtn size="icon" variant="ghost" onClick={() => setExpandido(v => !v)}
            title={expandido ? 'Recolher' : 'Ver detalhes'}>
            <AdminIcon name={expandido ? 'chevUp' : 'chevDown'} size={14} />
          </DSBtn>
        </div>
      </div>

      {/* ── GitHub badge ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SPACE.sm }}>
        <GitHubBadge nome={projeto.nome} uploadedAt={projeto.ultimoUpload} />
        {projeto.metadados?.ultimoCommitSha && (
          <code style={{ fontSize: 10, color: C.blue, background: `${C.blue}12`,
            padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
            {projeto.metadados.ultimoCommitSha.slice(0, 7)}
          </code>
        )}
      </div>

      {/* ── Detalhes expandidos ───────────────────────────── */}
      {expandido && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
          <div style={{ fontSize: FONT.sm, color: C.muted }}>
            <span style={{ color: C.subtle }}>Armazenamento:</span>{' '}
            <code style={{ fontSize: 10, background: C.surface2, padding: '1px 5px', borderRadius: 3, color: C.text }}>
              gridfs:{projeto.nome}
            </code>
          </div>
          <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', marginTop: 4 }}>
            <DSBtn variant="ghost" style={{ flex: 1 }} onClick={() => onAbrir(projeto)}>
              <AdminIcon name="eye" size={13} /> Explorar
            </DSBtn>
            <DSBtn variant="ghost" style={{ flex: 1 }} onClick={() => onDownload(projeto)}
              title="Baixar todos os arquivos como .zip">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Baixar .zip
            </DSBtn>
            <DSBtn variant="ghost" style={{ flex: 1 }} onClick={() => onUpload(projeto)}>
              <AdminIcon name="save" size={13} /> Upload
            </DSBtn>
            <DSBtn variant="ghost" onClick={() => onDeletar(projeto)}>
              <AdminIcon name="trash" size={13} />
            </DSBtn>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Explorador de projeto (árvore + visualizador) ───────────── */
function ExploradorGridFS({ projeto, onFechar }) {
  const [arvore,       setArvore]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [arquivoAtivo, setArquivoAtivo] = useState(null)
  const [busca,        setBusca]        = useState('')

  useEffect(() => {
    setLoading(true)
    projetosService.detalheGridFS(projeto.nome)
      .then(res => setArvore(res))
      .catch(e  => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [projeto.nome])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.surface, display: 'flex', flexDirection: 'column',
    }}>
      {/* Barra superior */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE.md,
        padding: `${SPACE.md}px ${SPACE.xl}px`,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        background: C.surf2,
      }}>
        <DSBtn variant="ghost" onClick={onFechar} style={{ padding: '4px 10px' }}>
          ← Voltar
        </DSBtn>
        <span style={{ fontSize: FONT.md, fontWeight: 800, color: C.text, flex: 1 }}>
          📦 {projeto.nome}
        </span>
        {arvore && (
          <span style={{ fontSize: FONT.xs, color: C.muted }}>
            {arvore.totalArquivos} arquivos · {fmtBytes(arvore.tamanhoTotal)}
          </span>
        )}
      </div>

      {/* Corpo: sidebar + viewer */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar: árvore */}
        <div style={{
          width: 240, flexShrink: 0, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: C.surf2,
        }}>
          <div style={{ padding: `${SPACE.md}px`, borderBottom: `1px solid ${C.border}` }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar arquivo..."
              style={{
                width: '100%', padding: '5px 8px', borderRadius: RADIUS.sm,
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.text, fontSize: FONT.sm, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && (
              <div style={{ padding: SPACE.xl, display: 'flex', gap: SPACE.md, color: C.muted, fontSize: FONT.sm }}>
                <AdminIcon name="spinSm" size={12} /> Carregando...
              </div>
            )}
            {arvore && !busca && (
              <ArvorePasta no={arvore.arvore} onSelect={setArquivoAtivo} arquivoAtivo={arquivoAtivo} />
            )}
            {arvore && busca && (() => {
              const q = busca.toLowerCase()
              const todos = []
              function coletar(no) {
                for (const p of (no.pastas || [])) coletar(p)
                for (const a of (no.arquivos || [])) todos.push(a)
              }
              coletar(arvore.arvore)
              const filtrados = todos.filter(a => a.nome.toLowerCase().includes(q) || a.relPath.toLowerCase().includes(q))
              return filtrados.length ? filtrados.map(a => (
                <div
                  key={a.relPath}
                  onClick={() => setArquivoAtivo(a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SPACE.sm,
                    padding: `5px ${SPACE.md}px`, cursor: 'pointer', fontSize: FONT.sm,
                    background: arquivoAtivo?.relPath === a.relPath ? `${C.blue}18` : 'transparent',
                    color: arquivoAtivo?.relPath === a.relPath ? C.blue : C.text,
                  }}
                >
                  <span>{iconeArq(a.nome)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                    <div style={{ fontSize: FONT.xs, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.relPath}</div>
                  </div>
                </div>
              )) : <div style={{ padding: SPACE.xl, color: C.muted, fontSize: FONT.sm }}>Nenhum arquivo encontrado.</div>
            })()}
          </div>
        </div>

        {/* Code Viewer */}
        <CodeViewer arquivo={arquivoAtivo} nomeProjeto={projeto.nome} />
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   CLOUDFLARE R2 — Sprint 12
   Componentes da aba R2 (Cloudflare)
════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   GITHUB SYNC BADGE — Sprint 13
   Compara a data do último commit no GitHub com a data do deploy
   no R2 ou GridFS. Carrega lazy ao montar o card.
════════════════════════════════════════════════════════════════ */

const GH_STATUS = {
  em_dia:        { emoji: '🟢', label: 'Em dia',            cor: '#22c55e' },
  github_frente: { emoji: '🔴', label: 'GitHub mais novo',  cor: '#ef4444' },
  deploy_frente: { emoji: '🟡', label: 'Deploy mais novo',  cor: '#eab308' },
  sem_vinculo:   { emoji: '⬛', label: 'Sem GitHub',         cor: '#6b7280' },
  sem_token:     { emoji: '🔑', label: 'Sem token GitHub',  cor: '#f97316' },
  sem_dados:     { emoji: '❓', label: 'Sem dados',          cor: '#9ca3af' },
  erro:          { emoji: '⚠️', label: 'Erro',              cor: '#f97316' },
}

/* ── Link direto para repositório GitHub ─────────────────────── */
function GHRepoLink({ repoUrl, branch, nomeCompleto, compact = false, style = {} }) {
  if (!repoUrl) return null
  const href = branch ? `${repoUrl}/tree/${branch}` : repoUrl
  const label = nomeCompleto
    ? (compact ? nomeCompleto.split('/')[1] || nomeCompleto : nomeCompleto)
    : 'GitHub ↗'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir ${nomeCompleto || ''} no GitHub`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 600, color: C.muted,
        textDecoration: 'none',
        padding: '2px 7px', borderRadius: 4,
        border: `1px solid ${C.border}`,
        background: C.surface2,
        transition: 'all .15s',
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#6e40c9'; e.currentTarget.style.borderColor = '#6e40c990' }}
      onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}
    >
      <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
      {label}
    </a>
  )
}

function GitHubBadge({ nome, uploadedAt }) {
  const [status,     setStatus]     = useState(null)   // null = carregando
  const [detalhe,    setDetalhe]    = useState(null)
  const [tooltip,    setTooltip]    = useState(false)

  useEffect(() => {
    if (!uploadedAt) return
    let cancelado = false
    projetosService.githubStatus(nome, uploadedAt)
      .then(d => { if (!cancelado) { setStatus(d.status); setDetalhe(d) } })
      .catch(() => { if (!cancelado) setStatus('erro') })
    return () => { cancelado = true }
  }, [nome, uploadedAt])

  if (!uploadedAt) return null
  if (!status) return (
    <span style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
      <AdminIcon name="spinSm" size={10} /> GitHub
    </span>
  )

  const info = GH_STATUS[status] ?? GH_STATUS.sem_dados

  // Monta linha de detalhe (tempo relativo)
  let sub = ''
  if (detalhe?.diffMin !== undefined && status !== 'em_dia' && status !== 'sem_vinculo') {
    const abs  = Math.abs(detalhe.diffMin)
    const txt  = abs < 60 ? `${abs}min` : abs < 1440 ? `${Math.round(abs/60)}h` : `${Math.round(abs/1440)}d`
    sub = status === 'github_frente' ? `+${txt} no GitHub` : `+${txt} no deploy`
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setTooltip(t => !t)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0',
        }}
      >
        <span style={{ fontSize: 11 }}>{info.emoji}</span>
        <span style={{ fontSize: FONT.xs, color: info.cor, fontWeight: 600 }}>{info.label}</span>
        {sub && <span style={{ fontSize: 10, color: C.muted }}>{sub}</span>}
      </button>

      {/* Tooltip com detalhes do último commit */}
      {tooltip && detalhe?.latestCommit && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg, padding: SPACE.md, minWidth: 240, maxWidth: 300,
          boxShadow: '0 4px 16px #0004',
        }}>
          <div style={{ fontSize: FONT.xs, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            Último commit no GitHub
          </div>
          <div style={{ fontSize: FONT.xs, color: C.muted, marginBottom: 2 }}>
            <code style={{ fontSize: 10, background: C.surface2, padding: '1px 4px', borderRadius: 3 }}>
              {detalhe.latestCommit.sha}
            </code>
            {' '}{detalhe.latestCommit.author}
          </div>
          <div style={{ fontSize: FONT.xs, color: C.text, marginBottom: 4 }}>
            "{detalhe.latestCommit.message}"
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>
            {new Date(detalhe.latestCommit.date).toLocaleString('pt-BR')}
          </div>
          {detalhe.repoUrl && (
            <a href={detalhe.repoUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, color: '#3b82f6', display: 'block', marginTop: 4 }}>
              Ver no GitHub ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

const CF_ORANGE = '#f6821f'

/* ── Modal de commit (re-upload) para R2 ─────────────────────── */
function UploadR2Modal({ nomeProjeto, onClose, onSuccess }) {
  const inputRef              = useRef(null)
  const pollRef               = useRef(null)
  const [arquivo, setArquivo] = useState(null)
  const [nome,    setNome]    = useState(nomeProjeto || '')
  const [enviando,setEnviando]= useState(false)
  const [etapa,   setEtapa]   = useState(null)   // null | 'zip' | 'extrai' | 'limpa' | 'r2' | 'ok' | 'erro'
  const [pct,     setPct]     = useState(0)
  const [detalhe, setDetalhe] = useState('')
  const [erro,    setErro]    = useState('')

  useEffect(() => () => clearInterval(pollRef.current), [])

  function onFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.zip')) { setErro('Apenas arquivos .zip'); return }
    setErro(''); setArquivo(f)
    if (!nomeProjeto) setNome(f.name.replace(/\.zip$/i,'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,60))
  }

  async function enviar() {
    if (!arquivo || !nome.trim()) return
    setEnviando(true); setErro(''); setEtapa('zip'); setPct(0); setDetalhe('Conectando ao servidor…')

    try {
      /* ── FASE 1: enviar ZIP via XHR (só transferência, < 60s) ── */
      const { jobId, total } = await new Promise((resolve, reject) => {
        const fd = new FormData()
        fd.append('zip', arquivo)
        fd.append('nomeProjeto', nome.trim())
        fd.append('substituir', 'true')
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE_URL}/projetos/upload-r2`)
        xhr.withCredentials = true
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const p = Math.round(e.loaded / e.total * 100)
            setPct(Math.round(p * 0.3))              // 0→30 %
            setDetalhe(`Enviando ZIP: ${p}% (${(e.loaded/1024/1024).toFixed(1)} MB)`)
          }
        })
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 400) reject(new Error(data.erro || `Servidor retornou ${xhr.status}`))
            else resolve(data)
          } catch { reject(new Error(`Resposta inválida (${xhr.status})`)) }
        }
        xhr.onerror   = () => reject(new Error('Falha de rede ao enviar o ZIP'))
        xhr.ontimeout = () => reject(new Error('Timeout — ZIP muito grande ou conexão lenta'))
        xhr.timeout   = 60_000
        xhr.send(fd)
      })

      setPct(32); setEtapa('extrai'); setDetalhe(`ZIP recebido — ${total} arquivos detectados`)

      /* ── FASE 2: polling até job terminar ─────────────────── */
      await new Promise((resolve, reject) => {
        let tentativas = 0
        const MAX = 180   // 180 × 2s = 6 min máximo

        pollRef.current = setInterval(async () => {
          tentativas++
          if (tentativas > MAX) {
            clearInterval(pollRef.current)
            reject(new Error('Tempo limite excedido (6 min). Verifique o R2 manualmente.'))
            return
          }
          try {
            const r   = await fetch(`${BASE_URL}/projetos/upload-r2/status/${jobId}`, { credentials: 'include' })
            const job = await r.json()

            if (job.erro && !job.status) {
              clearInterval(pollRef.current); reject(new Error(job.erro)); return
            }

            /* Atualiza UI conforme fase */
            const { fase, enviados = 0, status } = job
            if (fase === 'limpando_antigos') {
              setEtapa('limpa'); setPct(35)
              setDetalhe('Removendo versão anterior do bucket…')
            } else if (fase === 'enviando') {
              setEtapa('r2')
              const p = total > 0 ? Math.round(35 + (enviados / total) * 62) : 36
              setPct(Math.min(p, 97))
              setDetalhe(`Enviando ao Cloudflare R2: ${enviados} / ${total} arquivo${total !== 1 ? 's' : ''}`)
            }

            if (status === 'done') {
              clearInterval(pollRef.current)
              setPct(100); setEtapa('ok')
              setDetalhe(`Concluído: ${job.enviados} arquivo${job.enviados !== 1 ? 's' : ''} no R2`)
              if (job.erros?.length) toast.success(`${job.enviados} enviados, ${job.erros.length} com erro`)
              else toast.success(`${job.enviados} arquivos publicados no R2!`)
              setTimeout(() => { onSuccess(); onClose() }, 900)
              resolve()
            } else if (status === 'error') {
              clearInterval(pollRef.current)
              reject(new Error(job.msg || 'Falha no processamento R2'))
            }
          } catch (e) {
            if (tentativas > 3) { clearInterval(pollRef.current); reject(e) }
          }
        }, 2000)
      })
    } catch (e) {
      clearInterval(pollRef.current)
      setErro(e.message); setEnviando(false); setEtapa(null); setPct(0)
    }
  }

  /* ── Ícone e cor por etapa ──────────────────────────────── */
  const ETAPAS = {
    zip:    { icon: '📤', label: 'Enviando ZIP',          cor: '#3b82f6' },
    extrai: { icon: '📦', label: 'Extraindo arquivos',    cor: '#8b5cf6' },
    limpa:  { icon: '🧹', label: 'Limpando versão antiga',cor: '#f97316' },
    r2:     { icon: '☁️', label: 'Publicando no R2',      cor: CF_ORANGE },
    ok:     { icon: '✅', label: 'Concluído',              cor: '#22c55e' },
    erro:   { icon: '❌', label: 'Erro',                   cor: '#ef4444' },
  }
  const meta = etapa ? (ETAPAS[etapa] || ETAPAS.r2) : null

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'#00000077', display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => e.target === e.currentTarget && !enviando && onClose()}>
      <div style={{
        background:C.surface, border:`1px solid ${C.border}`,
        borderRadius:RADIUS.xl, padding:SPACE.xl2, width:'100%', maxWidth:460,
        display:'flex', flexDirection:'column', gap:SPACE.lg,
      }}>

        {/* Cabeçalho */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:FONT.lg, fontWeight:800, color:C.text, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:CF_ORANGE }}>☁️</span>
              {nomeProjeto ? `Commit: ${nomeProjeto}` : 'Publicar no R2'}
            </div>
            <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>
              Extrai o ZIP e envia cada arquivo individualmente para o bucket R2
            </div>
          </div>
          <button onClick={onClose} disabled={enviando}
            style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:18, flexShrink:0 }}>✕</button>
        </div>

        {/* Dropzone */}
        {!enviando && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
            style={{
              border:`2px dashed ${arquivo ? CF_ORANGE : C.border}`,
              borderRadius:RADIUS.lg, padding:`${SPACE.xl2}px ${SPACE.xl}px`,
              textAlign:'center', cursor:'pointer',
              background: arquivo ? `${CF_ORANGE}08` : C.surface2,
              transition:'all .2s',
            }}>
            <input ref={inputRef} type="file" accept=".zip" style={{ display:'none' }}
              onChange={e => onFile(e.target.files[0])} />
            {arquivo ? (
              <>
                <div style={{ fontSize:28, marginBottom:SPACE.sm }}>📦</div>
                <div style={{ fontWeight:700, color:C.text, fontSize:FONT.md }}>{arquivo.name}</div>
                <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:2 }}>
                  {(arquivo.size/1024/1024).toFixed(2)} MB · Clique para trocar
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:32, marginBottom:SPACE.sm }}>⬆</div>
                <div style={{ fontWeight:600, color:C.text }}>Arraste o ZIP ou clique</div>
                <div style={{ fontSize:FONT.sm, color:C.muted, marginTop:4 }}>Máximo 200 MB</div>
              </>
            )}
          </div>
        )}

        {/* Nome (só aparece sem nomeProjeto fixo) */}
        {!nomeProjeto && arquivo && !enviando && (
          <div>
            <label style={{ fontSize:FONT.xs, fontWeight:700, color:C.muted, display:'block',
              marginBottom:SPACE.xs, textTransform:'uppercase' }}>Nome do projeto</label>
            <input value={nome} onChange={e => setNome(e.target.value.replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,60))}
              placeholder="meu-projeto"
              style={{ width:'100%', padding:'8px 12px', borderRadius:RADIUS.md,
                border:`1px solid ${C.border}`, background:C.surface, color:C.text,
                fontSize:FONT.base, boxSizing:'border-box', outline:'none' }} />
          </div>
        )}

        {/* ── Painel de progresso em etapas ─────────────────── */}
        {enviando && (
          <div style={{ display:'flex', flexDirection:'column', gap:SPACE.lg }}>

            {/* Etapas com ícones */}
            <div style={{ display:'flex', flexDirection:'column', gap:SPACE.sm }}>
              {Object.entries(ETAPAS).filter(([k]) => k !== 'erro').map(([key, info]) => {
                const isAtual  = etapa === key
                const isFutura = !etapa || Object.keys(ETAPAS).indexOf(key) > Object.keys(ETAPAS).indexOf(etapa)
                const isPasta  = !isFutura && etapa !== key
                return (
                  <div key={key} style={{
                    display:'flex', alignItems:'center', gap:10,
                    opacity: isFutura ? 0.3 : 1,
                    transition:'opacity .3s',
                  }}>
                    <span style={{ fontSize:16, width:22, textAlign:'center', flexShrink:0 }}>
                      {isPasta ? '✅' : info.icon}
                    </span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{
                        fontSize:FONT.sm, fontWeight: isAtual ? 700 : 500,
                        color: isAtual ? info.cor : C.text,
                      }}>{info.label}</div>
                      {isAtual && detalhe && (
                        <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:1,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {detalhe}
                        </div>
                      )}
                    </div>
                    {isAtual && (
                      <span style={{ fontSize:10, color:info.cor, fontWeight:700, flexShrink:0 }}>
                        {pct}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Barra de progresso */}
            <div style={{ height:6, background:C.surface2, borderRadius:RADIUS.xs, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:RADIUS.xs, width:`${pct}%`,
                background: etapa === 'ok'
                  ? '#22c55e'
                  : `linear-gradient(90deg, ${CF_ORANGE}, #f59e0b)`,
                transition:'width .5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div style={{
            padding:`${SPACE.sm}px ${SPACE.md}px`, borderRadius:RADIUS.md,
            background:`#ef444412`, border:`1px solid #ef444430`,
            color:'#ef4444', fontSize:FONT.sm,
          }}>{erro}</div>
        )}

        {/* Botões */}
        {!enviando && (
          <div style={{ display:'flex', gap:SPACE.md, justifyContent:'flex-end' }}>
            <DSBtn variant="ghost" onClick={onClose}>Cancelar</DSBtn>
            <DSBtn
              variant="primary"
              onClick={enviar}
              disabled={!arquivo || !nome.trim()}
              style={{ background:CF_ORANGE, borderColor:CF_ORANGE }}
            >
              <AdminIcon name="save" size={13} />
              {nomeProjeto ? '↑ Commit' : 'Publicar no R2'}
            </DSBtn>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Explorador de arquivos R2 ────────────────────────────────── */
function ExploradorR2({ projeto, onFechar }) {
  const [arquivos, setArquivos] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    projetosService.arquivosR2(projeto.nome)
      .then(res  => { if (!cancelado) setArquivos(res.arquivos || []) })
      .catch(e   => { if (!cancelado) toast.error(e.message) })
      .finally(()=> { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }   // FIX: cleanup evita race condition
  }, [projeto.nome])

  const filtrados = busca.trim()
    ? arquivos.filter(a => a.relPath.toLowerCase().includes(busca.toLowerCase()))
    : arquivos

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.surface, display: 'flex', flexDirection: 'column',
    }}>
      {/* Barra superior */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE.md,
        padding: `${SPACE.md}px ${SPACE.xl}px`,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        background: C.surf2,
      }}>
        <DSBtn variant="ghost" onClick={onFechar} style={{ padding: '4px 10px' }}>← Voltar</DSBtn>
        <span style={{ fontSize: FONT.md, fontWeight: 800, color: C.text, flex: 1 }}>
          ☁️ {projeto.nome}
        </span>
        <span style={{ fontSize: FONT.xs, color: C.muted }}>
          {arquivos.length} arquivos · {fmtBytes(projeto.tamanhoTotal)}
        </span>
      </div>

      {/* Barra de busca */}
      <div style={{ padding: SPACE.md, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar arquivo..."
          style={{
            width: '100%', padding: '6px 10px', borderRadius: RADIUS.sm,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: FONT.sm, boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Lista de arquivos */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl2, gap: SPACE.md, color: C.muted }}>
            <AdminIcon name="spinSm" size={14} /> Carregando…
          </div>
        )}
        {!loading && filtrados.length === 0 && (
          <div style={{ padding: SPACE.xl2, textAlign: 'center', color: C.muted, fontSize: FONT.sm }}>
            {busca ? 'Nenhum arquivo encontrado.' : 'Projeto vazio.'}
          </div>
        )}
        {!loading && filtrados.map(a => (
          <div key={a.key} style={{
            display: 'flex', alignItems: 'center', gap: SPACE.md,
            padding: `6px ${SPACE.xl}px`,
            borderBottom: `1px solid ${C.border}`,
            fontSize: FONT.sm,
          }}>
            <span style={{ fontSize: 15 }}>{iconeArq(a.relPath)}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>
              {a.relPath}
            </span>
            <span style={{ fontSize: FONT.xs, color: C.muted, flexShrink: 0 }}>{fmtBytes(a.tamanho)}</span>
            {a.uploadedAt && (
              <span style={{ fontSize: FONT.xs, color: C.muted, flexShrink: 0 }}>
                {relTime(a.uploadedAt)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Card de projeto R2 ──────────────────────────────────────── */
function CardR2({ projeto, onCommit, onExplorar, onDeletar }) {
  const ghOwner = projeto.metadados?.githubOwner
  const ghRepo  = projeto.metadados?.githubRepo
  const repoUrl = ghOwner && ghRepo ? `https://github.com/${ghOwner}/${ghRepo}` : null
  const branch  = projeto.metadados?.ultimoCommitBranch || 'main'

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.xl, padding: SPACE.xl,
      display: 'flex', flexDirection: 'column', gap: SPACE.md,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.md }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: FONT.md, fontWeight: 800, color: C.text }}>{projeto.nome}</span>
            <DSBadge style={{ background: `${CF_ORANGE}18`, color: CF_ORANGE, border: `1px solid ${CF_ORANGE}30` }}>
              R2
            </DSBadge>
            {repoUrl && <GHRepoLink repoUrl={repoUrl} branch={branch}
              nomeCompleto={`${ghOwner}/${ghRepo}`} compact />}
          </div>
          <div style={{ fontSize: FONT.xs, color: C.muted }}>
            {projeto.totalArquivos} arquivo{projeto.totalArquivos !== 1 ? 's' : ''} · {fmtBytes(projeto.tamanhoTotal)}
            {projeto.ultimaModificacao && (
              <span style={{ marginLeft: 8, opacity: .7 }}>· {relTime(projeto.ultimaModificacao)}</span>
            )}
          </div>
        </div>
        {projeto.metadados?.ultimoCommitSha && (
          <code style={{ fontSize: 10, color: CF_ORANGE, background: `${CF_ORANGE}12`,
            padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 }}>
            {projeto.metadados.ultimoCommitSha.slice(0, 7)}
          </code>
        )}
      </div>
      <GitHubBadge nome={projeto.nome} uploadedAt={projeto.ultimaModificacao} />
      <div style={{ display: 'flex', gap: SPACE.sm }}>
        <DSBtn variant="ghost" style={{ flex: 1 }} onClick={() => onExplorar(projeto)}>
          <AdminIcon name="eye" size={13} /> Explorar
        </DSBtn>
        <DSBtn
          variant="primary"
          style={{ flex: 1, background: CF_ORANGE, borderColor: CF_ORANGE }}
          onClick={() => onCommit(projeto)}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          Commit & Push
        </DSBtn>
        <DSBtn variant="ghost" onClick={() => onDeletar(projeto)}>
          <AdminIcon name="trash" size={13} />
        </DSBtn>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   TestarR2 — Botão compacto de diagnóstico da conexão R2
   Abre um painel inline com checklist de ambiente, token, bucket
   e teste real de escrita/leitura.
════════════════════════════════════════════════════════════════ */
function TestarR2() {
  const [aberto,  setAberto]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [dados,   setDados]   = useState(null)

  async function checar() {
    setLoading(true); setAberto(true); setDados(null)
    try {
      const d = await projetosService.r2Health()
      setDados(d)
    } catch (e) {
      setDados({ ok: false, etapa: 'rede', erro: e.message })
    } finally {
      setLoading(false)
    }
  }

  const CHECKS = dados ? [
    {
      ok:     !dados.faltando?.length,
      label:  'Variáveis de ambiente',
      sub:    dados.faltando?.length
                ? `Faltando: ${dados.faltando.join(', ')}`
                : 'CF_ACCOUNT_ID · CF_API_TOKEN · CF_R2_BUCKET',
    },
    {
      ok:     dados.tokenOk,
      label:  'Token Cloudflare',
      sub:    dados.tokenOk ? `Account: ${dados.accountId}` : 'Token inválido ou expirado',
    },
    {
      ok:     dados.etapa !== 'bucket' && !!dados.bucket,
      label:  `Bucket: ${dados.bucket || '—'}`,
      sub:    dados.regiao ? `Região: ${dados.regiao}` : dados.erro && dados.etapa === 'bucket' ? dados.erro : '—',
    },
    {
      ok:     dados.escritaOk,
      label:  'Permissão de escrita',
      sub:    dados.escritaOk ? 'PUT ✓ (objeto de teste criado e removido)' : 'Sem permissão de escrita no bucket',
    },
    {
      ok:     dados.leituraOk,
      label:  'Permissão de leitura',
      sub:    dados.leituraOk ? 'GET ✓' : 'Sem permissão de leitura',
    },
    {
      ok:     !!dados.publicUrl,
      label:  'URL pública',
      sub:    dados.publicUrl || 'CF_R2_PUBLIC_URL não configurada (opcional)',
      opcional: true,
    },
  ] : []

  return (
    <div style={{ position:'relative' }}>
      {/* Botão compacto */}
      <DSBtn
        variant={dados?.ok ? 'ghost' : 'ghost'}
        onClick={checar}
        disabled={loading}
        style={{
          fontSize: FONT.xs, padding:'4px 12px', display:'flex', alignItems:'center', gap:6,
          border: dados
            ? `1px solid ${dados.ok ? '#22c55e55' : '#ef444455'}`
            : `1px solid ${C.border}`,
          color: dados ? (dados.ok ? '#22c55e' : '#ef4444') : C.muted,
        }}
      >
        {loading
          ? <><AdminIcon name="spinSm" size={11} /> Verificando…</>
          : dados?.ok
            ? <>🟢 R2 conectado</>
            : dados
              ? <>🔴 Falha — testar</>
              : <>🔌 Testar R2</>
        }
      </DSBtn>

      {/* Painel de resultado — modal centralizado na tela */}
      {aberto && dados && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setAberto(false)}
            style={{
              position:'fixed', inset:0, zIndex:200,
              background:'#00000044',
            }}
          />
          {/* Painel */}
          <div style={{
            position:'fixed',
            top:'50%', left:'50%',
            transform:'translate(-50%, -50%)',
            zIndex:201,
            width:'min(420px, 92vw)',
            background:C.surface,
            border:`1.5px solid ${dados.ok ? '#22c55e44' : '#ef444444'}`,
            borderRadius:RADIUS.xl,
            boxShadow:'0 12px 48px #0005',
            overflow:'hidden',
          }}>
          {/* Topo com resumo */}
          <div style={{
            padding:`${SPACE.md}px ${SPACE.lg}px`,
            background: dados.ok ? '#22c55e0a' : '#ef44440a',
            borderBottom:`1px solid ${C.border}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div>
              <div style={{ fontSize:FONT.sm, fontWeight:700, color: dados.ok ? '#22c55e' : '#ef4444' }}>
                {dados.ok ? '✅ Conexão R2 funcionando' : '❌ Falha na conexão'}
              </div>
              {dados.ok && (
                <div style={{ fontSize:FONT.xs, color:C.muted, marginTop:2 }}>
                  {dados.totalObjetos} objetos · {fmtBytes(dados.tamanhoTotal)}
                  {dados.criado && ` · criado ${new Date(dados.criado).toLocaleDateString('pt-BR')}`}
                </div>
              )}
            </div>
            <button onClick={() => setAberto(false)}
              style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>

          {/* Checklist */}
          <div style={{ padding:`${SPACE.md}px ${SPACE.lg}px`, display:'flex', flexDirection:'column', gap:SPACE.sm }}>
            {CHECKS.map((c, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>
                  {c.ok ? '✅' : c.opcional ? '⬜' : '❌'}
                </span>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:FONT.sm, fontWeight:600, color:C.text }}>{c.label}</div>
                  {c.sub && <div style={{ fontSize:10, color:C.muted, marginTop:1, wordBreak:'break-all' }}>{c.sub}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Pastas no bucket */}
          {dados.ok && dados.prefixos?.length > 0 && (
            <div style={{
              borderTop:`1px solid ${C.border}`,
              padding:`${SPACE.md}px ${SPACE.lg}px`,
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', marginBottom:SPACE.sm }}>
                Pastas no bucket
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:SPACE.sm }}>
                {dados.prefixos.map(p => (
                  <div key={p.nome} style={{
                    fontSize:10, padding:'3px 8px', borderRadius:RADIUS.sm,
                    background:`${CF_ORANGE}15`, border:`1px solid ${CF_ORANGE}30`,
                    color:C.text, display:'flex', alignItems:'center', gap:4,
                  }}>
                    <span>📁</span>
                    <span style={{ fontWeight:700 }}>{p.nome}</span>
                    <span style={{ color:C.muted }}>{p.arquivos} arq.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Erro detalhado */}
          {!dados.ok && dados.erro && (
            <div style={{
              borderTop:`1px solid ${C.border}`,
              padding:`${SPACE.md}px ${SPACE.lg}px`,
              display:'flex', flexDirection:'column', gap:SPACE.sm,
            }}>
              <div style={{ fontSize:FONT.xs, color:'#ef4444', fontWeight:600 }}>
                {dados.erro}
              </div>
              {dados.detalhe && (
                <code style={{
                  fontSize:10, color:'#ef4444', opacity:0.75,
                  background:'#ef444410', padding:'4px 6px', borderRadius:4,
                  display:'block', wordBreak:'break-all',
                }}>
                  {dados.detalhe.length > 120 ? dados.detalhe.slice(0,120)+'…' : dados.detalhe}
                </code>
              )}
              {dados.etapa === 'token' && (
                <div style={{ fontSize:10, color:C.muted, lineHeight:1.5, marginTop:2 }}>
                  💡 Verifique no <strong>Render → seu serviço → Environment</strong> se{' '}
                  <code style={{ background:C.surface2, padding:'1px 4px', borderRadius:3 }}>CF_API_TOKEN</code>{' '}
                  está salvo e se o serviço foi <strong>redeploy</strong> após salvar as variáveis.
                </div>
              )}
              {dados.etapa === 'env' && (
                <div style={{ fontSize:10, color:C.muted, lineHeight:1.5, marginTop:2 }}>
                  💡 Adicione no <strong>Render → Environment</strong>:{' '}
                  {(dados.faltando || []).map(v => (
                    <code key={v} style={{ background:C.surface2, padding:'1px 4px', borderRadius:3, marginRight:4 }}>{v}</code>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rodapé com timestamp e botão re-testar */}
          <div style={{
            borderTop:`1px solid ${C.border}`,
            padding:`${SPACE.sm}px ${SPACE.lg}px`,
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}>
            <span style={{ fontSize:10, color:C.muted }}>
              {dados.checadoEm && `Verificado às ${new Date(dados.checadoEm).toLocaleTimeString('pt-BR')}`}
            </span>
            <DSBtn variant="ghost" style={{ fontSize:10, padding:'2px 8px' }} onClick={checar} disabled={loading}>
              {loading ? <AdminIcon name="spinSm" size={10} /> : '↻'} Re-testar
            </DSBtn>
          </div>
        </div>
        </>
      )}
    </div>
  )
}

/* ── Aba R2 completa ─────────────────────────────────────────── */
function AbaR2() {
  const { projetos, total, bucket, loading, erro, aviso, carregar } = useProjetosR2()
  const [showUpload,    setShowUpload]    = useState(false)
  const [projetoCommit, setProjetoCommit] = useState(null)
  const [explorando,    setExplorando]    = useState(null)

  function abrirCommit(projeto) { setProjetoCommit(projeto); setShowUpload(true) }
  function fecharModal()        { setShowUpload(false); setProjetoCommit(null) }

  async function deletar(projeto) {
    if (!confirm(`Remover "${projeto.nome}" do R2? Remove todos os ${projeto.totalArquivos} arquivos. Irreversível.`)) return
    try {
      await projetosService.deletarR2(projeto.nome)
      toast.success(`Projeto "${projeto.nome}" removido do R2`)
      carregar()
    } catch (err) {
      toast.error(err.message || 'Erro ao remover projeto do R2')
    }
  }

  if (explorando) return (
    <ExploradorR2 projeto={explorando} onFechar={() => setExplorando(null)} />
  )

  return (
    <div>
      {/* ── Cabeçalho ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${SPACE.xl}px 0`, marginBottom: SPACE.xl,
        borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', gap: SPACE.md,
      }}>
        <div>
          <div style={{ fontSize: FONT.md, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{ color: CF_ORANGE }}>☁️</span> Projetos no Cloudflare R2
          </div>
          <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 2 }}>
            {bucket
              ? <>Bucket: <code style={{ fontSize: FONT.xs, background: C.surface2, padding: '1px 5px', borderRadius: 3 }}>{bucket}</code></>
              : 'Configure CF_R2_BUCKET no backend'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'center', flexWrap: 'wrap' }}>
          <TestarR2 />
          <DSBtn variant="secondary" onClick={() => carregar()} disabled={loading}>
            <AdminIcon name="refresh" size={13} /> Atualizar
          </DSBtn>
          <DSBtn
            variant="primary"
            style={{ background: CF_ORANGE, borderColor: CF_ORANGE }}
            onClick={() => { setProjetoCommit(null); setShowUpload(true) }}
          >
            <AdminIcon name="save" size={13} /> Publicar ZIP
          </DSBtn>
        </div>
      </div>

      {/* Aviso de credenciais não configuradas */}
      {aviso && (
        <div style={{
          padding: `${SPACE.lg}px ${SPACE.xl}px`, borderRadius: RADIUS.lg,
          background: `${CF_ORANGE}12`, border: `1px solid ${CF_ORANGE}40`,
          color: CF_ORANGE, fontSize: FONT.sm, marginBottom: SPACE.xl,
          display: 'flex', flexDirection: 'column', gap: SPACE.sm,
        }}>
          <strong>Credenciais R2 não configuradas</strong>
          <span>{aviso}</span>
          <div style={{ fontSize: FONT.xs, marginTop: 4 }}>
            Adicione as variáveis no <code>.env</code> do backend:
            <br />
            <code>CF_ACCOUNT_ID</code> · <code>CF_API_TOKEN</code> · <code>CF_R2_BUCKET</code>
          </div>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div style={{
          padding: `${SPACE.lg}px ${SPACE.xl}px`, borderRadius: RADIUS.lg,
          background: `${C.red}12`, border: `1px solid ${C.red}30`,
          color: C.red, fontSize: FONT.sm, marginBottom: SPACE.xl,
        }}>
          {erro}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2, gap: SPACE.md, color: C.muted }}>
          <AdminIcon name="spinSm" size={16} /> Carregando projetos…
        </div>
      )}

      {/* Lista vazia */}
      {!loading && !aviso && projetos.length === 0 && (
        <DSEmptyState
          icon={<span style={{ fontSize: 32 }}>☁️</span>}
          title="Nenhum projeto no R2"
          message="Publique um arquivo .zip para armazenar um projeto no Cloudflare R2."
          action={
            <DSBtn
              variant="primary"
              style={{ background: CF_ORANGE, borderColor: CF_ORANGE }}
              onClick={() => { setProjetoCommit(null); setShowUpload(true) }}
            >
              <AdminIcon name="save" size={13} /> Publicar ZIP
            </DSBtn>
          }
        />
      )}

      {/* Grid de cards */}
      {!loading && projetos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: SPACE.xl,
        }}>
          {projetos.map(p => (
            <CardR2
              key={p.nome}
              projeto={p}
              onCommit={abrirCommit}
              onExplorar={setExplorando}
              onDeletar={deletar}
            />
          ))}
        </div>
      )}

      {/* Modal de upload/commit */}
      {showUpload && (
        <UploadR2Modal
          nomeProjeto={projetoCommit?.nome || ''}
          onClose={fecharModal}
          onSuccess={carregar}
        />
      )}
    </div>
  )
}

/* ── Aba GridFS completa ─────────────────────────────────────── */
function AbaGridFS() {
  const { projetos, total, loading, erro, carregar } = useProjetosGridFS()
  const [busca,             setBusca]             = useState('')
  const [showUpload,        setShowUpload]        = useState(false)
  const [projetoCommit,     setProjetoCommit]     = useState(null)
  const [projetoUpload,     setProjetoUpload]     = useState(null)
  const [explorandoProjeto, setExplorandoProjeto] = useState(null)

  // Modal de confirmação temático
  const [confirmando,  setConfirmando]  = useState(null)   // projeto aguardando confirm

  // Commit pendente após upload
  const [pendingCommit, setPendingCommit] = useState(null)  // nome do projeto para abrir sync

  // Deleção SSE ao vivo
  const [deletando,    setDeletando]    = useState(null)
  const [logDeletar,   setLogDeletar]   = useState([])
  const [statusDeletar,setStatusDeletar]= useState(null)
  const [progressoDel, setProgressoDel] = useState(0)
  const logEndRef = useRef(null)

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logDeletar])

  const projetosFiltrados = projetos.filter(p =>
    !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase())
  )

  function abrirCommitGitHub(projeto) { setProjetoCommit(projeto) }
  function fecharCommit()             { setProjetoCommit(null) }
  function abrirUpload(projeto)       { setProjetoUpload(projeto); setShowUpload(true) }
  function fecharUpload()             { setShowUpload(false); setProjetoUpload(null) }

  const [baixando, setBaixando] = useState(false)

  async function baixarGridFS(projeto) {
    if (baixando) return
    setBaixando(true)
    try {
      const res = await fetch(`${BASE_URL}/projetos/gridfs/${encodeURIComponent(projeto.nome)}/download`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.erro || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const a    = Object.assign(document.createElement('a'), {
        href:     URL.createObjectURL(blob),
        download: `${projeto.nome}.zip`,
      })
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success(`"${projeto.nome}.zip" baixado!`)
    } catch (err) {
      toast.error(`Erro ao baixar: ${err.message}`)
    } finally {
      setBaixando(false)
    }
  }

  // Abre modal de confirmação temático (sem confirm() nativo)
  function deletar(projeto) { setConfirmando(projeto) }

  async function confirmarDelecao() {
    const projeto = confirmando
    setConfirmando(null)
    setDeletando(projeto.nome)
    setLogDeletar([])
    setStatusDeletar('running')
    setProgressoDel(0)

    try {
      const res = await fetch(`${BASE_URL}/projetos/gridfs/${encodeURIComponent(projeto.nome)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.body) throw new Error('Servidor não suporta streaming neste ambiente')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim()
          if (!line) continue
          try {
            const ev = JSON.parse(line)
            if (ev.tipo === 'narration') {
              setLogDeletar(prev => [...prev, { msg: ev.msg, nivel: ev.nivel || 'info', ts: ev.ts }])
            } else if (ev.tipo === 'progress') {
              setProgressoDel(ev.pct || 0)
            } else if (ev.tipo === 'done') {
              setProgressoDel(100)
              setStatusDeletar(ev.status)
              if (ev.status === 'success') {
                toast.success(`"${projeto.nome}" removido (${ev.removidos} arquivo${ev.removidos !== 1 ? 's' : ''})`)
                setTimeout(() => {
                  setDeletando(null); setLogDeletar([]); setStatusDeletar(null); setProgressoDel(0)
                  carregar()
                }, 1600)
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      setLogDeletar(prev => [...prev, { msg: err.message, nivel: 'error', ts: Date.now() }])
      setStatusDeletar('error')
      toast.error(err.message)
    }
  }

  if (explorandoProjeto) return (
    <ExploradorGridFS projeto={explorandoProjeto} onFechar={() => setExplorandoProjeto(null)} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>

      {/* ── Cabeçalho ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        paddingBottom: SPACE.xl, borderBottom: `1px solid ${C.border}`,
        flexWrap: 'wrap', gap: SPACE.md,
      }}>
        <div>
          <div style={{ fontSize: FONT.md, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#22c55e' }}>🗄️</span>
            Projetos · GridFS
          </div>
          <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 2 }}>
            {total > 0 ? `${total} projeto${total !== 1 ? 's' : ''} no MongoDB GridFS` : 'Nenhum projeto'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
          <DSBtn variant="ghost" onClick={carregar} disabled={loading} title="Atualizar">
            <AdminIcon name="refresh" size={13} />
          </DSBtn>
          <DSBtn variant="primary" onClick={() => abrirUpload(null)}>
            <AdminIcon name="save" size={13} /> Upload ZIP
          </DSBtn>
        </div>
      </div>

      {/* ── Busca ─────────────────────────────────────────── */}
      {!loading && projetos.length > 0 && (
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: C.muted, pointerEvents: 'none' }}>
            <AdminIcon name="search" size={13} />
          </span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar projeto…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px 8px 34px',
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: RADIUS.md, color: C.text, fontSize: FONT.base, outline: 'none',
            }} />
        </div>
      )}

      {erro && (
        <div style={{ padding: '10px 14px', borderRadius: RADIUS.md,
          background: `${C.red}12`, border: `1px solid ${C.red}30`, color: C.red, fontSize: FONT.sm }}>
          {erro}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.xl2,
          gap: SPACE.md, color: C.muted, fontSize: FONT.sm }}>
          <AdminIcon name="spinSm" size={16} /> Carregando projetos…
        </div>
      )}

      {!loading && projetos.length === 0 && (
        <DSEmptyState
          icon={<AdminIcon name="layers" size={32} />}
          title="Nenhum projeto no GridFS"
          message="Faça upload de um .zip para armazenar um projeto no MongoDB GridFS."
          action={
            <DSBtn variant="primary" onClick={() => abrirUpload(null)}>
              <AdminIcon name="save" size={13} /> Upload ZIP
            </DSBtn>
          }
        />
      )}

      {!loading && projetosFiltrados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
          {projetosFiltrados.map(p => (
            <CardGridFS key={p.nome} projeto={p}
              onAbrir={setExplorandoProjeto}
              onDeletar={deletar}
              onCommit={abrirCommitGitHub}
              onUpload={abrirUpload}
              onDownload={baixarGridFS}
            />
          ))}
        </div>
      )}

      {!loading && projetos.length > 0 && projetosFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', color: C.muted, padding: SPACE.xl2, fontSize: FONT.sm }}>
          Nenhum projeto encontrado para "<strong>{busca}</strong>"
        </div>
      )}

      {showUpload && (
        <UploadGridFSModal
          nomeProjeto={projetoUpload?.nome || ''}
          onClose={fecharUpload}
          onSuccess={() => carregar()}
          onCommit={nomeProjeto => {
            fecharUpload()
            carregar()
            setPendingCommit(nomeProjeto)
          }}
        />
      )}

      {/* ── Modal: Commit & Push (via card ou pós-upload) ─── */}
      {(projetoCommit || pendingCommit) && (
        <ProjetoSyncModal
          projeto={projetoCommit || projetos.find(p => p.nome === pendingCommit) || { nome: pendingCommit }}
          fonte="gridfs"
          onClose={() => { fecharCommit(); setPendingCommit(null) }}
          onSynced={() => { fecharCommit(); setPendingCommit(null); carregar() }}
        />
      )}

      {/* ── Modal de confirmação temático ─────────────────── */}
      {confirmando && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1001,
          background: 'rgba(0,0,0,.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.red}40`,
            borderRadius: RADIUS.xl, padding: SPACE.xl2,
            width: '100%', maxWidth: 380,
            display: 'flex', flexDirection: 'column', gap: SPACE.lg,
            boxShadow: `0 0 0 1px ${C.red}20, 0 16px 40px rgba(0,0,0,.4)`,
          }}>
            {/* Ícone + título */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.md }}>
              <div style={{
                width: 38, height: 38, borderRadius: RADIUS.lg, flexShrink: 0,
                background: `${C.red}15`, border: `1px solid ${C.red}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AdminIcon name="trash" size={16} style={{ color: C.red }} />
              </div>
              <div>
                <div style={{ fontSize: FONT.md, fontWeight: 700, color: C.text }}>
                  Remover projeto
                </div>
                <div style={{ fontSize: FONT.sm, color: C.muted, marginTop: 2 }}>
                  Esta ação não pode ser desfeita
                </div>
              </div>
            </div>

            {/* Info do projeto */}
            <div style={{
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: RADIUS.md, padding: `${SPACE.md}px ${SPACE.lg}px`,
            }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.base, marginBottom: 4 }}>
                {confirmando.nome}
              </div>
              <div style={{ fontSize: FONT.sm, color: C.muted }}>
                <span style={{ color: C.red }}>🗑</span>{' '}
                {confirmando.totalArquivos} arquivo{confirmando.totalArquivos !== 1 ? 's' : ''} serão apagados
                {confirmando.tamanhoTotal > 0 && ` · ${fmtBytes(confirmando.tamanhoTotal)}`}
              </div>
              <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 3, fontFamily: 'monospace' }}>
                gridfs:{confirmando.nome}
              </div>
            </div>

            {/* Aviso */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: SPACE.sm,
              background: `${C.red}08`, border: `1px solid ${C.red}25`,
              borderRadius: RADIUS.md, padding: `${SPACE.sm}px ${SPACE.md}px`,
              fontSize: FONT.xs, color: C.red, lineHeight: '15px',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              Todos os arquivos serão removidos permanentemente do MongoDB GridFS. Não há como recuperar depois.
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: SPACE.md }}>
              <DSBtn variant="ghost" style={{ flex: 1 }}
                onClick={() => setConfirmando(null)}>
                Cancelar
              </DSBtn>
              <DSBtn
                style={{
                  flex: 1, background: C.red, borderColor: C.red, color: '#fff',
                  fontWeight: 700,
                }}
                onClick={confirmarDelecao}
              >
                <AdminIcon name="trash" size={12} />
                Remover projeto
              </DSBtn>
            </div>
          </div>
        </div>
      )}

      {/* ── Painel de narração: Deleção ao vivo ──────────── */}
      {deletando && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: RADIUS.xl, padding: SPACE.xl2,
            width: '100%', maxWidth: 440,
            display: 'flex', flexDirection: 'column', gap: SPACE.lg,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
              {statusDeletar === 'running'
                ? <AdminIcon name="spinSm" size={16} style={{ color: C.red }} />
                : <AdminIcon name={statusDeletar === 'success' ? 'checkLg' : 'trash'} size={16}
                    style={{ color: statusDeletar === 'success' ? C.greenSolid : C.red }} />
              }
              <div>
                <span style={{ fontWeight: 700, color: C.text, fontSize: FONT.md }}>
                  {statusDeletar === 'success' ? 'Removido com sucesso' :
                   statusDeletar === 'error'   ? 'Erro na remoção' :
                   `Removendo "${deletando}"…`}
                </span>
                {statusDeletar === 'running' && (
                  <div style={{ fontSize: FONT.xs, color: C.muted, marginTop: 1 }}>
                    Apagando arquivos em lotes paralelos — pode levar alguns segundos
                  </div>
                )}
              </div>
            </div>

            {/* Barra de progresso */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: FONT.xs, color: C.muted }}>Progresso</span>
                <span style={{ fontSize: FONT.xs, fontWeight: 700,
                  color: statusDeletar === 'success' ? C.greenSolid : C.red }}>
                  {progressoDel}%
                </span>
              </div>
              <div style={{ height: 5, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${progressoDel}%`,
                  background: statusDeletar === 'success' ? C.greenSolid : `linear-gradient(90deg, ${C.red}, #f97316)`,
                  transition: 'width .4s ease',
                }} />
              </div>
            </div>

            {/* Terminal de log */}
            <div style={{
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: RADIUS.md, padding: '10px 12px',
              minHeight: 120, maxHeight: 200, overflowY: 'auto',
              fontFamily: '"SF Mono","Fira Code","Consolas",monospace',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {logDeletar.length === 0 && (
                <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Iniciando…</span>
              )}
              {logDeletar.map((ev, i) => {
                const cor = ev.nivel === 'error'   ? C.red
                          : ev.nivel === 'success' ? C.greenSolid
                          : ev.nivel === 'warn'    ? C.amber
                          : C.muted
                const pfx = ev.nivel === 'error' ? '✗' : ev.nivel === 'success' ? '✓' : ev.nivel === 'warn' ? '⚠' : '›'
                const ts  = ev.ts ? new Date(ev.ts).toLocaleTimeString('pt-BR', { hour12: false }) : ''
                return (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, lineHeight: '17px', color: cor }}>
                    <span style={{ color: C.subtle, flexShrink: 0 }}>{ts}</span>
                    <span style={{ flexShrink: 0 }}>{pfx}</span>
                    <span style={{ flex: 1, wordBreak: 'break-word' }}>{ev.msg}</span>
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: SPACE.md, justifyContent: 'flex-end' }}>
              {logDeletar.length > 0 && statusDeletar !== 'running' && (
                <button
                  onClick={() => {
                    const txt = logDeletar.map(ev => {
                      const ts  = ev.ts ? new Date(ev.ts).toLocaleTimeString('pt-BR', { hour12: false }) : ''
                      const pfx = ev.nivel === 'error' ? '✗' : ev.nivel === 'success' ? '✓' : '›'
                      return `[${ts}] ${pfx} ${ev.msg}`
                    }).join('\n')
                    const blob = new Blob([`Remoção GridFS: ${deletando}
${'─'.repeat(40)}
${txt}`], { type: 'text/plain' })
                    const a = Object.assign(document.createElement('a'), {
                      href: URL.createObjectURL(blob), download: `delete-log-${deletando}.txt`,
                    })
                    a.click(); URL.revokeObjectURL(a.href)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px',
                    background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: RADIUS.md, cursor: 'pointer', color: C.muted, fontSize: FONT.sm,
                  }}
                >
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  Log
                </button>
              )}
              {statusDeletar !== 'running' && (
                <DSBtn variant="ghost"
                  onClick={() => { setDeletando(null); setLogDeletar([]); setStatusDeletar(null); setProgressoDel(0) }}>
                  Fechar
                </DSBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function AdminProjetos() {
  const {
    projetos, total, diretorio,
    loading, erro, recarregar,
    filtroStatus, setFiltroStatus, contagens,
  } = useProjetos()

  const [projetoSync,   setProjetoSync]   = useState(null)
  const [busca,       setBusca]       = useState('')
  const [ordemCampo,  setOrdemCampo]  = useState('status')
  const [ordemAsc,    setOrdemAsc]    = useState(true)
  const [abaAtiva,    setAbaAtiva]    = useState('locais') // 'locais' | 'gridfs'

  function toggleOrdem(campo) {
    if (ordemCampo === campo) setOrdemAsc(v => !v)
    else { setOrdemCampo(campo); setOrdemAsc(true) }
  }

  const projetosFiltrados = (() => {
    const q = busca.trim().toLowerCase()
    let lista = q
      ? projetos.filter(p => p.nome.toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q))
      : [...projetos]

    lista.sort((a, b) => {
      let va, vb
      if (ordemCampo === 'nome') {
        va = a.nome.toLowerCase(); vb = b.nome.toLowerCase()
      } else if (ordemCampo === 'data') {
        va = new Date(a.ultimaAlteracao || 0).getTime()
        vb = new Date(b.ultimaAlteracao || 0).getTime()
      } else {
        const ord = { ativo: 0, pausado: 1, arquivado: 2, desconhecido: 3 }
        va = ord[a.status] ?? 3; vb = ord[b.status] ?? 3
      }
      if (va < vb) return ordemAsc ? -1 : 1
      if (va > vb) return ordemAsc ?  1 : -1
      return 0
    })
    return lista
  })()

  return (
    <div className="adm-page">

      {/* ── Header compacto — tudo numa linha ─────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: SPACE.md, marginBottom: SPACE.xl2, flexWrap: 'wrap',
      }}>
        {/* Título + sub + contador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, minWidth: 0 }}>
          <span style={{ color: C.accent }}>
            <AdminIcon name="layers" size={16} />
          </span>
          <span style={{ fontSize: FONT.md, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
            Projetos Locais
          </span>
          {diretorio && (
            <code style={{
              fontSize: 10, background: C.surface2, padding: '2px 6px',
              borderRadius: 4, color: C.muted, fontFamily: 'monospace',
              maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', display: 'inline-block',
            }}>
              {diretorio}
            </code>
          )}
          {!loading && !erro && (
            <span style={{
              fontSize: FONT.xs, fontWeight: 700, color: C.muted,
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap',
            }}>
              {projetosFiltrados.length !== total
                ? `${projetosFiltrados.length}/${total}`
                : `${total} ${total === 1 ? 'projeto' : 'projetos'}`}
            </span>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexShrink: 0 }}>
          <DSBtn variant="secondary" onClick={recarregar} disabled={loading}
            title="Atualizar lista" style={{ padding: '6px 10px', minWidth: 0 }}>
            <AdminIcon name="refresh" size={13} />
          </DSBtn>
        </div>
      </div>

      {/* ── Tab switcher: Locais | GridFS | R2 ────────── */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: SPACE.xl2,
        background: C.surf2, borderRadius: RADIUS.lg, padding: 4,
        border: `1px solid ${C.border}`, width: 'fit-content',
      }}>
        {[
          { id: 'locais',  label: '💻 Locais (Filesystem)' },
          { id: 'gridfs',  label: '☁️ Online (GridFS)'     },
          { id: 'r2',      label: '🟠 Cloudflare R2'       },
        ].map(tab => (
          <button key={tab.id} onClick={() => setAbaAtiva(tab.id)} style={{
            padding: '6px 16px', borderRadius: RADIUS.md,
            border: 'none', cursor: 'pointer', fontSize: FONT.sm, fontWeight: 700,
            background: abaAtiva === tab.id ? C.surface : 'transparent',
            color:      abaAtiva === tab.id ? C.text    : C.muted,
            boxShadow:  abaAtiva === tab.id ? '0 1px 3px #0002' : 'none',
            transition: 'all .15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── Aba Online (GridFS) ───────────────────────────── */}
      {abaAtiva === 'gridfs' && <AbaGridFS />}

      {/* ── Aba Cloudflare R2 ─────────────────────────────── */}
      {abaAtiva === 'r2' && <AbaR2 />}

      {/* ── Aba Locais (comportamento original) ──────────── */}
      {abaAtiva === 'locais' && <>

      {/* ── Barra de busca + ordenação ────────────────────── */}
      {!loading && !erro && (
        <div style={{ display: 'flex', gap: SPACE.md, flexWrap: 'wrap', alignItems: 'center', marginBottom: SPACE.lg }}>
          <div style={{ position: 'relative', flex: '1', minWidth: 180 }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
              stroke={C.muted} strokeWidth="2"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome ou descrição…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 28, paddingRight: busca ? 28 : 10,
                paddingTop: 7, paddingBottom: 7,
                fontSize: 12, color: C.text,
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 7, outline: 'none',
              }}
            />
            {busca && (
              <button onClick={() => setBusca('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
                  fontSize: 14, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            )}
          </div>

          {/* ✅ DSBtn substitui <button style={{ fontSize:FONT.sm, ..., borderRadius:7 }}> nos sort buttons */}
          {[
            { campo: 'status', label: 'Status' },
            { campo: 'nome',   label: 'Nome'   },
            { campo: 'data',   label: 'Data'   },
          ].map(({ campo, label }) => {
            const ativo = ordemCampo === campo
            return (
              <DSBtn key={campo} size="sm" variant="ghost"
                onClick={() => toggleOrdem(campo)}
                style={{
                  color:      ativo ? C.blue : C.muted,
                  background: ativo ? `${C.blue}15` : C.surface,
                  border:     `1px solid ${ativo ? C.blue + '50' : C.border}`,
                }}
              >
                {label}
                <span style={{ fontSize: 10, opacity: ativo ? 1 : 0.4 }}>
                  {ativo ? (ordemAsc ? '↑' : '↓') : '↕'}
                </span>
              </DSBtn>
            )
          })}
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────── */}
      {erro ? (
        <div style={{
          background: `${C.red}10`, border: `1px solid ${C.red}30`,
          borderRadius: RADIUS.lg, padding: '20px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: FONT.md, fontWeight: 700, color: C.red, marginBottom: 8 }}>
            Erro ao carregar projetos
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{erro}</div>
          {/* ✅ DSBtn substitui <button style={{ background:C.surf2, ... }}> */}
          <DSBtn variant="secondary" onClick={recarregar}>Tentar novamente</DSBtn>
        </div>
      ) : loading ? (
        <Skeleton />
      ) : projetos.length === 0 && contagens.todos === 0 ? (
        // ✅ DSEmptyState substitui div manual com ícone/título/descrição inline
        <DSEmptyState
          icon={<AdminIcon name="layers" size={32} />}
          title="Nenhum projeto encontrado"
          desc={<>
            Crie subdiretórios em{' '}
            <code style={{ fontSize: 10, background: C.surface2, padding: '1px 5px', borderRadius: 3 }}>
              {diretorio || '/projetos'}
            </code>{' '}
            ou configure{' '}
            <code style={{ fontSize: 10, background: C.surface2, padding: '1px 5px', borderRadius: 3 }}>
              PROJETOS_PATH
            </code>{' '}
            no .env.
          </>}
        />
      ) : (
        <>
          <FiltroChips
            atual={filtroStatus}
            onChange={setFiltroStatus}
            contagens={contagens}
          />
          {projetosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: C.muted, fontSize: 12 }}>
              {busca.trim()
                ? `Nenhum projeto encontrado para "${busca.trim()}".`
                : `Nenhum projeto com status "${filtroStatus}".`
              }
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {projetosFiltrados.map(p => (
                <ProjetoCard
                  key={p.nome}
                  projeto={p}
                  onOpenSync={setProjetoSync}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modal de GitHub Sync ─── */}
      {projetoSync && (
        <ProjetoSyncModal
          projeto={projetoSync}
          onClose={() => setProjetoSync(null)}
          onSynced={recarregar}
        />
      )}

      </> /* fim aba locais */}
    </div>
  )
}
