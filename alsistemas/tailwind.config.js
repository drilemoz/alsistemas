/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50:  '#f0fdf4',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',   // ← Adicionado
          400: '#34d399',   // ← Adicionado
          500: '#2D6A4F',
          600: '#1B5E3B',
          700: '#154D30',
          800: '#0F3D23',
          900: '#0A2D18',
        },
        accent: {
          300: '#95D97A',
          400: '#74C069',
          500: '#52A846',
        },
        sand: {
          50:  '#FAFAF7',
          100: '#F4F4EF',
        },
        brand: {
          50:  '#fff5f0',
          100: '#ffdecf',
          300: '#ffb899',
          500: '#ff5c00',
          600: '#e05200',
          700: '#c44700',
        },
      },
      fontFamily: {
        heading:  ['"Nunito"',         'sans-serif'],
        body:     ['"Nunito"',         'sans-serif'],
        script:   ['"Lora"',           'Georgia', 'serif'],
        display:  ['"Fraunces"',       'Georgia', 'serif'],
        grotesk:  ['"Space Grotesk"',  'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out both',
        'slide-up':   'slideUp 0.6s ease-out both',
        'slide-right':'slideRight 0.5s ease-out both',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:     { from: { opacity: '0', transform: 'translateY(28px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight:  { from: { opacity: '0', transform: 'translateX(-20px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
}