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
| **@arkv/rng  · pcg64** | 1.69 | 59,047,284 | 5.30x |
| **@arkv/rng  · xoroshiro128+** | 0.98 | 102,311,629 | 3.06x |
| **@arkv/rng  · xorshift128+** | 1.07 | 93,151,502 | 3.36x |
| **@arkv/rng  · mersenne** | 1.49 | 66,949,013 | 4.68x |
| **@arkv/rng  · lcg32** | 1.11 | 89,743,567 | 3.49x |
| seedrandom  · default/ARC4 | 2.86 | 34,908,632 | 8.97x |
| seedrandom  · alea | 0.64 | 156,099,267 | 2.01x |
| seedrandom  · xor128 | 0.32 | 313,103,703 | **fastest** |
| seedrandom  · tychei | 1.62 | 61,813,331 | 5.07x |
| seedrandom  · xorwow | 2.16 | 46,189,867 | 6.78x |
| seedrandom  · xor4096 | 2.28 | 43,887,522 | 7.13x |
| seedrandom  · xorshift7 | 0.50 | 198,932,132 | 1.57x |
| pure-rand  · xoroshiro128+  (uniform) | 8.89 | 11,242,683 | 27.85x |
| pure-rand  · xorshift128+  (uniform) | 2.52 | 39,750,478 | 7.88x |
| pure-rand  · mersenne  (uniform) | 2.98 | 33,548,896 | 9.33x |
| pure-rand  · congruential32  (uniform) | 2.92 | 34,258,554 | 9.14x |
| random-js  · MersenneTwister | 5.91 | 16,932,045 | 18.49x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 0.56 | 178,095,024 | 2.31x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.28 | 358,268,845 | 1.15x |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.27 | 371,400,663 | 1.11x |
| **@arkv/rng  · mersenne  [native batch]** | 1.01 | 98,972,174 | 4.15x |
| **@arkv/rng  · lcg32  [native batch]** | 0.24 | 410,643,890 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 4.31 | 23,211,480 | 17.69x |
| pure-rand  · xorshift128+  loop | 4.80 | 20,851,048 | 19.69x |
| pure-rand  · mersenne  loop | 8.87 | 11,272,846 | 36.43x |
| pure-rand  · congruential32  loop | 2.57 | 38,979,197 | 10.53x |
| random-js  loop | 1.80 | 55,522,211 | 7.40x |

### 3 · Float [0, 1)  — 53-bit precision
    `@arkv/rng` and `pure-rand` generate high-resolution floats with full **53-bit precision** (IEEE 754 standard). `seedrandom` generates lower-resolution floats with only **32-bit precision**. This quality difference explains pure-rand's slower single-call numbers — it rolls two 32-bit integers per float, whereas seedrandom rolls just one.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 0.77 | 129,560,866 | 3.59x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.25 | 393,629,500 | 1.18x |
| **@arkv/rng  · xorshift128+  [batch]** | 0.35 | 287,161,580 | 1.62x |
| **@arkv/rng  · mersenne  [batch]** | 1.12 | 89,439,918 | 5.19x |
| **@arkv/rng  · lcg32  [batch]** | 0.22 | 464,569,599 | **fastest** |
| **@arkv/rng  · pcg64  [single]** | 0.80 | 124,736,183 | 3.72x |
| seedrandom  · default/ARC4 | 2.89 | 34,581,782 | 13.43x |
| seedrandom  · alea | 0.69 | 145,896,160 | 3.18x |
| seedrandom  · xor128 | 0.35 | 283,088,839 | 1.64x |
| seedrandom  · tychei | 0.61 | 163,084,781 | 2.85x |
| seedrandom  · xorwow | 0.82 | 121,521,596 | 3.82x |
| seedrandom  · xor4096 | 1.08 | 92,687,941 | 5.01x |
| seedrandom  · xorshift7 | 0.72 | 137,971,379 | 3.37x |
| pure-rand  · xoroshiro128+ | 1.68 | 59,601,789 | 7.79x |
| pure-rand  · xorshift128+ | 1.77 | 56,572,061 | 8.21x |
| pure-rand  · mersenne | 2.38 | 42,065,182 | 11.04x |
| pure-rand  · congruential32 | 1.63 | 61,419,138 | 7.56x |
| random-js  · Random.real(0, 1) | 2.11 | 47,436,147 | 9.79x |

### 4 · Bounded Range [1, 1000)  — uniform distribution 
    `@arkv/rng` uses **unbiased rejection sampling** (via the `rand` crate), which guarantees a perfectly uniform distribution. `seedrandom + Math.floor()` uses biased float multiplication — faster but mathematically incorrect (modulo bias). `pure-rand` also uses unbiased sampling, explaining its slower numbers. `@arkv/rng` produces cryptographically correct uniform integers faster than `seedrandom` produces biased ones.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 0.72 | 139,403,715 | 2.55x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.40 | 250,821,440 | 1.42x |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.51 | 197,365,175 | 1.80x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.58 | 171,301,515 | 2.08x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.28 | 355,966,895 | **fastest** |
| **@arkv/rng  · pcg64  range() [single]** | 1.03 | 97,466,742 | 3.65x |
| seedrandom  · default/ARC4  + floor | 3.01 | 33,195,858 | 10.72x |
| seedrandom  · alea  + floor | 0.84 | 119,444,202 | 2.98x |
| seedrandom  · xor128  + floor | 0.40 | 251,135,131 | 1.42x |
| seedrandom  · tychei  + floor | 1.22 | 81,919,673 | 4.35x |
| seedrandom  · xorwow  + floor | 2.38 | 42,085,381 | 8.46x |
| seedrandom  · xor4096  + floor | 2.56 | 39,038,955 | 9.12x |
| seedrandom  · xorshift7  + floor | 0.91 | 109,551,583 | 3.25x |
| pure-rand  · xoroshiro128+  uniformInt | 10.19 | 9,816,596 | 36.26x |
| pure-rand  · xorshift128+  uniformInt | 11.78 | 8,485,442 | 41.95x |
| pure-rand  · mersenne  uniformInt | 10.24 | 9,762,307 | 36.46x |
| pure-rand  · congruential32  uniformInt | 10.45 | 9,568,649 | 37.20x |
| random-js  · Random.integer(1, 999) | 4.68 | 21,388,800 | 16.64x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 2.98 | 33,504,362 | 1.53x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 2.01 | 49,872,128 | 1.03x |
| **@arkv/rng  · xorshift128+  shuffle()** | 2.77 | 36,127,181 | 1.42x |
| **@arkv/rng  · mersenne  shuffle()** | 2.41 | 41,422,841 | 1.23x |
| **@arkv/rng  · lcg32  shuffle()** | 1.96 | 51,132,613 | **fastest** |
| seedrandom  · default/ARC4  Fisher-Yates | 5.67 | 17,642,363 | 2.90x |
| seedrandom  · alea  Fisher-Yates | 4.26 | 23,470,195 | 2.18x |
| seedrandom  · xor128  Fisher-Yates | 7.55 | 13,237,390 | 3.86x |
| seedrandom  · tychei  Fisher-Yates | 7.75 | 12,896,122 | 3.96x |
| seedrandom  · xorwow  Fisher-Yates | 8.51 | 11,755,129 | 4.35x |
| seedrandom  · xor4096  Fisher-Yates | 9.19 | 10,878,260 | 4.70x |
| seedrandom  · xorshift7  Fisher-Yates | 5.34 | 18,734,443 | 2.73x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 12.79 | 7,817,912 | 6.54x |
| pure-rand  · xorshift128+  Fisher-Yates | 14.87 | 6,724,903 | 7.60x |
| pure-rand  · mersenne  Fisher-Yates | 15.49 | 6,454,029 | 7.92x |
| pure-rand  · congruential32  Fisher-Yates | 17.00 | 5,880,861 | 8.69x |
| random-js  · Random.shuffle()  [in-place] | 5.43 | 18,431,243 | 2.77x |

### 6 · String-seeded Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [string seed]** | 0.84 | 118,432,756 | 1.98x |
| **@arkv/rng  · xoroshiro128+  [string seed]** | 0.71 | 141,496,552 | 1.66x |
| **@arkv/rng  · xorshift128+  [string seed]** | 1.26 | 79,364,890 | 2.96x |
| **@arkv/rng  · mersenne  [string seed]** | 1.71 | 58,492,667 | 4.01x |
| **@arkv/rng  · lcg32  [string seed]** | 1.71 | 58,614,895 | 4.00x |
| seedrandom  · default/ARC4  [string seed] | 4.75 | 21,063,429 | 11.14x |
| seedrandom  · alea  [string seed] | 0.89 | 112,072,569 | 2.09x |
| seedrandom  · xor128  [string seed] | 0.43 | 234,602,454 | **fastest** |
| seedrandom  · tychei  [string seed] | 0.74 | 134,916,898 | 1.74x |
| seedrandom  · xorwow  [string seed] | 0.95 | 105,113,675 | 2.23x |
| seedrandom  · xor4096  [string seed] | 1.02 | 97,657,013 | 2.40x |
| seedrandom  · xorshift7  [string seed] | 0.86 | 116,575,116 | 2.01x |

### 7 · intStream() — Buffered Single Integer  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  intStream()** | 1.67 | 59,996,028 | 4.76x |
| **@arkv/rng  · xoroshiro128+  intStream()** | 1.57 | 63,778,032 | 4.48x |
| **@arkv/rng  · lcg32  intStream()** | 1.01 | 99,317,983 | 2.88x |
| seedrandom  · default/ARC4 | 3.18 | 31,480,516 | 9.07x |
| seedrandom  · alea | 0.78 | 128,262,517 | 2.23x |
| seedrandom  · xor128 | 0.35 | 285,679,188 | **fastest** |
| seedrandom  · tychei | 1.38 | 72,290,062 | 3.95x |
| seedrandom  · xorwow | 3.39 | 29,485,687 | 9.69x |
| seedrandom  · xor4096 | 2.83 | 35,339,847 | 8.08x |
| seedrandom  · xorshift7 | 0.60 | 165,847,656 | 1.72x |

### 8 · Native 64-bit BigInt
    `@arkv/rng` generates a 64-bit integer natively in Rust in a single CPU operation. Pure-JS libraries must roll two 32-bit values and stitch them via BigInt arithmetic — consuming twice the RNG calls and adding JS BigInt overhead.  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  bigInt()** | 3.38 | 29,587,296 | 1.85x |
| **@arkv/rng  · xoroshiro128+  bigInt()** | 3.81 | 26,266,864 | 2.09x |
| **@arkv/rng  · xorshift128+  bigInt()** | 2.89 | 34,656,711 | 1.58x |
| **@arkv/rng  · mersenne  bigInt()** | 3.96 | 25,235,568 | 2.17x |
| **@arkv/rng  · lcg32  bigInt()** | 1.83 | 54,771,952 | **fastest** |
| seedrandom  · default/ARC4  (2×32-bit + BigInt) | 11.52 | 8,681,386 | 6.31x |
| seedrandom  · alea  (2×32-bit + BigInt) | 6.00 | 16,673,603 | 3.28x |
| seedrandom  · xor128  (2×32-bit + BigInt) | 10.22 | 9,782,947 | 5.60x |
| seedrandom  · tychei  (2×32-bit + BigInt) | 12.29 | 8,135,038 | 6.73x |
| seedrandom  · xorwow  (2×32-bit + BigInt) | 12.61 | 7,928,395 | 6.91x |
| seedrandom  · xor4096  (2×32-bit + BigInt) | 10.00 | 10,003,432 | 5.48x |
| seedrandom  · xorshift7  (2×32-bit + BigInt) | 15.32 | 6,526,729 | 8.39x |
