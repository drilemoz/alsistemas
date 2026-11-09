/**
 * Configuração central: MongoDB, Cloudinary e Redis.
 * #9  — verificarCloudinary exposta para health check detalhado.
 * #1  — Redis inicializado aqui junto com o resto.
 */
import mongoose from 'mongoose'
import { v2 as cloudinary } from 'cloudinary'
import { iniciarRedis } from '../utils/redis.js'
import { logger } from '../utils/logger.js'

export async function conectarMongo() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  })
  logger.info('✅ MongoDB conectado')
}

export function configurarCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  logger.info('✅ Cloudinary configurado')
}

/**
 * #9 — Verifica conectividade com Cloudinary via ping da API.
 * Retorna { ok: true } ou { ok: false, erro: string }.
 */
export async function verificarCloudinary() {
  try {
    await cloudinary.api.ping()
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: err.message }
  }
}

export async function iniciarConexoes() {
  await conectarMongo()
  configurarCloudinary()
  await iniciarRedis(process.env.REDIS_URL)
}

export { cloudinary }
