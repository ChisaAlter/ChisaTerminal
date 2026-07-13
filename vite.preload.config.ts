import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    outDir: 'dist/main/preload',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        format: 'cjs',
        exports: 'default',
      },
    },
    ssr: true,
    minify: false,
  },
})
