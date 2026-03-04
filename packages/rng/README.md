# @arkv/rng

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
| **@arkv/rng  · pcg64** | 2.21 | 45,350,672 | 6.21x |
| **@arkv/rng  · xoroshiro128+** | 1.55 | 64,723,914 | 4.35x |
| **@arkv/rng  · xorshift128+** | 0.94 | 106,120,162 | 2.66x |
| **@arkv/rng  · mersenne** | 1.04 | 95,946,914 | 2.94x |
| **@arkv/rng  · lcg32** | 0.61 | 162,818,453 | 1.73x |
| seedrandom  · default/ARC4 | 2.90 | 34,463,507 | 8.18x |
| seedrandom  · alea | 0.67 | 148,381,822 | 1.90x |
| seedrandom  · xor128 | 0.35 | 281,821,922 | **fastest** |
| seedrandom  · tychei | 1.14 | 87,875,702 | 3.21x |
| seedrandom  · xorwow | 2.05 | 48,789,127 | 5.78x |
| seedrandom  · xor4096 | 2.21 | 45,349,273 | 6.21x |
| seedrandom  · xorshift7 | 0.48 | 208,572,757 | 1.35x |
| pure-rand  · xoroshiro128+  (uniform) | 8.68 | 11,514,614 | 24.48x |
| pure-rand  · xorshift128+  (uniform) | 2.75 | 36,387,374 | 7.75x |
| pure-rand  · mersenne  (uniform) | 4.01 | 24,925,262 | 11.31x |
| pure-rand  · congruential32  (uniform) | 3.04 | 32,842,362 | 8.58x |
| random-js  · MersenneTwister | 3.76 | 26,582,503 | 10.60x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 0.46 | 218,323,451 | 1.83x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.38 | 263,861,293 | 1.52x |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.31 | 322,519,262 | 1.24x |
| **@arkv/rng  · mersenne  [native batch]** | 0.36 | 276,967,647 | 1.45x |
| **@arkv/rng  · lcg32  [native batch]** | 0.25 | 400,310,641 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 5.48 | 18,251,356 | 21.93x |
| pure-rand  · xorshift128+  loop | 3.49 | 28,651,653 | 13.97x |
| pure-rand  · mersenne  loop | 7.30 | 13,706,371 | 29.21x |
| pure-rand  · congruential32  loop | 2.65 | 37,789,039 | 10.59x |
| random-js  loop | 2.01 | 49,676,383 | 8.06x |

### 3 · Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 0.45 | 220,937,837 | 1.62x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.28 | 357,021,725 | **fastest** |
| **@arkv/rng  · xorshift128+  [batch]** | 0.28 | 357,514,417 | **fastest** |
| **@arkv/rng  · mersenne  [batch]** | 0.42 | 237,001,083 | 1.51x |
| **@arkv/rng  · lcg32  [batch]** | 0.28 | 358,741,821 | **fastest** |
| **@arkv/rng  · pcg64  [single]** | 1.06 | 93,996,800 | 3.82x |
| seedrandom  · default/ARC4 | 2.91 | 34,375,306 | 10.44x |
| seedrandom  · alea | 0.71 | 141,633,631 | 2.53x |
| seedrandom  · xor128 | 0.34 | 291,158,111 | 1.23x |
| seedrandom  · tychei | 0.70 | 142,689,381 | 2.51x |
| seedrandom  · xorwow | 0.73 | 137,859,728 | 2.60x |
| seedrandom  · xor4096 | 1.13 | 88,506,071 | 4.05x |
| seedrandom  · xorshift7 | 0.84 | 119,243,377 | 3.01x |
| pure-rand  · xoroshiro128+ | 1.56 | 64,170,684 | 5.59x |
| pure-rand  · xorshift128+ | 1.67 | 59,781,082 | 6.00x |
| pure-rand  · mersenne | 2.38 | 41,957,185 | 8.55x |
| pure-rand  · congruential32 | 1.68 | 59,413,153 | 6.04x |
| random-js  · Random.real(0, 1) | 2.03 | 49,287,621 | 7.28x |

### 4 · Bounded Range [1, 1000)  — uniform distribution  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 0.89 | 112,764,743 | 2.59x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.34 | 292,295,101 | **fastest** |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.36 | 279,967,748 | 1.04x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.50 | 199,319,523 | 1.47x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.36 | 275,942,758 | 1.06x |
| **@arkv/rng  · pcg64  range() [single]** | 1.30 | 77,205,352 | 3.79x |
| seedrandom  · default/ARC4  + floor | 2.96 | 33,737,383 | 8.66x |
| seedrandom  · alea  + floor | 0.86 | 116,745,373 | 2.50x |
| seedrandom  · xor128  + floor | 0.39 | 255,027,875 | 1.15x |
| seedrandom  · tychei  + floor | 1.33 | 75,138,311 | 3.89x |
| seedrandom  · xorwow  + floor | 2.03 | 49,201,073 | 5.94x |
| seedrandom  · xor4096  + floor | 2.68 | 37,381,347 | 7.82x |
| seedrandom  · xorshift7  + floor | 0.83 | 120,460,158 | 2.43x |
| pure-rand  · xoroshiro128+  uniformInt | 16.21 | 6,168,270 | 47.39x |
| pure-rand  · xorshift128+  uniformInt | 12.26 | 8,157,234 | 35.83x |
| pure-rand  · mersenne  uniformInt | 12.56 | 7,959,431 | 36.72x |
| pure-rand  · congruential32  uniformInt | 12.64 | 7,912,157 | 36.94x |
| random-js  · Random.integer(1, 999) | 5.57 | 17,967,076 | 16.27x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 2.48 | 40,244,898 | 1.25x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 2.34 | 42,692,350 | 1.18x |
| **@arkv/rng  · xorshift128+  shuffle()** | 3.21 | 31,159,938 | 1.62x |
| **@arkv/rng  · mersenne  shuffle()** | 2.65 | 37,674,830 | 1.34x |
| **@arkv/rng  · lcg32  shuffle()** | 1.98 | 50,498,241 | **fastest** |
| seedrandom  · default/ARC4  Fisher-Yates | 7.71 | 12,971,693 | 3.89x |
| seedrandom  · alea  Fisher-Yates | 3.57 | 28,014,720 | 1.80x |
| seedrandom  · xor128  Fisher-Yates | 6.52 | 15,334,067 | 3.29x |
| seedrandom  · tychei  Fisher-Yates | 9.13 | 10,949,091 | 4.61x |
| seedrandom  · xorwow  Fisher-Yates | 8.50 | 11,770,951 | 4.29x |
| seedrandom  · xor4096  Fisher-Yates | 7.90 | 12,652,875 | 3.99x |
| seedrandom  · xorshift7  Fisher-Yates | 3.74 | 26,764,181 | 1.89x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 16.94 | 5,904,427 | 8.55x |
| pure-rand  · xorshift128+  Fisher-Yates | 15.20 | 6,578,188 | 7.68x |
| pure-rand  · mersenne  Fisher-Yates | 15.66 | 6,386,026 | 7.91x |
| pure-rand  · congruential32  Fisher-Yates | 13.55 | 7,379,014 | 6.84x |
| random-js  · Random.shuffle()  [in-place] | 2.79 | 35,853,281 | 1.41x |

### 6 · String-seeded Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [string seed]** | 1.01 | 99,472,794 | 2.01x |
| **@arkv/rng  · xoroshiro128+  [string seed]** | 0.84 | 118,623,681 | 1.68x |
| **@arkv/rng  · xorshift128+  [string seed]** | 0.98 | 101,834,757 | 1.96x |
| **@arkv/rng  · mersenne  [string seed]** | 0.86 | 115,722,525 | 1.73x |
| **@arkv/rng  · lcg32  [string seed]** | 0.65 | 152,974,669 | 1.31x |
| seedrandom  · default/ARC4  [string seed] | 3.19 | 31,319,833 | 6.38x |
| seedrandom  · alea  [string seed] | 0.75 | 133,166,077 | 1.50x |
| seedrandom  · xor128  [string seed] | 0.50 | 199,721,189 | **fastest** |
| seedrandom  · tychei  [string seed] | 0.65 | 153,936,147 | 1.30x |
| seedrandom  · xorwow  [string seed] | 0.73 | 136,379,692 | 1.46x |
| seedrandom  · xor4096  [string seed] | 1.10 | 90,554,529 | 2.21x |
| seedrandom  · xorshift7  [string seed] | 0.53 | 187,386,982 | 1.07x |
