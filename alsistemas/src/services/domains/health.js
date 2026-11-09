import { api } from './http.js'

export const healthService = {
  /** GET /api/health — MongoDB, Redis, Cloudinary, latência */
  async status() { return api('/health') },
}
