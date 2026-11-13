import { defineConfig } from 'vitest/config';
import base from './vitest.config.coverage.mts';

const b: any = base;

export default defineConfig({
  ...b,
  test: {
    ...b.test,
    include: ['packages/core/test-CFT-core-2/**/*.cft.spec.ts'],
    coverage: {
      ...b.test.coverage,
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage-cft-core',
      include: ['packages/core/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.d.ts',
        '**/*.spec.ts',
        'packages/**/test/**',
      ],
    },
  },
});
