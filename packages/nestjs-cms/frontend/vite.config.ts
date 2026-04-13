import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-mantine': [
            '@mantine/core',
            '@mantine/hooks',
            '@mantine/dates',
          ],
          'vendor-motion': ['framer-motion'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
  },
  base: './',
});
