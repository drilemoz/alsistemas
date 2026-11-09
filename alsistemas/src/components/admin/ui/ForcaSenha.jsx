/**
 * ForcaSenha.jsx — Indicador visual de força de senha.
 *
 * Uso:
 *   import ForcaSenha from './ForcaSenha'
 *   <ForcaSenha senha={form.senha} />
 *
 * Lógica de 5 níveis (extraída e unificada de AdminSetup.jsx):
 *   1 pt  → Mínimo 8 chars
 *   2 pts → 12+ chars
 *   3 pts → tem maiúscula
 *   4 pts → tem número
 *   5 pts → tem caractere especial
 */

function calcForca(senha) {
  if (!senha) return { nivel: 0, texto: '', cor: 'var(--adm-border, #334155)' }
  let pts = 0
  if (senha.length >= 8)            pts++
  if (senha.length >= 12)           pts++
  if (/[A-Z]/.test(senha))          pts++
  if (/[0-9]/.test(senha))          pts++
  if (/[^A-Za-z0-9]/.test(senha))   pts++

  if (pts <= 1) return { nivel: 1, texto: 'Muito fraca',  cor: '#ef4444' }
  if (pts === 2) return { nivel: 2, texto: 'Fraca',       cor: '#f97316' }
  if (pts === 3) return { nivel: 3, texto: 'Média',       cor: '#eab308' }
  if (pts === 4) return { nivel: 4, texto: 'Forte',       cor: 'var(--adm-accent, #6b7c4e)' }
  return              { nivel: 5, texto: 'Muito forte',  cor: '#4ade80' }
}

export default function ForcaSenha({ senha }) {
  const { nivel, texto, cor } = calcForca(senha)
  if (!senha) return null

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 99,
              background: i <= nivel ? cor : 'var(--adm-border, #334155)',
              transition: 'background .2s',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10, color: cor, fontWeight: 600 }}>{texto}</span>
    </div>
  )
}
