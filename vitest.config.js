import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
});
