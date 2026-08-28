import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
