import { useTheme } from '../../context/ThemeContext'
import { TEMAS } from '../../themes'
import toast from 'react-hot-toast'
import { T as C, SPACE, RADIUS, FONT } from '../../themes/tokens'

/* ── Mini-preview de cada tema ─────────────────────────────── */
function TemaPreview({ tema }) {
  const v = tema.vars
  return (
    <div className="adm-tema-preview" style={{ background: v['--adm-bg'] }}>
      {/* barra superior */}
      <div className="adm-tema-preview-topbar" style={{ background: v['--adm-topnav-bg'] }}>
        <div className="adm-tema-preview-dot" style={{ background: v['--adm-border2'] }}/>
        <div className="adm-tema-preview-dot" style={{ background: v['--adm-border2'] }}/>
        <div className="adm-tema-preview-dot" style={{ background: v['--adm-accent'] }}/>
      </div>
      {/* corpo */}
      <div className="adm-tema-preview-body">
        {/* sidebar simulada */}
        <div style={{
          width: 28, alignSelf: 'stretch',
          background: v['--adm-surface'], borderRadius: RADIUS.xs,
          display: 'flex', flexDirection: 'column',
          gap: SPACE.xs, padding: 4,
        }}>
          {[v['--adm-accent'], v['--adm-border2'], v['--adm-border2']].map((c, i) => (
            <div key={i} style={{ height: 4, borderRadius: 2, background: c }}/>
          ))}
        </div>
        {/* conteúdo */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          {/* stat cards */}
          <div style={{ display: 'flex', gap: SPACE.xs }}>
            {[0, 1].map(i => (
              <div key={i} className="adm-tema-preview-card"
                style={{ background: v['--adm-surface'], border: `1px solid ${v['--adm-border']}` }}/>
            ))}
          </div>
          {/* tabela */}
          <div style={{
            flex: 1, background: v['--adm-surface'],
            borderRadius: RADIUS.xs, border: `1px solid ${v['--adm-border']}`,
          }}/>
          {/* accent bar */}
          <div style={{ height: 5, borderRadius: 3, background: v['--adm-accent'], width: '60%' }}/>
        </div>
      </div>
    </div>
  )
}

/* ── Paleta de cores (swatches) ────────────────────────────── */
function PaletaSwatches({ vars }) {
  const keys = [
    '--adm-bg', '--adm-surface', '--adm-accent',
    '--adm-text', '--adm-muted', '--adm-border',
  ]
  return (
    <div style={{ display: 'flex', gap: SPACE.sm, marginTop: 10, flexWrap: 'wrap' }}>
      {keys.map(k => (
        <div key={k} title={k} style={{
          width: 20, height: 20, borderRadius: RADIUS.xs,
          background: vars[k],
          border: '1px solid rgba(0,0,0,.08)',
          flexShrink: 0,
        }}/>
      ))}
    </div>
  )
}

/* ── Página principal ──────────────────────────────────────── */
export default function AdminTemas() {
  const { temaId, mudarTema } = useTheme()

  function selecionar(id) {
    mudarTema(id)
    toast.success('Tema aplicado!')
  }

  return (
    <>
      <div className="adm-page-header">
        <div>
          <div className="adm-page-title">Temas</div>
          <div className="adm-page-sub">Personalize a aparência do painel administrativo</div>
        </div>
      </div>

      {/* Aviso de persistência */}
      <div style={{
        background: 'rgba(var(--adm-accent-rgb,107,124,78),.08)',
        border: '1px solid rgba(var(--adm-accent-rgb,107,124,78),.2)',
        borderRadius: RADIUS.lg, padding: '12px 16px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 24,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--adm-accent)" strokeWidth="2"
          width="16" height="16" style={{ marginTop: 1, flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style={{ fontSize: FONT.md, color: 'var(--adm-muted)', lineHeight: 1.5, margin: 0 }}>
          O tema selecionado é salvo por navegador e aplicado automaticamente ao abrir o painel.
          Para adicionar novos temas, crie um arquivo em <code style={{
            fontFamily: 'var(--adm-mono)', fontSize: FONT.sm,
            background: 'rgba(var(--adm-accent-rgb,107,124,78),.1)',
            padding: '1px 5px', borderRadius: RADIUS.xs,
          }}>frontend/src/themes/</code> e registre em <code style={{
            fontFamily: 'var(--adm-mono)', fontSize: FONT.sm,
            background: 'rgba(var(--adm-accent-rgb,107,124,78),.1)',
            padding: '1px 5px', borderRadius: RADIUS.xs,
          }}>themes/index.js</code>.
        </p>
      </div>

      {/* Grid de temas */}
      <div className="adm-tema-grid">
        {TEMAS.map(tema => {
          const ativo = tema.id === temaId
          return (
            <button
              key={tema.id}
              onClick={() => selecionar(tema.id)}
              className={`adm-tema-card${ativo ? ' ativo' : ''}`}
              aria-pressed={ativo}
              aria-label={`Aplicar tema ${tema.nome}`}
              style={{ textAlign: 'left' }}
            >
              {/* Preview visual */}
              <TemaPreview tema={tema} />

              {/* Info */}
              <div className="adm-tema-info">
                <div className="adm-tema-nome">
                  <span>{tema.icone}</span>
                  <span>{tema.nome}</span>
                  {ativo && (
                    <span className="adm-tema-ativo-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" width="10" height="10">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Ativo
                    </span>
                  )}
                </div>
                <div className="adm-tema-desc">{tema.descricao}</div>
                <PaletaSwatches vars={tema.vars} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Seção: como adicionar temas */}
      <div className="adm-card" style={{ marginTop: 28, padding: '20px 24px' }}>
        <div style={{ fontSize: FONT.lg - 1, fontWeight: 700, color: 'var(--adm-text)', marginBottom: 10 }}>
          🎨 Como adicionar um novo tema
        </div>
        <ol style={{
          fontSize: FONT.md, color: 'var(--adm-muted)', lineHeight: 1.9,
          paddingLeft: 18, margin: 0,
        }}>
          <li>Crie <code style={codeStyle}>src/themes/meutema.js</code> exportando um objeto com <code style={codeStyle}>id</code>, <code style={codeStyle}>nome</code>, <code style={codeStyle}>descricao</code>, <code style={codeStyle}>icone</code> e <code style={codeStyle}>vars</code>.</li>
          <li>Importe e adicione ao array <code style={codeStyle}>TEMAS</code> em <code style={codeStyle}>src/themes/index.js</code>.</li>
          <li>O tema aparece automaticamente nesta página e pode ser aplicado com um clique.</li>
        </ol>
        <div style={{
          marginTop: 16, background: 'var(--adm-surface2)',
          border: '1px solid var(--adm-border)', borderRadius: RADIUS.md,
          padding: '14px 16px', fontFamily: 'var(--adm-mono)',
          fontSize: FONT.base, color: 'var(--adm-text)', lineHeight: 1.7,
          whiteSpace: 'pre', overflowX: 'auto',
        }}>{`const meuTema = {
  id: 'meu-tema',
  nome: 'Meu Tema',
  descricao: 'Descrição do tema.',
  icone: '🌿',
  vars: {
    '--adm-bg':       '#f5f5f0',
    '--adm-surface':  '#ffffff',
    '--adm-accent':   '#7c6b4e',
    // ... (ver light.js para a lista completa)
  },
}
export default meuTema`}
        </div>
      </div>
    </>
  )
}

const codeStyle = {
  fontFamily: 'var(--adm-mono)', fontSize: FONT.sm,
  background: 'rgba(var(--adm-accent-rgb,107,124,78),.1)',
  padding: '1px 5px', borderRadius: RADIUS.xs,
  color: 'var(--adm-text)',
}
