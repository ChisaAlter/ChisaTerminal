import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          environmentOptions: {
            jsdom: {
              resources: 'usable',
            },
          },
          include: ['src/**/*.test.ts', 'test/unit/**/*.test.ts'],
          setupFiles: ['src/test-setup.ts', 'test/setup-storage-isolation.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'jsdom',
          environmentOptions: {
            jsdom: {
              resources: 'usable',
            },
          },
          include: ['test/integration/**/*.test.ts'],
          setupFiles: ['src/test-setup.ts', 'test/setup-storage-isolation.ts'],
        },
      },
    ],
  },
})
