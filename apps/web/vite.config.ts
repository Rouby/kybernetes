import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import styleX from 'vite-plugin-stylex';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
