/**
 * Registro central de temas do painel admin.
 * Para adicionar um novo tema: crie o arquivo em /themes/ e importe aqui.
 */
import lightTheme  from './light'
import darkTheme   from './dark'
import oceanTheme  from './ocean'
import roseTheme   from './rose'

/** Lista ordenada de temas disponíveis */
export const TEMAS = [lightTheme, darkTheme, oceanTheme, roseTheme]

/** Mapa id → tema para acesso rápido */
export const TEMAS_MAP = Object.fromEntries(TEMAS.map(t => [t.id, t]))

/** Tema padrão ao carregar pela primeira vez */
export const TEMA_PADRAO_ID = 'light'

export { lightTheme, darkTheme, oceanTheme, roseTheme }
