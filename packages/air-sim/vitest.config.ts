import { defineConfig } from 'vitest/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AtmosphereHtmlReporter from './test-recorder/atmosphere-reporter.ts';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: [new AtmosphereHtmlReporter()]
  },
});
