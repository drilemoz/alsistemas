import multer from 'multer'
import streamifier from 'streamifier'
import { cloudinary } from '../config/index.js'

// Multer guarda o arquivo em memória (sem disco, sem dependência de storage externo)
const storage = multer.memoryStorage()

const fileFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true)
  else cb(new Error('Apenas imagens são permitidas'), false)
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// Faz upload do buffer para o Cloudinary via stream (compatível com v2)
export function uploadParaCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'alsistemas/noticias',
        transformation: [{ width: 1200, height: 800, crop: 'limit', quality: 'auto' }],
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result)
      }
    )
    streamifier.createReadStream(buffer).pipe(stream)
  })
}
