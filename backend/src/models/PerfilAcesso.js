import mongoose from 'mongoose'

// Permissões disponíveis no sistema
export const PERMISSOES = {
  // Notícias
  NOTICIAS_VER:     'noticias.ver',
  NOTICIAS_CRIAR:   'noticias.criar',
  NOTICIAS_EDITAR:  'noticias.editar',
  NOTICIAS_EXCLUIR: 'noticias.excluir',
  // Categorias
  CATEGORIAS_GERENCIAR: 'categorias.gerenciar',
  // Fontes
  FONTES_GERENCIAR: 'fontes.gerenciar',
  // Eventos / Ônibus
  EXTRAS_GERENCIAR: 'extras.gerenciar',
  // Newsletter
  NEWSLETTER_GERENCIAR: 'newsletter.gerenciar',
  // SEO / Configurações
  CONFIGURACOES_GERENCIAR: 'configuracoes.gerenciar',
  // Módulos da Home
  MODULOS_GERENCIAR: 'modulos.gerenciar',
  // Usuários e perfis
  USUARIOS_GERENCIAR: 'usuarios.gerenciar',
  // Backup
  BACKUP_GERENCIAR: 'backup.gerenciar',
  // Erros / logs
  ERROS_VER:       'erros.ver',
  ERROS_GERENCIAR: 'erros.gerenciar',
  // Acesso total
  SUPERADMIN: '*',
}

/**
 * Jornalista — acesso editorial completo.
 * NÃO inclui: SEO/configurações, backup, gerenciamento de usuários, erros avançados.
 */
export const PERMISSOES_JORNALISTA = [
  PERMISSOES.NOTICIAS_VER,
  PERMISSOES.NOTICIAS_CRIAR,
  PERMISSOES.NOTICIAS_EDITAR,
  PERMISSOES.NOTICIAS_EXCLUIR,
  PERMISSOES.CATEGORIAS_GERENCIAR,
  PERMISSOES.FONTES_GERENCIAR,
  PERMISSOES.EXTRAS_GERENCIAR,
  PERMISSOES.NEWSLETTER_GERENCIAR,
  PERMISSOES.MODULOS_GERENCIAR,
  PERMISSOES.ERROS_VER,
]

/**
 * Usuário comum — sem acesso ao painel admin.
 * Reservado para uso futuro (área do leitor, comentários, favoritos, etc.).
 */
export const PERMISSOES_USUARIO = []

// Aliases de compatibilidade para arquivos que ainda usam os nomes antigos
export const PERMISSOES_EDITOR       = PERMISSOES_JORNALISTA
export const PERMISSOES_VISUALIZADOR = PERMISSOES_USUARIO

const perfilAcessoSchema = new mongoose.Schema({
  nome:       { type: String, required: true, trim: true, unique: true },
  descricao:  { type: String, default: '' },
  permissoes: { type: [String], default: [] },
  cor:        { type: String, default: '#6366f1' }, // cor do badge na UI
  sistema:    { type: Boolean, default: false },    // perfis do sistema não podem ser excluídos
}, {
  timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
})

export default mongoose.model('PerfilAcesso', perfilAcessoSchema)
