import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    passWithNoTests: true,
    reporters: ['default'],
  },
});
