# @arkv/rng
Cryptographically correct uniform distributions!

Fastest, seedable, zero dependency, isomorphic pseudo-random number generator powered by **Rust + WebAssembly**. Works identically in Node.js, Bun, and the browser — no native compilation required.

Five PRNG algorithms are available (`pcg64`, `xoroshiro128+`, `xorshift128+`, `mersenne`, `lcg32`), all seedable with a `number`, `bigint`, or `string`. String seeds are hashed to a `u64` via FNV-1a 64-bit inside the WebAssembly layer — no JavaScript hashing.

@arkv/rng is heavily optimized for zero-overhead boundary crossing. Calling `.int()` repeatedly inside a JavaScript loop incurs microscopic overhead as execution passes between JS and WebAssembly.

To bypass this for large datasets, use the batch methods: `.ints(N)`, `.floats(N)`, `.ranges(min, max, N)`, and `.shuffle(array)`. These methods compute the entire sequence natively in Rust and return the results as a single typed array, eliminating per-value boundary crossings entirely.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Basic](#basic)
  - [Seeded (deterministic)](#seeded-deterministic)
  - [Choosing an algorithm](#choosing-an-algorithm)
  - [Array utilities](#array-utilities)
- [API](#api)
- [Benchmark](#benchmark)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Build](#build)
  - [Test](#test)
- [License](#license)

## Install

```bash
bun add @arkv/rng
# or
npm install @arkv/rng
```

## Usage

### Basic

```typescript
const rng = new Rng(); // system entropy

rng.int();         // u32 in [0, 2^32)
rng.float();       // float in [0, 1)
rng.range(1, 10);  // integer in [1, 10)
rng.bool();        // boolean (50/50)

rng.free(); // release Wasm memory
```

### Seeded (deterministic)

Pass any `number`, `bigint`, or `string` seed for reproducible sequences:

```typescript
// number seed
const rng1 = new Rng(12345);
console.log(rng1.int()); // always the same value

// bigint seed
const rng2 = new Rng(12345n);
console.log(rng2.int()); // always the same value

// string seed — hashed to u64 via FNV-1a inside WebAssembly
const rng3 = new Rng('hello.');
console.log(rng3.int()); // always the same value
console.log(rng3.int()); // always the next value in the sequence

// note: 'hello.' and 'world.' produce different sequences
// note: '42' and 42 produce different sequences
```

### Choosing an algorithm

The default algorithm is `pcg64`. Pass a second argument to select another:

```typescript
const rng = new Rng('my seed', 'xoroshiro128+');

// Available algorithms:
// 'pcg64'         — default, excellent statistical quality
// 'xoroshiro128+' — fast, 128-bit state
// 'xorshift128+'  — fast, minimal state
// 'mersenne'      — MT19937-64, 623-dimensional equidistribution
// 'lcg32'         — simplest, highest throughput
```

### Array utilities

```typescript
const rng = new Rng();

rng.ints(100);                    // Uint32Array of 100 random integers
rng.floats(100);                  // Float64Array of 100 random floats in [0, 1)
rng.ranges(1, 100, 50);           // Uint32Array of 50 integers in [1, 100)
rng.pick([1, 2, 3, 4, 5]);        // Returns a random element
rng.shuffle([1, 2, 3, 4, 5]);     // Returns a new, randomly shuffled array
rng.bool(0.8);                    // Returns true 80% of the time
```

## API

### `new Rng(seed?, algorithm?)`

| Param | Type | Description |
|-------|------|-------------|
| `seed` | `number \| bigint \| string` | Optional seed for deterministic output. Omit for system entropy. String seeds are hashed via FNV-1a 64-bit in Rust. |
| `algorithm` | `RngAlgorithm` | PRNG backend. Default: `'pcg64'`. |

```typescript
type RngAlgorithm = 'pcg64' | 'xoroshiro128+' | 'xorshift128+' | 'mersenne' | 'lcg32';
```

| Method | Return | Description |
|--------|--------|-------------|
| `int()` | `number` | Random u32 in `[0, 2^32)` |
| `ints(length)` | `Uint32Array` | Batched array of random u32 integers |
| `float()` | `number` | Random float in `[0, 1)` |
| `floats(length)` | `Float64Array` | Batched array of random floats in `[0, 1)` |
| `range(min, max)` | `number` | Random integer in `[min, max)` |
| `ranges(min, max, length)` | `Uint32Array` | Batched array of random integers in `[min, max)` |
| `bool(probability?)` | `boolean` | Random boolean; default 0.5 |
| `pick(array)` | `T` | Random element from a non-empty array |
| `shuffle(array)` | `T[]` | New randomly ordered copy of the array |
| `free()` | `void` | Release Wasm memory |

## License

[MIT](../../LICENSE)

---

## Development

### Prerequisites

| Tool | Install |
|------|---------|
| [Bun](https://bun.sh) >= 1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| [Rust](https://rustup.rs) stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| [wasm-pack](https://rustwasm.github.io/wasm-pack) >= 0.13 | `cargo install wasm-pack` |

Run the setup script to install Rust + wasm-pack in one step:

```bash
bash packages/rng/setup.sh
```

### Build

```bash
bun install

cd packages/rng

# Full build: Rust -> Wasm -> TypeScript -> dist/
bun run build

# Wasm only (run once before tests, or after changing Rust)
bun run build:wasm

# TypeScript only (after Wasm is already built)
bun run build:ts
```

### Test

```bash
# Wasm must be built first
bun run build:wasm

bun test
bun test --coverage
```

## Benchmark

Run `bun run build:wasm && bun run bench` to reproduce.

Compared against: `seedrandom` (all 7 algorithm variants), `pure-rand` (all 4 algorithms),
`random-js` (Mersenne Twister).

### 1 · Sequential u32 Integer  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64** | 0.78 | 127,925,987 | 1.40x |
| **@arkv/rng  · xoroshiro128+** | 0.68 | 146,194,983 | 1.22x |
| **@arkv/rng  · xorshift128+** | 0.72 | 138,025,272 | 1.29x |
| **@arkv/rng  · mersenne** | 1.60 | 62,547,497 | 2.86x |
| **@arkv/rng  · lcg32** | 1.39 | 72,180,121 | 2.47x |
| seedrandom  · default/ARC4 | 3.77 | 26,500,990 | 6.74x |
| seedrandom  · alea | 0.83 | 120,126,758 | 1.49x |
| seedrandom  · xor128 | 0.56 | 178,573,342 | **fastest** |
| seedrandom  · tychei | 1.48 | 67,564,463 | 2.64x |
| seedrandom  · xorwow | 2.83 | 35,356,091 | 5.05x |
| seedrandom  · xor4096 | 2.45 | 40,865,332 | 4.37x |
| seedrandom  · xorshift7 | 0.77 | 129,932,396 | 1.37x |
| pure-rand  · xoroshiro128+  (uniform) | 11.20 | 8,927,779 | 20.00x |
| pure-rand  · xorshift128+  (uniform) | 2.72 | 36,745,671 | 4.86x |
| pure-rand  · mersenne  (uniform) | 4.11 | 24,329,160 | 7.34x |
| pure-rand  · congruential32  (uniform) | 4.05 | 24,704,186 | 7.23x |
| random-js  · MersenneTwister | 5.43 | 18,403,947 | 9.70x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 0.65 | 154,950,594 | 4.30x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.35 | 283,096,052 | 2.35x |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.46 | 216,432,883 | 3.08x |
| **@arkv/rng  · mersenne  [native batch]** | 1.27 | 79,006,166 | 8.43x |
| **@arkv/rng  · lcg32  [native batch]** | 0.15 | 665,827,724 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 4.23 | 23,627,374 | 28.18x |
| pure-rand  · xorshift128+  loop | 3.88 | 25,760,296 | 25.85x |
| pure-rand  · mersenne  loop | 8.81 | 11,350,909 | 58.66x |
| pure-rand  · congruential32  loop | 2.85 | 35,090,613 | 18.97x |
| random-js  loop | 2.10 | 47,716,640 | 13.95x |

### 3 · Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 0.71 | 140,739,813 | 3.12x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.31 | 326,514,620 | 1.35x |
| **@arkv/rng  · xorshift128+  [batch]** | 0.34 | 293,713,359 | 1.50x |
| **@arkv/rng  · mersenne  [batch]** | 1.09 | 91,334,961 | 4.81x |
| **@arkv/rng  · lcg32  [batch]** | 0.23 | 439,589,423 | **fastest** |
| **@arkv/rng  · pcg64  [single]** | 0.83 | 120,169,054 | 3.66x |
| seedrandom  · default/ARC4 | 2.94 | 33,996,364 | 12.93x |
| seedrandom  · alea | 0.69 | 145,553,628 | 3.02x |
| seedrandom  · xor128 | 0.47 | 211,107,640 | 2.08x |
| seedrandom  · tychei | 0.75 | 132,757,167 | 3.31x |
| seedrandom  · xorwow | 0.76 | 131,845,935 | 3.33x |
| seedrandom  · xor4096 | 0.83 | 120,975,303 | 3.63x |
| seedrandom  · xorshift7 | 0.58 | 172,413,199 | 2.55x |
| pure-rand  · xoroshiro128+ | 1.76 | 56,753,399 | 7.75x |
| pure-rand  · xorshift128+ | 1.71 | 58,600,434 | 7.50x |
| pure-rand  · mersenne | 1.99 | 50,228,590 | 8.75x |
| pure-rand  · congruential32 | 1.71 | 58,570,711 | 7.51x |
| random-js  · Random.real(0, 1) | 2.20 | 45,393,862 | 9.68x |

### 4 · Bounded Range [1, 1000)  — uniform distribution 
    `@arkv/rng` uses **unbiased rejection sampling** (via the `rand` crate), which guarantees a perfectly uniform distribution. `seedrandom + Math.floor()` uses biased float multiplication — faster but mathematically incorrect (modulo bias). `pure-rand` also uses unbiased sampling, explaining its slower numbers. `@arkv/rng` produces cryptographically correct uniform integers faster than `seedrandom` produces biased ones.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 0.83 | 120,107,136 | 2.97x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.44 | 228,152,671 | 1.56x |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.44 | 227,950,881 | 1.57x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.69 | 144,852,801 | 2.46x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.28 | 357,058,693 | **fastest** |
| **@arkv/rng  · pcg64  range() [single]** | 1.04 | 95,857,609 | 3.72x |
| seedrandom  · default/ARC4  + floor | 3.07 | 32,625,874 | 10.94x |
| seedrandom  · alea  + floor | 0.77 | 129,605,365 | 2.75x |
| seedrandom  · xor128  + floor | 0.39 | 255,172,995 | 1.40x |
| seedrandom  · tychei  + floor | 1.31 | 76,563,640 | 4.66x |
| seedrandom  · xorwow  + floor | 2.15 | 46,559,053 | 7.67x |
| seedrandom  · xor4096  + floor | 2.32 | 43,102,705 | 8.28x |
| seedrandom  · xorshift7  + floor | 0.63 | 157,625,777 | 2.27x |
| pure-rand  · xoroshiro128+  uniformInt | 11.82 | 8,459,480 | 42.21x |
| pure-rand  · xorshift128+  uniformInt | 12.55 | 7,966,781 | 44.82x |
| pure-rand  · mersenne  uniformInt | 12.01 | 8,324,473 | 42.89x |
| pure-rand  · congruential32  uniformInt | 12.49 | 8,007,291 | 44.59x |
| random-js  · Random.integer(1, 999) | 4.30 | 23,238,380 | 15.37x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 3.60 | 27,744,692 | 2.92x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 1.96 | 51,121,922 | 1.59x |
| **@arkv/rng  · xorshift128+  shuffle()** | 1.23 | 81,087,678 | **fastest** |
| **@arkv/rng  · mersenne  shuffle()** | 3.49 | 28,662,231 | 2.83x |
| **@arkv/rng  · lcg32  shuffle()** | 2.46 | 40,650,324 | 1.99x |
| seedrandom  · default/ARC4  Fisher-Yates | 6.52 | 15,344,460 | 5.28x |
| seedrandom  · alea  Fisher-Yates | 3.66 | 27,348,916 | 2.96x |
| seedrandom  · xor128  Fisher-Yates | 7.63 | 13,098,490 | 6.19x |
| seedrandom  · tychei  Fisher-Yates | 7.33 | 13,643,123 | 5.94x |
| seedrandom  · xorwow  Fisher-Yates | 10.22 | 9,785,859 | 8.29x |
| seedrandom  · xor4096  Fisher-Yates | 10.12 | 9,886,093 | 8.20x |
| seedrandom  · xorshift7  Fisher-Yates | 4.57 | 21,899,842 | 3.70x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 12.74 | 7,847,808 | 10.33x |
| pure-rand  · xorshift128+  Fisher-Yates | 13.90 | 7,195,311 | 11.27x |
| pure-rand  · mersenne  Fisher-Yates | 15.31 | 6,532,058 | 12.41x |
| pure-rand  · congruential32  Fisher-Yates | 12.99 | 7,696,874 | 10.54x |
| random-js  · Random.shuffle()  [in-place] | 4.40 | 22,739,578 | 3.57x |

### 6 · String-seeded Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [string seed]** | 0.79 | 126,803,623 | 2.30x |
| **@arkv/rng  · xoroshiro128+  [string seed]** | 0.73 | 137,461,957 | 2.12x |
| **@arkv/rng  · xorshift128+  [string seed]** | 0.95 | 105,774,550 | 2.76x |
| **@arkv/rng  · mersenne  [string seed]** | 1.23 | 81,146,437 | 3.59x |
| **@arkv/rng  · lcg32  [string seed]** | 1.23 | 81,556,090 | 3.57x |
| seedrandom  · default/ARC4  [string seed] | 2.82 | 35,446,462 | 8.23x |
| seedrandom  · alea  [string seed] | 0.71 | 140,091,928 | 2.08x |
| seedrandom  · xor128  [string seed] | 0.34 | 291,547,739 | **fastest** |
| seedrandom  · tychei  [string seed] | 0.63 | 159,328,780 | 1.83x |
| seedrandom  · xorwow  [string seed] | 0.75 | 132,807,769 | 2.20x |
| seedrandom  · xor4096  [string seed] | 0.80 | 124,839,269 | 2.34x |
| seedrandom  · xorshift7  [string seed] | 0.66 | 151,255,267 | 1.93x |
