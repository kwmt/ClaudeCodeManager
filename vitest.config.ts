import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    environmentOptions: {
      jsdom: {
        html: '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>',
        url: 'http://localhost:3000',
      },
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        'src/vite-env.d.ts',
        'src-tauri/',
        '**/*.d.ts',
        'dist/',
      ],
    },
  },
});