import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test-cft-project/**/*.cft.spec.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/**/*.ts'],
      exclude: [
        'packages/**/*.spec.ts',
        'packages/**/*.test.ts',
        'packages/**/*.d.ts',
        'packages/**/index.ts',
        'packages/**/interfaces/**',
        'packages/**/constants.ts',
        'packages/**/enums/**',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: './test-cft-project/coverage-report',
    },
  },
});
