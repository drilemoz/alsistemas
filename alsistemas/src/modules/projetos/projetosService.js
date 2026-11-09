/**
 * projetosService.js — Re-export do serviço de projetos para uso interno ao módulo.
 * Permite que os hooks do módulo importem sem depender do caminho de services/domains.
 */
export { projetosService } from '../../services/domains/projetos.js'
