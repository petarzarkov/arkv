import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prand from 'pure-rand';
import { MersenneTwister19937, Random } from 'random-js';
import seedrandom from 'seedrandom';
import { initArkvRng, Rng } from './src/index.js';

const SEED = 12345;
const N = 100_000;

// ── Table helpers ──────────────────────────────────────────────────────────────

interface Result {
  label: string;
  ms: number;
}

const LW = 44; // label column inner width (including surrounding spaces)
const MW = 10; // ms column
const OW = 16; // ops/sec column
const SW = 10; // slowdown column

const hr = (l: string, m: string, r: string): string =>
  `${l}${'─'.repeat(LW)}${m}${'─'.repeat(MW)}${m}${'─'.repeat(OW)}${m}${'─'.repeat(SW)}${r}`;

// Buffer to capture table output for the README
const outputBuffer: string[] = [];

function out(msg: string) {
  console.log(msg);
  outputBuffer.push(msg);
}

function printTable(title: string, rows: Result[]): void {
  const best = Math.min(...rows.map(r => r.ms));

  out(`\n${title}  (N=${N.toLocaleString('en-US')})`);
  out(hr('┌', '┬', '┐'));
  out(
    `│ ${'Library'.padEnd(LW - 2)} │ ${'ms'.padStart(MW - 2)} │ ${'ops/sec'.padStart(OW - 2)} │ ${'slowdown'.padStart(SW - 2)} │`,
  );
  out(hr('├', '┼', '┤'));
  for (const { label, ms } of rows) {
    const ops = Math.round((N / ms) * 1000).toLocaleString(
      'en-US',
    );
    const ratio = ms / best;
    const slow =
      ratio < 1.005 ? 'fastest' : `${ratio.toFixed(2)}x`;
    out(
      `│ ${label.padEnd(LW - 2)} │ ${ms.toFixed(2).padStart(MW - 2)} │ ${ops.padStart(OW - 2)} │ ${slow.padStart(SW - 2)} │`,
    );
  }
  out(hr('└', '┴', '┘'));
}

/** Run fn once for warmup, then return the time of a second run. */
function bench(fn: () => void): number {
  fn();
  const t = performance.now();
  fn();
  return performance.now() - t;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await initArkvRng();
  console.log(
    `\n🏎️  @arkv/rng benchmark  ·  N=${N.toLocaleString('en-US')} iterations`,
  );

  const arkvRng = new Rng(SEED);
  const srRng = seedrandom(SEED.toString());

  // ── 1. Sequential u32 integer ────────────────────────────────────────────
  printTable('1 · Sequential u32 Integer', [
    {
      label: '@arkv/rng  · Rng.int()',
      ms: bench(() => {
        for (let i = 0; i < N; i++) arkvRng.int();
      }),
    },
    {
      label: 'Math.random() †',
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(Math.random() * 4294967296);
      }),
    },
    {
      label: 'seedrandom',
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(srRng() * 4294967296);
      }),
    },
    {
      label: 'pure-rand  · xoroshiro128+',
      ms: bench(() => {
        let s = prand.xoroshiro128plus(SEED);
        for (let i = 0; i < N; i++) {
          const [, next] = prand.uniformIntDistribution(
            0,
            4294967295,
            s,
          );
          s = next;
        }
      }),
    },
    {
      label: 'random-js  · MersenneTwister',
      ms: bench(() => {
        const rnd = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++)
          rnd.integer(0, 4294967295);
      }),
    },
  ]);

  // ── 2. Batched u32 array ─────────────────────────────────────────────────
  printTable('2 · Batched u32 Array (100 k elements)', [
    {
      label: '@arkv/rng  · Rng.ints(N)  [native batch]',
      ms: bench(() => arkvRng.ints(N)),
    },
    {
      label: 'Math.random()  loop †',
      ms: bench(() => {
        const arr = new Uint32Array(N);
        for (let i = 0; i < N; i++)
          arr[i] = Math.floor(Math.random() * 4294967296);
      }),
    },
    {
      label: 'pure-rand  loop',
      ms: bench(() => {
        const arr = new Uint32Array(N);
        let s = prand.xoroshiro128plus(SEED);
        for (let i = 0; i < N; i++) {
          const [v, next] = prand.uniformIntDistribution(
            0,
            4294967295,
            s,
          );
          arr[i] = v;
          s = next;
        }
      }),
    },
    {
      label: 'random-js  loop',
      ms: bench(() => {
        const arr = new Uint32Array(N);
        const rnd = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++)
          arr[i] = rnd.integer(0, 4294967295);
      }),
    },
    {
      label: 'crypto.getRandomValues()  [bulk fill] †',
      ms: bench(() =>
        crypto.getRandomValues(new Uint32Array(N)),
      ),
    },
  ]);

  // ── 3. Float [0, 1) ──────────────────────────────────────────────────────
  printTable('3 · Float [0, 1)', [
    {
      label: '@arkv/rng  · Rng.floats(N)  [native batch]',
      ms: bench(() => arkvRng.floats(N)),
    },
    {
      label: 'Math.random() †',
      ms: bench(() => {
        for (let i = 0; i < N; i++) Math.random();
      }),
    },
    {
      label: '@arkv/rng  · Rng.float()  [single]',
      ms: bench(() => {
        for (let i = 0; i < N; i++) arkvRng.float();
      }),
    },
    {
      label: 'seedrandom',
      ms: bench(() => {
        for (let i = 0; i < N; i++) srRng();
      }),
    },
    {
      label: 'random-js  · Random.real(0, 1)',
      ms: bench(() => {
        const rnd = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++) rnd.real(0, 1);
      }),
    },
  ]);

  // ── 4. Bounded range [1, 1000) ───────────────────────────────────────────
  printTable('4 · Bounded Range [1, 1000)', [
    {
      label: '@arkv/rng  · Rng.ranges(1,1000,N) [batch]',
      ms: bench(() => arkvRng.ranges(1, 1000, N)),
    },
    {
      label: 'Math.random()  + floor †',
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(Math.random() * 999) + 1;
      }),
    },
    {
      label: '@arkv/rng  · Rng.range(1, 1000)  [single]',
      ms: bench(() => {
        for (let i = 0; i < N; i++) arkvRng.range(1, 1000);
      }),
    },
    {
      label: 'seedrandom  + floor',
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(srRng() * 999) + 1;
      }),
    },
    {
      label: 'pure-rand  · uniformIntDistribution',
      ms: bench(() => {
        let s = prand.xoroshiro128plus(SEED);
        for (let i = 0; i < N; i++) {
          const [, next] = prand.uniformIntDistribution(
            1,
            999,
            s,
          );
          s = next;
        }
      }),
    },
    {
      label: 'random-js  · Random.integer(1, 999)',
      ms: bench(() => {
        const rnd = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++) rnd.integer(1, 999);
      }),
    },
  ]);

  // ── 5. Array shuffle ─────────────────────────────────────────────────────
  const source = Array.from({ length: N }, (_, i) => i);

  printTable('5 · Array Shuffle (100 k elements)', [
    {
      label: '@arkv/rng  · Rng.shuffle()  [new array]',
      ms: bench(() => arkvRng.shuffle(source)),
    },
    {
      label: 'seedrandom  Fisher-Yates  [in-place]',
      ms: bench(() => {
        const arr = [...source];
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(srRng() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }),
    },
    {
      label: 'random-js  · Random.shuffle()  [in-place]',
      ms: bench(() => {
        const arr = [...source];
        new Random(MersenneTwister19937.seed(SEED)).shuffle(
          arr,
        );
      }),
    },
  ]);

  console.log();
  arkvRng.free();

  // ── Update README ────────────────────────────────────────────────────────
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const readmePath = join(__dirname, 'README.md');

  try {
    const readme = readFileSync(readmePath, 'utf8');

    // Reconstruct the entire ## Benchmark section to ensure consistency
    const benchmarkSection = `## Benchmark

Run \`bun run build:wasm && bun run bench\` to reproduce.

Compared against: \`seedrandom\`, \`pure-rand\`, \`random-js\` (Mersenne Twister),
\`Math.random()\`, and \`crypto.getRandomValues()\`.

\`\`\`text
${outputBuffer.join('\n').trim()}
\`\`\`

> † \`Math.random()\` and \`crypto.getRandomValues()\` are native V8/OS calls —
> not seedable, no reproducible sequences. Run \`bun run bench\` on your machine
> for accurate results.
`;

    // Regex to find ## Benchmark and everything after it
    const updatedReadme = readme.replace(
      /## Benchmark[\s\S]*$/,
      `${benchmarkSection.trim()}\n`,
    );

    writeFileSync(readmePath, updatedReadme);
    console.log(
      '✅ README.md updated with latest benchmark results!',
    );
  } catch (err) {
    console.error('❌ Failed to update README.md:', err);
  }
}

main();
