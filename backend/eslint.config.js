// eslint.config.js — ESLint v9 flat config
import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // ── Erros ────────────────────────────────────────────────
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // ── Boas práticas ────────────────────────────────────────
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'object-shorthand': ['error', 'always'],

      // ── Assíncrono ───────────────────────────────────────────
      'no-return-await': 'error',
      'require-await': 'warn',
    },
  },
  {
    // Ignora arquivos de teste (usar console livremente)
    files: ['src/__tests__/**/*.js', 'jest.setup.js'],
    rules: {
      'no-console': 'off',
    },
  },
]
