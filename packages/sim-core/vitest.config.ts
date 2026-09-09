import AtmosphereHtmlReporter from '@kybernetes/air-sim/test-recorder/atmosphere-reporter.ts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Browser screenshot shots run only under vitest.browser.config.ts:
    // Chromium in the unit gate would be slow and flaky by nature.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.browser.test.ts'],
    reporters: ['default', new AtmosphereHtmlReporter()],
  },
});
