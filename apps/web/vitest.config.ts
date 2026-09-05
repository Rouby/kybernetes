import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scoped to src so Playwright specs in e2e/ are never picked up by unit runs.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
