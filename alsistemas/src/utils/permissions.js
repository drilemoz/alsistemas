/**
 * permissions.js — Grupos e permissões do sistema ALSistemas.
 *
 * Cada entrada reflete um módulo real da aplicação.
 * A chave `id` deve corresponder ao que é verificado em:
 *   - AdminLayout.jsx (perm: 'x.y')
 *   - backend/src/middleware/verificarPermissao.js
 *   - backend/src/routes/*.js (verificarPermissao('x.y'))
 */

export const GRUPOS_PERMISSOES = [
  // ── Notícias ──────────────────────────────────────────────────
  { grupo: 'Notícias', perms: [
    { id: 'noticias.ver',     label: 'Visualizar notícias' },
    { id: 'noticias.criar',   label: 'Criar notícias' },
    { id: 'noticias.editar',  label: 'Editar notícias' },
    { id: 'noticias.excluir', label: 'Excluir notícias' },
  ]},

  // ── Conteúdo editorial ────────────────────────────────────────
  { grupo: 'Conteúdo', perms: [
    { id: 'categorias.gerenciar', label: 'Categorias' },
    { id: 'fontes.gerenciar',     label: 'Fontes RSS' },
    { id: 'extras.gerenciar',     label: 'Eventos & Ônibus' },
    { id: 'modulos.gerenciar',    label: 'Módulos da Home' },
    { id: 'newsletter.gerenciar', label: 'Newsletter' },
    { id: 'arquivos.gerenciar',   label: 'Arquivos & Mídia' },
    { id: 'seo.gerenciar',        label: 'SEO' },
  ]},

  // ── Projetos & Código ─────────────────────────────────────────
  { grupo: 'Projetos', perms: [
    { id: 'projetos.ver',      label: 'Visualizar projetos' },
    { id: 'projetos.upload',   label: 'Upload (GridFS / R2)' },
    { id: 'projetos.commit',   label: 'Commit & Push para GitHub' },
    { id: 'projetos.deletar',  label: 'Remover projetos' },
    { id: 'github.gerenciar',  label: 'Repositórios GitHub' },
  ]},

  // ── Infraestrutura ────────────────────────────────────────────
  { grupo: 'Infraestrutura', perms: [
    { id: 'configuracoes.gerenciar', label: 'Configurações gerais & SEO' },
    { id: 'cloudflare.gerenciar',    label: 'Cloudflare (DNS / R2 / SSL)' },
    { id: 'cloudinary.gerenciar',    label: 'Cloudinary (imagens)' },
    { id: 'mongodb.gerenciar',       label: 'MongoDB Admin' },
    { id: 'sistema.gerenciar',       label: 'Sistema & Monitor' },
    { id: 'plataformas.gerenciar',   label: 'Plataformas externas' },
    { id: 'backup.gerenciar',        label: 'Backup do banco' },
  ]},

  // ── IA & Automação ────────────────────────────────────────────
  { grupo: 'IA & Automação', perms: [
    { id: 'ia.usar',          label: 'Usar IA Assistant' },
    { id: 'rss.gerenciar',    label: 'Importar RSS' },
  ]},

  // ── Administração ─────────────────────────────────────────────
  { grupo: 'Administração', perms: [
    { id: 'usuarios.gerenciar', label: 'Usuários & Perfis' },
    { id: 'erros.ver',          label: 'Ver Erros & Logs' },
    { id: 'erros.gerenciar',    label: 'Gerenciar Erros & Logs' },
    { id: 'auditlog.ver',       label: 'Auditoria de ações' },
    { id: 'temas.gerenciar',    label: 'Temas visuais' },
  ]},
]

/**
 * Permissões agrupadas por módulo de rota — facilita criar perfis pré-definidos.
 * Uso: PERFIS_SUGERIDOS.editor → array de ids para um perfil de editor de conteúdo.
 */
export const PERFIS_SUGERIDOS = {
  redator: [
    'noticias.ver', 'noticias.criar', 'noticias.editar',
    'categorias.gerenciar', 'arquivos.gerenciar', 'seo.gerenciar',
  ],
  editor: [
    'noticias.ver', 'noticias.criar', 'noticias.editar', 'noticias.excluir',
    'categorias.gerenciar', 'fontes.gerenciar', 'extras.gerenciar',
    'modulos.gerenciar', 'newsletter.gerenciar', 'arquivos.gerenciar',
    'seo.gerenciar', 'rss.gerenciar',
  ],
  desenvolvedor: [
    'projetos.ver', 'projetos.upload', 'projetos.commit', 'projetos.deletar',
    'github.gerenciar', 'cloudflare.gerenciar', 'cloudinary.gerenciar',
    'mongodb.gerenciar', 'sistema.gerenciar', 'plataformas.gerenciar',
    'backup.gerenciar', 'ia.usar', 'erros.ver', 'erros.gerenciar',
  ],
}
