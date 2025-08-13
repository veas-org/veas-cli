import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    passWithNoTests: true,
    name: 'e2e',
    include: ['src/test/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
    testTimeout: 30000, // 30 seconds for E2E tests
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially for E2E
      },
    },
    setupFiles: ['./src/test/e2e/setup.ts'],
    reporters: process.env.CI 
      ? ['default', 'json', 'junit']
      : ['default', 'html'],
    outputFile: {
      json: './test-results/e2e-results.json',
      junit: './test-results/e2e-results.xml',
      html: './test-results/e2e-report.html',
    },
    coverage: {
      enabled: false, // E2E tests don't need coverage
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});