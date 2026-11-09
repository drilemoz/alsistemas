import { body, validationResult } from 'express-validator'

// ─── Helper: dispara 422 se houver erros de validação ────────────────────────
export function validar(req, res, next) {
  const erros = validationResult(req)
  if (!erros.isEmpty()) {
    return res.status(422).json({
      erro: 'Dados inválidos',
      detalhes: erros.array().map(e => ({ campo: e.path, mensagem: e.msg })),
    })
  }
  next()
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const regraLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email obrigatório')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('senha')
    .notEmpty().withMessage('Senha obrigatória')
    .isLength({ min: 8 }).withMessage('Senha deve ter ao menos 8 caracteres'),
]

// ─── Notícias ────────────────────────────────────────────────────────────────
export const regraNoticia = [
  body('titulo')
    .trim()
    .notEmpty().withMessage('Título obrigatório')
    .isLength({ max: 300 }).withMessage('Título deve ter no máximo 300 caracteres'),
  body('conteudo')
    .notEmpty().withMessage('Conteúdo obrigatório'),
  body('imagem_url')
    .optional({ nullable: true })
    .isURL().withMessage('URL da imagem inválida'),
  body('destaque')
    .optional()
    .isBoolean().withMessage('Destaque deve ser booleano')
    .toBoolean(),
  // #20 — Validação do status editorial
  body('status')
    .optional()
    .isIn(['rascunho', 'revisao', 'publicado', 'arquivado'])
    .withMessage('Status inválido. Use: rascunho, revisao, publicado ou arquivado'),
]

// ─── Categorias ──────────────────────────────────────────────────────────────
export const regraCategoria = [
  body('nome')
    .trim()
    .notEmpty().withMessage('Nome obrigatório')
    .isLength({ max: 100 }).withMessage('Nome deve ter no máximo 100 caracteres'),
  body('slug')
    .trim()
    .notEmpty().withMessage('Slug obrigatório')
    .matches(/^[a-z0-9-]+$/).withMessage('Slug deve conter apenas letras minúsculas, números e hífens'),
  body('descricao')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Descrição deve ter no máximo 200 caracteres'),
  body('cor')
    .optional({ nullable: true })
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve ser um hex válido, ex: #1B5E3B'),
]

// ─── Fontes ──────────────────────────────────────────────────────────────────
export const regraFonte = [
  body('nome')
    .trim()
    .notEmpty().withMessage('Nome da fonte obrigatório')
    .isLength({ max: 150 }).withMessage('Nome deve ter no máximo 150 caracteres'),
  body('url')
    .optional({ nullable: true })
    .isURL().withMessage('URL da fonte inválida'),
]

// ─── Notícias Externas ───────────────────────────────────────────────────────
export const regraNoticiaExterna = [
  body('titulo')
    .trim()
    .notEmpty().withMessage('Título obrigatório')
    .isLength({ max: 300 }).withMessage('Título deve ter no máximo 300 caracteres'),
  body('url_externa')
    .notEmpty().withMessage('URL externa obrigatória')
    .isURL().withMessage('URL externa inválida'),
  body('imagem_url')
    .optional({ nullable: true })
    .isURL().withMessage('URL da imagem inválida'),
  body('ordem')
    .optional()
    .isInt({ min: 0 }).withMessage('Ordem deve ser inteiro não-negativo')
    .toInt(),
]

// ─── Tópicos ─────────────────────────────────────────────────────────────────
export const regraTopico = [
  body('label')
    .trim()
    .notEmpty().withMessage('Label obrigatório')
    .isLength({ max: 100 }).withMessage('Label deve ter no máximo 100 caracteres'),
  body('link')
    .optional({ nullable: true })
    .notEmpty().withMessage('Link não pode ser vazio'),
  body('ordem')
    .optional()
    .isInt({ min: 0 }).withMessage('Ordem deve ser inteiro não-negativo')
    .toInt(),
]

// ─── Configurações ───────────────────────────────────────────────────────────
export const regraConfiguracao = [
  body('valor')
    .exists().withMessage('Valor obrigatório')
    .isString().withMessage('Valor deve ser string'),
]

export const regraConfiguracaoLote = [
  body('pares')
    .isArray({ min: 1 }).withMessage('pares deve ser um array não-vazio'),
  body('pares.*.chave')
    .trim()
    .notEmpty().withMessage('Cada par deve ter uma chave'),
  body('pares.*.valor')
    .isString().withMessage('Cada par deve ter um valor string'),
]
