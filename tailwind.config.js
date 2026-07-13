/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sidebar: 'var(--color-sidebar)',
        canvas: 'var(--color-canvas)',
        foreground: 'var(--color-foreground)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        accent: 'var(--color-accent)',
        selection: 'var(--color-selection)',
        'text-secondary': 'var(--color-text-secondary)',
      },
    },
  },
  plugins: [],
}
