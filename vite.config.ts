import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('@xterm')) return 'xterm'
          if (id.includes('i18next')) return 'i18n'
          if (id.includes('react-dom') || /[\\/]react[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
