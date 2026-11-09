/**
 * routes/noticias.js
 *
 * Declaração das rotas de notícias.
 * Toda a lógica de negócio está em:
 *   controllers/noticiasController.js  — handlers HTTP
 *   services/noticiaService.js         — lógica pura (filtros, validações, populate)
 */
import { Router } from 'express'
import { body }   from 'express-validator'

import { autenticar, autenticarOpcional } from '../middleware/auth.js'
import { verificarPermissao }             from '../middleware/verificarPermissao.js'
import { regraNoticia, validar }          from '../middleware/validacoes.js'
import { auditLog }                       from '../middleware/auditLog.js'

import {
  listar,
  contagemStatus,
  buscarUm,
  criar,
  atualizar,
  mudarStatus,
  excluir,
  adicionarGaleria,
  removerGaleria,
} from '../controllers/noticiasController.js'

const router = Router()

// ─── Rotas públicas / opcionais ───────────────────────────────────────────
router.get('/',              autenticarOpcional, listar)
router.get('/contagem-status', autenticar,       contagemStatus)
router.get('/:id',           autenticarOpcional, buscarUm)

// ─── Rotas autenticadas ───────────────────────────────────────────────────
router.post(
  '/',
  autenticar, verificarPermissao('noticias.criar'), auditLog('noticias'),
  regraNoticia, validar,
  criar
)

router.put(
  '/:id',
  autenticar, verificarPermissao('noticias.editar'), auditLog('noticias'),
  regraNoticia, validar,
  atualizar
)

router.patch(
  '/:id/status',
  autenticar, verificarPermissao('noticias.editar'), auditLog('noticias'),
  [
    body('status')
      .notEmpty().withMessage('Status obrigatório')
      .isIn(['rascunho', 'revisao', 'publicado', 'arquivado'])
      .withMessage('Status inválido'),
  ],
  validar,
  mudarStatus
)

router.delete(
  '/:id',
  autenticar, verificarPermissao('noticias.excluir'), auditLog('noticias'),
  excluir
)

// ─── Galeria (#18) ────────────────────────────────────────────────────────
router.post(
  '/:id/galeria',
  autenticar, verificarPermissao('noticias.editar'), auditLog('noticias'),
  adicionarGaleria
)

router.delete(
  '/:id/galeria/:publicId',
  autenticar, verificarPermissao('noticias.excluir'), auditLog('noticias'),
  removerGaleria
)

export default router
