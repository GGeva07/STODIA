import type { Config } from 'tailwindcss';

// Tokens tomados del prototipo: slate + acento #2563EB, Inter + JetBrains Mono.
// Tonos de estado = T del prototipo: [fondo, texto].
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        ink: '#0F172A',
        accent: { DEFAULT: '#2563EB', dark: '#1D4ED8', soft: '#DBEAFE' },
        ok: { bg: '#DCFCE7', fg: '#15803D' },
        warn: { bg: '#FEF3C7', fg: '#B45309' },
        bad: { bg: '#FEE2E2', fg: '#B91C1C' },
        info: { bg: '#DBEAFE', fg: '#1D4ED8' },
        mute: { bg: '#F1F5F9', fg: '#475569' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        hand: ['Caveat', '"Segoe Print"', '"Comic Sans MS"', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config;
