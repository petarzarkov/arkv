import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prand from 'pure-rand';
import { MersenneTwister19937, Random } from 'random-js';
import seedrandom from 'seedrandom';
import { Rng } from './src/index.js';

const SEED = 12345;
const N = 100_000;

// ── Table helpers ──────────────────────────────────────────────────────────────

interface Result {
  label: string;
  ms: number;
}

const LW = 54; // label column inner width
const MW = 10; // ms column
const OW = 16; // ops/sec column
const SW = 10; // slowdown column

const hr = (l: string, m: string, r: string): string =>
  `${l}${'─'.repeat(LW)}${m}${'─'.repeat(MW)}${m}${'─'.repeat(OW)}${m}${'─'.repeat(SW)}${r}`;

const outputBuffer: string[] = [];
const out = (msg: string) => {
  console.log(msg);
  outputBuffer.push(msg);
};

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
    const slow =
      ms / best < 1.005
        ? 'fastest'
        : `${(ms / best).toFixed(2)}x`;
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

/** 64-bit float in [0, 1) from a pure-rand generator (53-bit precision, mutates in-place). */
function prandFloat64(rng: prand.RandomGenerator): number {
  const g1 = prand.unsafeUniformIntDistribution(
    0,
    (1 << 26) - 1,
    rng,
  );
  const g2 = prand.unsafeUniformIntDistribution(
    0,
    (1 << 27) - 1,
    rng,
  );
  return (g1 * 2 ** 27 + g2) * 2 ** -53;
}

// ── pure-rand bench helpers (factory ensures fresh state per bench call) ───────

type PrandFactory = () => prand.RandomGenerator;

function prandIntBench(
  mk: PrandFactory,
  min: number,
  max: number,
): number {
  return bench(() => {
    let s = mk();
    for (let i = 0; i < N; i++) {
      const [, n] = prand.uniformIntDistribution(
        min,
        max,
        s,
      );
      s = n;
    }
  });
}

function prandFloatBench(mk: PrandFactory): number {
  return bench(() => {
    const s = mk();
    for (let i = 0; i < N; i++) prandFloat64(s);
  });
}

function prandShuffleBench(
  mk: PrandFactory,
  src: number[],
): number {
  return bench(() => {
    const arr = [...src];
    let s = mk();
    for (let i = N - 1; i > 0; i--) {
      const [j, n] = prand.uniformIntDistribution(0, i, s);
      s = n;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log(
    `\n🏎️  @arkv/rng benchmark  ·  N=${N.toLocaleString('en-US')} iterations`,
  );

  // @arkv/rng — one instance per algorithm
  const arkvPcg64 = new Rng(SEED, 'pcg64');
  const arkvXoroshiro = new Rng(SEED, 'xoroshiro128+');
  const arkvXorshift = new Rng(SEED, 'xorshift128+');
  const arkvMersenne = new Rng(SEED, 'mersenne');
  const arkvLcg32 = new Rng(SEED, 'lcg32');

  // seedrandom — all algorithm variants
  const srDefault = seedrandom(SEED.toString());
  const srAlea = seedrandom.alea(SEED.toString());
  const srXor128 = seedrandom.xor128(SEED.toString());
  const srTychei = seedrandom.tychei(SEED.toString());
  const srXorwow = seedrandom.xorwow(SEED.toString());
  const srXor4096 = seedrandom.xor4096(SEED.toString());
  const srXorshift7 = seedrandom.xorshift7(SEED.toString());

  // Lookup tables for map-based row generation
  const arkvInstances: Array<[string, Rng]> = [
    ['pcg64', arkvPcg64],
    ['xoroshiro128+', arkvXoroshiro],
    ['xorshift128+', arkvXorshift],
    ['mersenne', arkvMersenne],
    ['lcg32', arkvLcg32],
  ];
  const srVariants: Array<[string, () => number]> = [
    ['default/ARC4', srDefault],
    ['alea', srAlea],
    ['xor128', srXor128],
    ['tychei', srTychei],
    ['xorwow', srXorwow],
    ['xor4096', srXor4096],
    ['xorshift7', srXorshift7],
  ];
  const prandFactories: Array<[string, PrandFactory]> = [
    ['xoroshiro128+', () => prand.xoroshiro128plus(SEED)],
    ['xorshift128+', () => prand.xorshift128plus(SEED)],
    ['mersenne', () => prand.mersenne(SEED)],
    ['congruential32', () => prand.congruential32(SEED)],
  ];

  // ── 1. Sequential u32 integer ──────────────────────────────────────────────
  printTable('1 · Sequential u32 Integer', [
    ...arkvInstances.map(([algo, rng]) => ({
      label: `@arkv/rng  · ${algo}`,
      ms: bench(() => {
        for (let i = 0; i < N; i++) rng.int();
      }),
    })),
    {
      label: 'Math.random() †',
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(Math.random() * 4294967296);
      }),
    },
    ...srVariants.map(([name, rng]) => ({
      label: `seedrandom  · ${name}`,
      ms: bench(() => {
        for (let i = 0; i < N; i++)
          Math.floor(rng() * 4294967296);
      }),
    })),
    ...prandFactories.map(([name, mk]) => ({
      label: `pure-rand  · ${name}  (uniform)`,
      ms: prandIntBench(mk, 0, 4294967295),
    })),
    {
      label: 'random-js  · MersenneTwister',
      ms: bench(() => {
        const r = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++)
          r.integer(0, 4294967295);
      }),
    },
  ]);

  // ── 2. Batched u32 array ───────────────────────────────────────────────────
  printTable('2 · Batched u32 Array (100 k elements)', [
    ...arkvInstances.map(([algo, rng]) => ({
      label: `@arkv/rng  · ${algo}  [native batch]`,
      ms: bench(() => rng.ints(N)),
    })),
    {
      label: 'Math.random()  loop †',
      ms: bench(() => {
        const a = new Uint32Array(N);
        for (let i = 0; i < N; i++)
          a[i] = Math.floor(Math.random() * 4294967296);
      }),
    },
    ...prandFactories.map(([name, mk]) => ({
      label: `pure-rand  · ${name}  loop`,
      ms: bench(() => {
        const a = new Uint32Array(N);
        let s = mk();
        for (let i = 0; i < N; i++) {
          const [v, n] = prand.uniformIntDistribution(
            0,
            4294967295,
            s,
          );
          a[i] = v;
          s = n;
        }
      }),
    })),
    {
      label: 'random-js  loop',
      ms: bench(() => {
        const a = new Uint32Array(N);
        const r = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++)
          a[i] = r.integer(0, 4294967295);
      }),
    },
    {
      label: 'crypto.getRandomValues()  [bulk fill] †',
      ms: bench(() =>
        crypto.getRandomValues(new Uint32Array(N)),
      ),
    },
  ]);

  // ── 3. Float [0, 1) ────────────────────────────────────────────────────────
  printTable('3 · Float [0, 1)', [
    ...arkvInstances.map(([algo, rng]) => ({
      label: `@arkv/rng  · ${algo}  [batch]`,
      ms: bench(() => rng.floats(N)),
    })),
    {
      label: '@arkv/rng  · pcg64  [single]',
      ms: bench(() => {
        for (let i = 0; i < N; i++) arkvPcg64.float();
      }),
    },
    {
      label: 'Math.random() †',
      ms: bench(() => {
        for (let i = 0; i < N; i++) Math.random();
      }),
    },
    ...srVariants.map(([name, rng]) => ({
      label: `seedrandom  · ${name}`,
      ms: bench(() => {
        for (let i = 0; i < N; i++) rng();
      }),
    })),
    ...prandFactories.map(([name, mk]) => ({
      label: `pure-rand  · ${name}`,
      ms: prandFloatBench(mk),
    })),
    {
      label: 'random-js  · Random.real(0, 1)',
      ms: bench(() => {
        const r = new Random(
          MersenneTwister19937.seed(SEED),
        );
        for (let i = 0; i < N; i++) r.real(0, 1);
      }),
    },
  ]);

  // ── 4. Bounded range [1, 1000) — uniform ──────────────────────────────────
  printTable(
    '4 · Bounded Range [1, 1000)  — uniform distribution',
    [
      ...arkvInstances.map(([algo, rng]) => ({
        label: `@arkv/rng  · ${algo}  ranges [batch]`,
        ms: bench(() => rng.ranges(1, 1000, N)),
      })),
      {
        label: '@arkv/rng  · pcg64  range() [single]',
        ms: bench(() => {
          for (let i = 0; i < N; i++)
            arkvPcg64.range(1, 1000);
        }),
      },
      {
        label: 'Math.random()  + floor †',
        ms: bench(() => {
          for (let i = 0; i < N; i++)
            Math.floor(Math.random() * 999) + 1;
        }),
      },
      ...srVariants.map(([name, rng]) => ({
        label: `seedrandom  · ${name}  + floor`,
        ms: bench(() => {
          for (let i = 0; i < N; i++)
            Math.floor(rng() * 999) + 1;
        }),
      })),
      ...prandFactories.map(([name, mk]) => ({
        label: `pure-rand  · ${name}  uniformInt`,
        ms: prandIntBench(mk, 1, 999),
      })),
      {
        label: 'random-js  · Random.integer(1, 999)',
        ms: bench(() => {
          const r = new Random(
            MersenneTwister19937.seed(SEED),
          );
          for (let i = 0; i < N; i++) r.integer(1, 999);
        }),
      },
    ],
  );

  // ── 5. Array shuffle ───────────────────────────────────────────────────────
  const source = Array.from({ length: N }, (_, i) => i);

  printTable('5 · Array Shuffle (100 k elements)', [
    ...arkvInstances.map(([algo, rng]) => ({
      label: `@arkv/rng  · ${algo}  shuffle()`,
      ms: bench(() => rng.shuffle(source)),
    })),
    ...srVariants.map(([name, rng]) => ({
      label: `seedrandom  · ${name}  Fisher-Yates`,
      ms: bench(() => {
        const arr = [...source];
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }),
    })),
    ...prandFactories.map(([name, mk]) => ({
      label: `pure-rand  · ${name}  Fisher-Yates`,
      ms: prandShuffleBench(mk, source),
    })),
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
  arkvPcg64.free();
  arkvXoroshiro.free();
  arkvXorshift.free();
  arkvMersenne.free();
  arkvLcg32.free();

  // ── Update README ──────────────────────────────────────────────────────────
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const readmePath = join(__dirname, 'README.md');

  try {
    const readme = readFileSync(readmePath, 'utf8');
    const benchmarkSection = `## Benchmark

Run \`bun run build:wasm && bun run bench\` to reproduce.

Compared against: \`seedrandom\` (all 7 algorithm variants), \`pure-rand\` (all 4 algorithms),
\`random-js\` (Mersenne Twister), \`Math.random()\`, and \`crypto.getRandomValues()\`.

\`\`\`text
${outputBuffer.join('\n').trim()}
\`\`\`

> † \`Math.random()\` and \`crypto.getRandomValues()\` are native V8/OS calls —
> not seedable, no reproducible sequences. Run \`bun run bench\` on your machine
> for accurate results.
`;
    writeFileSync(
      readmePath,
      readme.replace(
        /## Benchmark[\s\S]*$/,
        `${benchmarkSection.trim()}\n`,
      ),
    );
    console.log(
      '✅ README.md updated with latest benchmark results!',
    );
  } catch (err) {
    console.error('❌ Failed to update README.md:', err);
  }
}

main();
