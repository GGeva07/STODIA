import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        accent: { DEFAULT: '#2563EB', dark: '#1D4ED8', soft: '#DBEAFE' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        hand: ['Caveat', 'Segoe Print', 'Comic Sans MS', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config;
