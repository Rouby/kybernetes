import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import styleX from 'vite-plugin-stylex';

export default defineConfig({
  plugins: [
    react({
      disableOxcRecommendation: true,
    }),
    styleX({
      aliases: {
        '@kybernetes/ui-tokens/*': [
          path.resolve(import.meta.dirname, '../../packages/ui-tokens/src/*'),
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});
