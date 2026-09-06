import { defineConfig } from 'vitest/config';
import AtmosphereHtmlReporter from './test-recorder/atmosphere-reporter.ts';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default', new AtmosphereHtmlReporter()],
  },
});
