import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Serve /api/tree straight from the Vite dev server so `bun run dev` is a single
// watch-mode process — no separate API server, no proxy. Set MODULE_COST_DIR to
// point the scan at another project (defaults to this package).
function moduleCostDevApi(): Plugin {
  const targetDir = process.env.MODULE_COST_DIR ?? resolve(__dirname, '..');
  const analyzePath = resolve(__dirname, '../src/analyze.ts');
  return {
    name: 'module-cost-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.config.logger.info(`  module-cost dev API scanning ${targetDir}`);
      server.middlewares.use('/api/tree', async (_req, res) => {
        try {
          // ssrLoadModule transforms the TS and tracks it in Vite's module graph,
          // so edits to the scan/graph/metrics source hot-reload here too.
          const mod = (await server.ssrLoadModule(
            analyzePath,
          )) as typeof import('../src/analyze.ts');
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(mod.analyze(targetDir)));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'text/plain');
          res.end(
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), moduleCostDevApi()],
  build: {
    outDir: resolve(__dirname, '../dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@mantine')) return 'vendor-mantine';
          if (id.includes('d3-')) return 'vendor-d3';
        },
      },
    },
  },
  base: './',
});
