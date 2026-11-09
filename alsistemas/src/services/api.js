/**
 * api.js — Barrel de re-exports para compatibilidade retroativa.
 *
 * Todos os serviços foram movidos para services/domains/*.
 * Este arquivo garante que todos os imports existentes continuem
 * funcionando sem alteração:
 *
 *   import { noticiasService } from '../../services/api'  ✅ continua OK
 *   import { noticiasService } from '../../services/domains/noticias'  ✅ também OK
 */
export { authService }            from './domains/auth.js'
export { noticiasService }        from './domains/noticias.js'
export { categoriasService }      from './domains/categorias.js'
export { fontesService }          from './domains/fontes.js'
export { configuracoesService }   from './domains/configuracoes.js'
export { modulosService }         from './domains/modulos.js'
export { noticiasExternasService } from './domains/noticiasExternas.js'
export { topicosService }         from './domains/topicos.js'
export { onibusService }          from './domains/onibus.js'
export { eventosService }         from './domains/eventos.js'
export { storageService }         from './domains/storage.js'
export { newsletterService }      from './domains/newsletter.js'
export { errosService }           from './domains/erros.js'
export { setupService }           from './domains/setup.js'
export { usuariosService }        from './domains/usuarios.js'
export { backupService }          from './domains/backup.js'
export { infraestruturaService }  from './domains/infraestrutura.js'
export { rssService }             from './domains/rss.js'
export { arquivosService }       from './domains/arquivos.js'
export { healthService }         from './domains/health.js'
// Sprint 3 — novos serviços de domínio
export { githubService }         from './domains/github.js'
export { projetosService }       from './domains/projetos.js'
export { auditLogsService }      from './domains/auditLogs.js'
export { mongoService }          from './domains/mongo.js'
export { cloudflareService } from './domains/cloudflare.js'

export { securityService } from './domains/security.js'
