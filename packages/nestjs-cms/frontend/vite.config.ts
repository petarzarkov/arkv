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
        manualChunks(id: string) {
          if (id.includes('@mantine')) return 'vendor-mantine';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
        },
      },
    },
  },
  base: './',
});
