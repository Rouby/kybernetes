import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Screenshot shots only: never part of `yarn test`. Run on demand with
    // `yarn --cwd packages/sim-core test:browser` (see AGENTS.md: browser
    // suites are the human signal, not an agent gate).
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
  },
});
