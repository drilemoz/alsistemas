/**
 * tokens.js — Fonte única de verdade para o Design System do AL Sistemas.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  REGRA DE OURO: Toda cor, tamanho, espaçamento ou sombra        │
 * │  usada em componentes admin deve vir deste arquivo.             │
 * │  Nunca use hex hardcoded diretamente em JSX ou CSS inline.      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Uso:
 *   import { T } from '../../themes/tokens'
 *   // alias C preservado para compatibilidade com código legado:
 *   import { T as C } from '../../themes/tokens'
 *
 * Todas as cores dinâmicas usam CSS variables com fallback para o
 * tema Claro (padrão em produção). O ThemeContext sobrescreve os
 * valores via JS em runtime.
 */

// ─────────────────────────────────────────────────────────────────
// SUPERFÍCIES
// ─────────────────────────────────────────────────────────────────
const surface = {
  /** Fundo principal da página */
  bg:        'var(--adm-bg,       #f0ede8)',
  /** Fundo de cards e painéis */
  surface:   'var(--adm-surface,  #ffffff)',
  /** Fundo de inputs, linhas alternadas, sub-seções */
  surface2:  'var(--adm-surface2, #f7f5f2)',
  /** Alias: superfície elevada (ex: modais) */
  elevated:  'var(--adm-surface2, #f7f5f2)',
  /** Usado apenas no AdminSetup standalone (fora do .admin-shell) */
  pageBg:    '#0f172a',
}

// ─────────────────────────────────────────────────────────────────
// BORDAS
// ─────────────────────────────────────────────────────────────────
const border = {
  /** Borda padrão de cards e separadores */
  border:    'var(--adm-border,   #e8e3dc)',
  /** Borda em hover ou destaque secundário */
  border2:   'var(--adm-border2,  #d4cec6)',
  /** Borda em foco (inputs, campos ativos) */
  borderFoc: 'var(--adm-blue,     #2563eb)',
}

// ─────────────────────────────────────────────────────────────────
// TIPOGRAFIA
// ─────────────────────────────────────────────────────────────────
const text = {
  /** Texto principal */
  text:      'var(--adm-text,     #1c1c1e)',
  /** Texto secundário / labels */
  muted:     'var(--adm-muted,    #78716c)',
  /** Texto terciário / placeholders */
  subtle:    '#94a3b8',
}

// ─────────────────────────────────────────────────────────────────
// CORES DE ACENTO (do tema ativo)
// ─────────────────────────────────────────────────────────────────
const accent = {
  /** Acento principal do tema (verde floresta no claro) */
  accent:    'var(--adm-accent)',
  /** Acento escurecido (hover de botão primário) */
  accentD:   'var(--adm-accent-d)',
  /** Alias semântico — mesmo que accent */
  green:     'var(--adm-accent)',
}

// ─────────────────────────────────────────────────────────────────
// CORES DE ESTADO (semânticas)
// ─────────────────────────────────────────────────────────────────
const status = {
  /** Erro / destrutivo */
  red:       'var(--adm-red,      #dc2626)',
  redBg:     'rgba(220,38,38,.10)',
  redBorder: 'rgba(220,38,38,.20)',
  redDim:    '#7f1d1d',

  /** Atenção / alerta */
  amber:     'var(--adm-amber,    #d97706)',
  amberBg:   'rgba(217,119,6,.10)',
  amberBorder:'rgba(217,119,6,.20)',

  /** Informação / ação */
  blue:      'var(--adm-blue,     #2563eb)',
  blueBg:    'rgba(37,99,235,.10)',
  blueBorder:'rgba(37,99,235,.20)',

  /** Sucesso */
  greenSolid:'#22c55e',
  greenBg:   'rgba(34,197,94,.10)',
  greenBorder:'rgba(34,197,94,.20)',
}

// ─────────────────────────────────────────────────────────────────
// CORES FIXAS (não mudam com o tema)
// ─────────────────────────────────────────────────────────────────
const fixed = {
  orange:    '#f97316',
  yellow:    '#eab308',
  purple:    '#8b5cf6',
  cyan:      '#06b6d4',
  white:     '#ffffff',
  /** Verde hardcoded — botões de ação primária no AdminSetup */
  greenDk:   '#166534',
  greenHov:  '#15803d',
  greenAcc:  '#4ade80',
}

// ─────────────────────────────────────────────────────────────────
// ESCALA DE ESPAÇAMENTO (px)
// Use sempre multiplos de 4 ou 6.
// ─────────────────────────────────────────────────────────────────
export const SPACE = {
  /** 4px — gap mínimo entre ícone e label */
  xs:   4,
  /** 6px — gap denso (botões, chips) */
  sm:   6,
  /** 8px — gap padrão entre elementos inline */
  md:   8,
  /** 12px — gap interno de cards pequenos */
  lg:   12,
  /** 16px — padding padrão de cards */
  xl:   16,
  /** 20px — padding de page-sections */
  xl2:  20,
  /** 24px — padding de página */
  xl3:  24,
  /** 32px — separação de blocos */
  xl4:  32,
  /** 48px — empty-states */
  xl5:  48,
}

// ─────────────────────────────────────────────────────────────────
// ESCALA DE BORDAS ARREDONDADAS (px)
// Padroniza os 10+ valores distintos encontrados no código.
// ─────────────────────────────────────────────────────────────────
export const RADIUS = {
  /** 4px — badges, chips pequenos */
  xs:   4,
  /** 6px — botões pequenos, tags */
  sm:   6,
  /** 8px — tabs, inputs */
  md:   8,
  /** 10px — cards padrão (var(--adm-radius)) */
  lg:   10,
  /** 12px — cards de destaque */
  xl:   12,
  /** 14px — cards grandes */
  xl2:  14,
  /** 20px — pílulas / avatares */
  pill: 20,
  /** 9999px — círculo */
  full: 9999,
}

// ─────────────────────────────────────────────────────────────────
// ESCALA TIPOGRÁFICA (px)
// ─────────────────────────────────────────────────────────────────
export const FONT = {
  /** 10px — micro labels, footnotes */
  xs:    10,
  /** 11px — labels uppercase, badges, helpers */
  sm:    11,
  /** 12px — texto auxiliar, hints, timestamps */
  base:  12,
  /** 13px — texto de interface, conteúdo de tabela */
  md:    13,
  /** 15px — headings de seção */
  lg:    15,
  /** 18px — títulos de card */
  xl:    18,
  /** 20px — títulos de página */
  page:  20,
  /** 28px — valores de stat-card */
  stat:  28,
}

// ─────────────────────────────────────────────────────────────────
// SOMBRAS
// ─────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm:    'var(--adm-shadow)',
  md:    'var(--adm-shadow-md)',
}

// ─────────────────────────────────────────────────────────────────
// OBJETO PRINCIPAL — T (e alias C para compatibilidade)
// ─────────────────────────────────────────────────────────────────
export const T = {
  // superfícies
  ...surface,
  // bordas
  ...border,
  // texto
  ...text,
  // acento
  ...accent,
  // estado
  ...status,
  // fixas
  ...fixed,
}

// Alias legacy — preserva código existente que importa { T as C }
export { T as C }

// ─────────────────────────────────────────────────────────────────
// HELPERS — funções utilitárias de estilo
// ─────────────────────────────────────────────────────────────────

/**
 * Gera o estilo de um badge colorido (pill semântica).
 * @param {'red'|'amber'|'blue'|'green'|'gray'|'purple'|'orange'} variant
 */
export function badgeStyle(variant = 'gray') {
  const map = {
    red:    { color: T.red,          bg: T.redBg    },
    amber:  { color: T.amber,        bg: T.amberBg  },
    blue:   { color: T.blue,         bg: T.blueBg   },
    green:  { color: T.greenSolid,   bg: T.greenBg  },
    gray:   { color: T.muted,        bg: 'rgba(113,113,122,.12)' },
    purple: { color: T.purple,       bg: 'rgba(139,92,246,.12)'  },
    orange: { color: T.orange,       bg: 'rgba(249,115,22,.12)'  },
  }
  const { color, bg } = map[variant] || map.gray
  return {
    display: 'inline-flex', alignItems: 'center', gap: SPACE.xs,
    padding: `2px ${SPACE.sm}px`,
    borderRadius: RADIUS.xs,
    fontSize: FONT.sm, fontWeight: 700,
    color, background: bg,
    letterSpacing: '.02em',
    lineHeight: 1.5,
  }
}

/**
 * Gera o estilo de uma caixa de alerta (info box).
 * @param {'red'|'amber'|'blue'|'green'} variant
 */
export function alertBoxStyle(variant = 'blue') {
  const map = {
    red:   { color: T.red,        bg: T.redBg,    border: T.redBorder   },
    amber: { color: T.amber,      bg: T.amberBg,  border: T.amberBorder },
    blue:  { color: T.blue,       bg: T.blueBg,   border: T.blueBorder  },
    green: { color: T.greenSolid, bg: T.greenBg,  border: T.greenBorder },
  }
  const { bg, border } = map[variant] || map.blue
  return {
    display: 'flex', alignItems: 'flex-start', gap: SPACE.md,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    borderRadius: RADIUS.md,
    background: bg, border: `1px solid ${border}`,
    fontSize: FONT.base, lineHeight: 1.55,
  }
}

/**
 * Gera o estilo padrão de um card de superfície.
 * @param {{ padding?: number, radius?: number }} opts
 */
export function cardStyle({ padding = SPACE.xl, radius = RADIUS.lg } = {}) {
  return {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: radius,
    padding,
  }
}
