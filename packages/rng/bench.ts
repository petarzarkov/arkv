import prand from 'pure-rand';
import seedrandom from 'seedrandom';
import { initArkvRng, Rng } from './src/index.js';

async function runBenchmarks() {
  await initArkvRng();

  const seed = 12345;
  const N = 100_000;
  console.log(
    `\n🏎️  Benchmarking PRNGs with N=${N} iterations ...\n`,
  );

  // --- Initialize Engines ---
  const arkvRng = new Rng(seed);
  const srRng = seedrandom(seed.toString());
  let prState = prand.xoroshiro128plus(seed);

  // --- 1. Sequential Integer Generation (0 to 2^32-1) ---
  console.log(
    '--- Sequential Integer Generation (100k) ---',
  );

  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    arkvRng.int();
  }
  const t1 = performance.now();
  console.log(
    `@arkv/rng (Wasm single) : ${(t1 - t0).toFixed(2)} ms`,
  );

  const t2 = performance.now();
  for (let i = 0; i < N; i++) {
    Math.floor(srRng() * 4294967296);
  }
  const t3 = performance.now();
  console.log(
    `seedrandom (JS float*N) : ${(t3 - t2).toFixed(2)} ms`,
  );

  const t4 = performance.now();
  for (let i = 0; i < N; i++) {
    const [, nextState] = prand.uniformIntDistribution(
      0,
      4294967295,
      prState,
    );
    prState = nextState;
  }
  const t5 = performance.now();
  console.log(
    `pure-rand (JS engine)   : ${(t5 - t4).toFixed(2)} ms\n`,
  );

  // --- 2. Batched Integer Array Generation ---
  console.log(
    '--- Batched Integer Generation (100k array) ---',
  );

  const b0 = performance.now();
  arkvRng.ints(N);
  const b1 = performance.now();
  console.log(
    `@arkv/rng (Wasm batched) : ${(b1 - b0).toFixed(2)} ms`,
  );

  // pure-rand manual batching
  const b2 = performance.now();
  const arrPR = new Uint32Array(N);
  let batchState = prand.xoroshiro128plus(seed);
  for (let i = 0; i < N; i++) {
    const [val, nextState] = prand.uniformIntDistribution(
      0,
      4294967295,
      batchState,
    );
    arrPR[i] = val;
    batchState = nextState;
  }
  const b3 = performance.now();
  console.log(
    `pure-rand (manual loop)  : ${(b3 - b2).toFixed(2)} ms\n`,
  );

  // --- 3. Shuffling a 100k Array ---
  console.log('--- Array Shuffling (100k elements) ---');

  // Setup identical arrays
  const sourceArray = Array.from(
    { length: N },
    (_, i) => i,
  );
  const target1 = [...sourceArray];
  const target2 = [...sourceArray];

  // @arkv/rng optimized Wasm indices
  const s0 = performance.now();
  arkvRng.shuffle(target1);
  const s1 = performance.now();
  console.log(
    `@arkv/rng (Wasm batched indices) : ${(s1 - s0).toFixed(2)} ms`,
  );

  // seedrandom standard Fisher-Yates implementation
  const s2 = performance.now();
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(srRng() * (i + 1));
    const tmp = target2[i];
    target2[i] = target2[j];
    target2[j] = tmp;
  }
  const s3 = performance.now();
  console.log(
    `seedrandom (JS Fisher-Yates)     : ${(s3 - s2).toFixed(2)} ms\n`,
  );

  arkvRng.free();
}

runBenchmarks();
