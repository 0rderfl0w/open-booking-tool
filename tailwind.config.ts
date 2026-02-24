import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--accent-color, #3b82f6)',
      },
    },
  },
  plugins: [],
} satisfies Config;
