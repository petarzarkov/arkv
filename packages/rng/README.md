# @arkv/rng

[![coverage](https://petarzarkov.github.io/arkv/coverage-rng.svg)](https://petarzarkov.github.io/arkv#rng)

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
| `bigInt()` | `bigint` | Random u64 as a BigInt in `[0, 2^64)` |
| `intStream(bufferSize?)` | `() => number` | High-throughput buffered integer closure (default buffer: 256) |
| `float()` | `number` | Random float in `[0, 1)` with 53-bit precision |
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
| **@arkv/rng  · pcg64** | 1.49 | 67,055,499 | 4.01x |
| **@arkv/rng  · xoroshiro128+** | 0.96 | 104,698,009 | 2.57x |
| **@arkv/rng  · xorshift128+** | 1.31 | 76,163,783 | 3.53x |
| **@arkv/rng  · mersenne** | 2.01 | 49,729,051 | 5.41x |
| **@arkv/rng  · lcg32** | 1.15 | 86,741,629 | 3.10x |
| seedrandom  · default/ARC4 | 2.77 | 36,061,207 | 7.46x |
| seedrandom  · alea | 0.61 | 165,099,596 | 1.63x |
| seedrandom  · xor128 | 0.37 | 268,945,170 | **fastest** |
| seedrandom  · tychei | 1.04 | 95,853,566 | 2.81x |
| seedrandom  · xorwow | 2.00 | 50,008,351 | 5.38x |
| seedrandom  · xor4096 | 2.13 | 46,994,093 | 5.72x |
| seedrandom  · xorshift7 | 0.50 | 199,527,519 | 1.35x |
| pure-rand  · xoroshiro128+  (uniform) | 1.34 | 74,835,120 | 3.59x |
| pure-rand  · xorshift128+  (uniform) | 1.40 | 71,432,092 | 3.77x |
| pure-rand  · mersenne  (uniform) | 1.24 | 80,884,619 | 3.33x |
| pure-rand  · congruential32  (uniform) | 0.85 | 117,371,305 | 2.29x |
| random-js  · MersenneTwister | 2.49 | 40,179,361 | 6.69x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 0.51 | 195,433,119 | 5.16x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.26 | 383,756,361 | 2.63x |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.58 | 173,098,727 | 5.83x |
| **@arkv/rng  · mersenne  [native batch]** | 0.93 | 107,157,362 | 9.41x |
| **@arkv/rng  · lcg32  [native batch]** | 0.10 | 1,008,766,178 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 2.14 | 46,623,568 | 21.64x |
| pure-rand  · xorshift128+  loop | 2.42 | 41,285,805 | 24.43x |
| pure-rand  · mersenne  loop | 2.46 | 40,607,983 | 24.84x |
| pure-rand  · congruential32  loop | 2.24 | 44,656,254 | 22.59x |
| random-js  loop | 1.63 | 61,358,238 | 16.44x |

### 3 · Float [0, 1)  — 53-bit precision
    `@arkv/rng` and `pure-rand` generate high-resolution floats with full **53-bit precision** (IEEE 754 standard). `seedrandom` generates lower-resolution floats with only **32-bit precision**. This quality difference explains pure-rand's slower single-call numbers — it rolls two 32-bit integers per float, whereas seedrandom rolls just one.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 0.55 | 182,867,174 | 3.01x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.87 | 115,407,209 | 4.77x |
| **@arkv/rng  · xorshift128+  [batch]** | 0.30 | 330,063,504 | 1.67x |
| **@arkv/rng  · mersenne  [batch]** | 0.87 | 115,060,631 | 4.78x |
| **@arkv/rng  · lcg32  [batch]** | 0.18 | 549,958,203 | **fastest** |
| **@arkv/rng  · pcg64  [single]** | 0.86 | 116,756,004 | 4.71x |
| seedrandom  · default/ARC4 | 2.77 | 36,127,925 | 15.22x |
| seedrandom  · alea | 0.65 | 154,310,272 | 3.56x |
| seedrandom  · xor128 | 0.37 | 267,106,145 | 2.06x |
| seedrandom  · tychei | 0.58 | 173,306,020 | 3.17x |
| seedrandom  · xorwow | 0.86 | 116,921,185 | 4.70x |
| seedrandom  · xor4096 | 0.86 | 116,428,396 | 4.72x |
| seedrandom  · xorshift7 | 0.50 | 198,261,642 | 2.77x |
| pure-rand  · xoroshiro128+ | 1.45 | 69,015,875 | 7.97x |
| pure-rand  · xorshift128+ | 1.53 | 65,271,510 | 8.43x |
| pure-rand  · mersenne | 2.16 | 46,383,523 | 11.86x |
| pure-rand  · congruential32 | 1.54 | 65,118,030 | 8.45x |
| random-js  · Random.real(0, 1) | 1.95 | 51,362,493 | 10.71x |

### 4 · Bounded Range [1, 1000)  — uniform distribution 
    `@arkv/rng` uses **unbiased rejection sampling** (via the `rand` crate), which guarantees a perfectly uniform distribution. `seedrandom + Math.floor()` uses biased float multiplication — faster but mathematically incorrect (modulo bias). `pure-rand` also uses unbiased sampling, explaining its slower numbers. `@arkv/rng` produces cryptographically correct uniform integers faster than `seedrandom` produces biased ones.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 0.68 | 146,217,001 | 3.06x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.41 | 246,783,181 | 1.81x |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.41 | 246,673,606 | 1.82x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.53 | 187,964,625 | 2.38x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.22 | 447,906,262 | **fastest** |
| **@arkv/rng  · pcg64  range() [single]** | 0.99 | 100,858,508 | 4.44x |
| seedrandom  · default/ARC4  + floor | 3.02 | 33,057,917 | 13.55x |
| seedrandom  · alea  + floor | 0.68 | 147,248,081 | 3.04x |
| seedrandom  · xor128  + floor | 0.44 | 229,293,112 | 1.95x |
| seedrandom  · tychei  + floor | 1.06 | 94,392,251 | 4.75x |
| seedrandom  · xorwow  + floor | 1.89 | 52,905,154 | 8.47x |
| seedrandom  · xor4096  + floor | 2.09 | 47,753,964 | 9.38x |
| seedrandom  · xorshift7  + floor | 0.57 | 174,900,088 | 2.56x |
| pure-rand  · xoroshiro128+  uniformInt | 1.03 | 96,852,488 | 4.62x |
| pure-rand  · xorshift128+  uniformInt | 1.06 | 94,179,872 | 4.76x |
| pure-rand  · mersenne  uniformInt | 1.28 | 77,834,337 | 5.75x |
| pure-rand  · congruential32  uniformInt | 0.90 | 111,187,954 | 4.03x |
| random-js  · Random.integer(1, 999) | 8.95 | 11,170,848 | 40.10x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 2.36 | 42,350,827 | 1.65x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 1.44 | 69,498,885 | 1.01x |
| **@arkv/rng  · xorshift128+  shuffle()** | 1.94 | 51,463,731 | 1.36x |
| **@arkv/rng  · mersenne  shuffle()** | 2.12 | 47,137,415 | 1.48x |
| **@arkv/rng  · lcg32  shuffle()** | 1.43 | 69,870,900 | **fastest** |
| seedrandom  · default/ARC4  Fisher-Yates | 7.88 | 12,687,565 | 5.51x |
| seedrandom  · alea  Fisher-Yates | 5.66 | 17,656,689 | 3.96x |
| seedrandom  · xor128  Fisher-Yates | 6.26 | 15,973,675 | 4.37x |
| seedrandom  · tychei  Fisher-Yates | 8.45 | 11,833,748 | 5.90x |
| seedrandom  · xorwow  Fisher-Yates | 7.85 | 12,738,832 | 5.48x |
| seedrandom  · xor4096  Fisher-Yates | 8.84 | 11,311,998 | 6.18x |
| seedrandom  · xorshift7  Fisher-Yates | 4.58 | 21,827,694 | 3.20x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 8.81 | 11,349,010 | 6.16x |
| pure-rand  · xorshift128+  Fisher-Yates | 8.01 | 12,484,014 | 5.60x |
| pure-rand  · mersenne  Fisher-Yates | 8.67 | 11,536,395 | 6.06x |
| pure-rand  · congruential32  Fisher-Yates | 8.14 | 12,279,030 | 5.69x |
| random-js  · Random.shuffle()  [in-place] | 3.07 | 32,554,574 | 2.15x |

### 6 · String-seeded Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [string seed]** | 0.91 | 110,284,346 | 2.10x |
| **@arkv/rng  · xoroshiro128+  [string seed]** | 0.85 | 118,259,644 | 1.96x |
| **@arkv/rng  · xorshift128+  [string seed]** | 1.03 | 97,139,438 | 2.38x |
| **@arkv/rng  · mersenne  [string seed]** | 1.45 | 68,875,646 | 3.36x |
| **@arkv/rng  · lcg32  [string seed]** | 1.68 | 59,598,556 | 3.88x |
| seedrandom  · default/ARC4  [string seed] | 2.86 | 34,948,502 | 6.62x |
| seedrandom  · alea  [string seed] | 0.72 | 138,649,141 | 1.67x |
| seedrandom  · xor128  [string seed] | 0.43 | 231,398,992 | **fastest** |
| seedrandom  · tychei  [string seed] | 0.61 | 163,638,000 | 1.41x |
| seedrandom  · xorwow  [string seed] | 0.80 | 124,589,478 | 1.86x |
| seedrandom  · xor4096  [string seed] | 0.85 | 117,815,188 | 1.96x |
| seedrandom  · xorshift7  [string seed] | 0.51 | 197,583,944 | 1.17x |

### 7 · intStream() — Buffered Single Integer  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  intStream()** | 1.35 | 73,939,832 | 3.57x |
| **@arkv/rng  · xoroshiro128+  intStream()** | 1.12 | 89,029,833 | 2.97x |
| **@arkv/rng  · lcg32  intStream()** | 0.87 | 115,133,492 | 2.29x |
| seedrandom  · default/ARC4 | 2.82 | 35,489,523 | 7.44x |
| seedrandom  · alea | 0.66 | 150,789,761 | 1.75x |
| seedrandom  · xor128 | 0.38 | 264,212,659 | **fastest** |
| seedrandom  · tychei | 1.05 | 95,109,652 | 2.78x |
| seedrandom  · xorwow | 2.01 | 49,842,572 | 5.30x |
| seedrandom  · xor4096 | 2.14 | 46,680,176 | 5.66x |
| seedrandom  · xorshift7 | 0.53 | 188,973,759 | 1.40x |

### 8 · Native 64-bit BigInt
    `@arkv/rng` generates a 64-bit integer natively in Rust in a single CPU operation. Pure-JS libraries must roll two 32-bit values and stitch them via BigInt arithmetic — consuming twice the RNG calls and adding JS BigInt overhead.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  bigInt()** | 2.67 | 37,501,064 | **fastest** |
| **@arkv/rng  · xoroshiro128+  bigInt()** | 5.13 | 19,483,333 | 1.92x |
| **@arkv/rng  · xorshift128+  bigInt()** | 2.99 | 33,476,120 | 1.12x |
| **@arkv/rng  · mersenne  bigInt()** | 3.20 | 31,266,943 | 1.20x |
| **@arkv/rng  · lcg32  bigInt()** | 2.93 | 34,082,896 | 1.10x |
| seedrandom  · default/ARC4  (2×32-bit + BigInt) | 11.86 | 8,431,821 | 4.45x |
| seedrandom  · alea  (2×32-bit + BigInt) | 5.39 | 18,536,667 | 2.02x |
| seedrandom  · xor128  (2×32-bit + BigInt) | 9.05 | 11,052,370 | 3.39x |
| seedrandom  · tychei  (2×32-bit + BigInt) | 12.19 | 8,204,463 | 4.57x |
| seedrandom  · xorwow  (2×32-bit + BigInt) | 11.75 | 8,508,427 | 4.41x |
| seedrandom  · xor4096  (2×32-bit + BigInt) | 8.62 | 11,597,512 | 3.23x |
| seedrandom  · xorshift7  (2×32-bit + BigInt) | 12.04 | 8,307,907 | 4.51x |
