/**
 * Middleware centralizado de verificação de permissões.
 *
 * Ordem de verificação:
 *   1. role === 'superadmin'  → passa sempre (legado para o 1º admin criado no setup)
 *   2. perfil_id com '*'      → passa sempre (Superadmin via perfil)
 *   3. perfil_id com a permissão específica → passa
 *   4. Qualquer outro         → 403
 *
 * NOTA: o bypass de role === 'admin' foi REMOVIDO intencionalmente.
 * Todos os usuários devem ter um perfil_id atribuído com permissões explícitas.
 * O role 'superadmin' é mantido apenas para o primeiro usuário criado pelo setup.
 */
export function verificarPermissao(permissao) {
  return (req, res, next) => {
    const u = req.usuario

    if (!u) return res.status(401).json({ erro: 'Não autenticado.' })

    // Superadmin via role legado (1º usuário criado pelo setup)
    if (u.role === 'superadmin') return next()

    // Sistema de perfis
    const perms = u.perfil_id?.permissoes || []
    if (perms.includes('*') || perms.includes(permissao)) return next()

    return res.status(403).json({ erro: 'Permissão insuficiente.' })
  }
}
