import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CostModel } from './types.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export interface RunningServer {
  url: string;
  close: () => void;
}

// Locate the built frontend. Candidates cover the shipped layout
// (dist/server.js → dist/public) and running from source (src/server.ts → ../dist/public).
function resolvePublicDir(): string | null {
  for (const rel of ['./public', '../dist/public']) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

export function startServer(
  model: CostModel,
  port: number,
  host = '127.0.0.1',
): Promise<RunningServer> {
  const publicDir = resolvePublicDir();
  const payload = JSON.stringify(model);

  const server = createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    if (rawUrl === '/api/tree') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }

    if (!publicDir) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(
        'Frontend build missing — run `bun run build` in @arkv/module-cost first.',
      );
      return;
    }

    const pathname = decodeURIComponent(rawUrl.split('?')[0]);
    let filePath = join(publicDir, normalize(pathname));
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      filePath = join(publicDir, 'index.html');
    }
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({ url: `http://${host}:${port}`, close: () => server.close() });
    });
  });
}
