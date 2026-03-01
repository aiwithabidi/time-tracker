import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      'tests/integration/**',
      'tests/core/review/**',
      'src/core/session/__tests__/lifecycle-service.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
      ],
      exclude: [
        'src/core/**/index.ts',
        'src/core/**/types.ts',
        'src/core/**/__tests__/**',
        'src/core/review/**',
        'src/core/export/**',
        'src/core/session/session-service.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
})
