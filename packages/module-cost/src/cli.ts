#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyze } from './analyze.js';
import { openBrowser } from './open.js';
import { startServer } from './server.js';
import type { RunningServer } from './server.js';
import type { CostModel } from './types.js';

const HELP = `
  @arkv/module-cost — visualize what your node_modules cost on disk

  Usage
    npx @arkv/module-cost [options]

  Options
    --dir <path>   Project directory to analyze (default: current directory)
    --port <n>     Preferred port for the server (default: 4321)
    --no-open      Do not open the browser automatically
    --json         Print the analysis as JSON and exit (no server)
    -h, --help     Show this help
`;

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

async function listen(
  model: CostModel,
  startPort: number,
): Promise<RunningServer> {
  for (let port = startPort; port < startPort + 25; port++) {
    try {
      return await startServer(model, port);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
      throw error;
    }
  }
  throw new Error(`No free port found starting at ${startPort}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const noOpen = argv.includes('--no-open');
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== '--no-open'),
    options: {
      dir: { type: 'string' },
      port: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const targetDir = resolve(values.dir ?? process.cwd());
  if (!existsSync(join(targetDir, 'node_modules'))) {
    process.stderr.write(
      `No node_modules found in ${targetDir} — install dependencies first.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const model = analyze(targetDir);

  if (values.json) {
    process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);
    return;
  }

  const startPort = values.port ? Number(values.port) : 4321;
  const server = await listen(model, startPort);
  process.stdout.write(
    `\n  @arkv/module-cost\n  ${model.packageCount} packages · ${formatBytes(model.totalSelfSize)} on disk\n  ${server.url}\n\n  Press Ctrl+C to stop.\n\n`,
  );
  if (!noOpen) openBrowser(server.url);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
