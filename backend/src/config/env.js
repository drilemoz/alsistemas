/**
 * #14 — Validação de variáveis de ambiente com Zod.
 * O servidor recusa a inicializar se alguma variável obrigatória estiver ausente.
 *
 * IMPORTANTE: dotenv é carregado aqui, ANTES da validação Zod.
 * Isso garante que process.env já está populado com o .env quando o schema roda.
 * Em ES Modules os imports são hoistados — por isso dotenv/config NÃO pode
 * estar só no server.js (seria executado depois deste módulo).
 *
 * AMBIENTES:
 *   production   → todas as variáveis são obrigatórias
 *   development  → todas as variáveis são obrigatórias
 *   test         → CLOUDINARY_* são opcionais (testes não fazem upload real)
 */
import 'dotenv/config'
import { z } from 'zod'

const isTest = process.env.NODE_ENV === 'test'

// Cloudinary: obrigatório em produção/dev, opcional em testes
const cloudinaryField = (nome) =>
  isTest
    ? z.string().optional().default('test-placeholder')
    : z.string().min(1, `${nome} é obrigatório`)

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
  PORT:                  z.coerce.number().default(3001),
  MONGO_URI:             z.string().min(1, 'MONGO_URI é obrigatório'),
  JWT_SECRET:            z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres'),
  JWT_EXPIRES_IN:        z.string().default('7d'),

  // Cloudinary — opcionais em NODE_ENV=test
  CLOUDINARY_CLOUD_NAME: cloudinaryField('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY:    cloudinaryField('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: cloudinaryField('CLOUDINARY_API_SECRET'),

  REDIS_URL:             z.string().default('redis://localhost:6379'),
  FRONTEND_URL:          z.string().default('http://localhost:5173'),
  ADMIN_EMAIL:           z.string().email().optional(),
  ADMIN_SENHA:           z.string().optional(),

  // Sprint 3 — GitHub Module (opcionais: graceful degradation)
  GITHUB_TOKEN:          z.string().min(1).optional(),
  GITHUB_USER:           z.string().optional(),
  GITHUB_ORG:            z.string().optional(),
  PROJETOS_PATH:         z.string().optional(),

  // Sprint 4 / Sprint 6-B — IA Assistant
  // AI_PROVIDER: 'groq' (padrão) ou 'anthropic' (legacy)
  AI_PROVIDER:           z.enum(['groq', 'anthropic']).default('groq'),
  GROQ_API_KEY:          z.string().optional(),
  GROQ_MODEL:            z.string().optional(),
  ANTHROPIC_API_KEY:     z.string().optional(),
  ANTHROPIC_MODEL:       z.string().optional(),

  // Sprint 6-B — Controle de custo da IA
  AI_MAX_TOKENS:         z.coerce.number().int().positive().default(1000),

  // Métricas Prometheus (opcional)
  METRICS_TOKEN:         z.string().optional(),
})

function validarEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Variáveis de ambiente inválidas:')
    for (const issue of parsed.error.issues) {
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

export const env = validarEnv()
