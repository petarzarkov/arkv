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
| **@arkv/rng  · pcg64** | 2.90 | 34,470,456 | 8.25x |
| **@arkv/rng  · xoroshiro128+** | 1.61 | 61,967,275 | 4.59x |
| **@arkv/rng  · xorshift128+** | 1.08 | 92,718,363 | 3.07x |
| **@arkv/rng  · mersenne** | 1.07 | 93,289,152 | 3.05x |
| **@arkv/rng  · lcg32** | 0.66 | 151,118,123 | 1.88x |
| seedrandom  · default/ARC4 | 3.93 | 25,446,672 | 11.18x |
| seedrandom  · alea | 0.70 | 142,372,872 | 2.00x |
| seedrandom  · xor128 | 0.35 | 284,518,495 | **fastest** |
| seedrandom  · tychei | 1.46 | 68,617,979 | 4.15x |
| seedrandom  · xorwow | 3.07 | 32,529,560 | 8.75x |
| seedrandom  · xor4096 | 2.60 | 38,470,179 | 7.40x |
| seedrandom  · xorshift7 | 0.55 | 181,960,773 | 1.56x |
| pure-rand  · xoroshiro128+  (uniform) | 9.08 | 11,011,354 | 25.84x |
| pure-rand  · xorshift128+  (uniform) | 2.97 | 33,671,780 | 8.45x |
| pure-rand  · mersenne  (uniform) | 3.20 | 31,235,915 | 9.11x |
| pure-rand  · congruential32  (uniform) | 3.54 | 28,247,774 | 10.07x |
| random-js  · MersenneTwister | 5.86 | 17,075,281 | 16.66x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 1.02 | 98,214,075 | 1.56x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.65 | 153,328,611 | **fastest** |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.71 | 140,382,599 | 1.09x |
| **@arkv/rng  · mersenne  [native batch]** | 0.82 | 121,336,988 | 1.26x |
| **@arkv/rng  · lcg32  [native batch]** | 0.65 | 153,246,136 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 6.32 | 15,828,813 | 9.69x |
| pure-rand  · xorshift128+  loop | 5.74 | 17,433,986 | 8.79x |
| pure-rand  · mersenne  loop | 6.89 | 14,513,194 | 10.56x |
| pure-rand  · congruential32  loop | 2.31 | 43,204,849 | 3.55x |
| random-js  loop | 1.77 | 56,468,973 | 2.72x |

### 3 · Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 0.81 | 123,862,478 | 2.24x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.85 | 117,421,058 | 2.36x |
| **@arkv/rng  · xorshift128+  [batch]** | 0.84 | 119,345,557 | 2.32x |
| **@arkv/rng  · mersenne  [batch]** | 0.89 | 112,824,285 | 2.46x |
| **@arkv/rng  · lcg32  [batch]** | 0.78 | 128,330,333 | 2.16x |
| **@arkv/rng  · pcg64  [single]** | 1.15 | 87,249,757 | 3.18x |
| seedrandom  · default/ARC4 | 3.41 | 29,293,411 | 9.47x |
| seedrandom  · alea | 0.78 | 127,655,229 | 2.17x |
| seedrandom  · xor128 | 0.36 | 277,344,043 | **fastest** |
| seedrandom  · tychei | 0.70 | 141,863,490 | 1.96x |
| seedrandom  · xorwow | 0.77 | 130,309,289 | 2.13x |
| seedrandom  · xor4096 | 0.96 | 104,678,391 | 2.65x |
| seedrandom  · xorshift7 | 0.65 | 154,524,875 | 1.79x |
| pure-rand  · xoroshiro128+ | 2.11 | 47,365,552 | 5.86x |
| pure-rand  · xorshift128+ | 2.15 | 46,577,421 | 5.95x |
| pure-rand  · mersenne | 4.22 | 23,689,329 | 11.71x |
| pure-rand  · congruential32 | 1.80 | 55,467,793 | 5.00x |
| random-js  · Random.real(0, 1) | 1.93 | 51,895,563 | 5.34x |

### 4 · Bounded Range [1, 1000)  — uniform distribution  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 0.95 | 105,388,626 | 2.42x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.49 | 204,394,481 | 1.25x |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.47 | 214,592,275 | 1.19x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.63 | 159,347,059 | 1.60x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.49 | 203,337,583 | 1.25x |
| **@arkv/rng  · pcg64  range() [single]** | 2.23 | 44,938,367 | 5.67x |
| seedrandom  · default/ARC4  + floor | 3.18 | 31,407,272 | 8.12x |
| seedrandom  · alea  + floor | 0.78 | 128,015,239 | 1.99x |
| seedrandom  · xor128  + floor | 0.39 | 254,877,722 | **fastest** |
| seedrandom  · tychei  + floor | 1.52 | 65,779,520 | 3.87x |
| seedrandom  · xorwow  + floor | 2.19 | 45,745,780 | 5.57x |
| seedrandom  · xor4096  + floor | 2.23 | 44,771,315 | 5.69x |
| seedrandom  · xorshift7  + floor | 0.61 | 164,224,646 | 1.55x |
| pure-rand  · xoroshiro128+  uniformInt | 15.05 | 6,643,356 | 38.37x |
| pure-rand  · xorshift128+  uniformInt | 10.99 | 9,102,609 | 28.00x |
| pure-rand  · mersenne  uniformInt | 11.53 | 8,669,354 | 29.40x |
| pure-rand  · congruential32  uniformInt | 11.12 | 8,992,384 | 28.34x |
| random-js  · Random.integer(1, 999) | 4.85 | 20,612,726 | 12.37x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 2.80 | 35,680,733 | 2.04x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 3.25 | 30,813,393 | 2.36x |
| **@arkv/rng  · xorshift128+  shuffle()** | 1.37 | 72,786,561 | **fastest** |
| **@arkv/rng  · mersenne  shuffle()** | 3.06 | 32,655,834 | 2.23x |
| **@arkv/rng  · lcg32  shuffle()** | 2.12 | 47,249,824 | 1.54x |
| seedrandom  · default/ARC4  Fisher-Yates | 8.99 | 11,128,938 | 6.54x |
| seedrandom  · alea  Fisher-Yates | 4.17 | 24,005,731 | 3.03x |
| seedrandom  · xor128  Fisher-Yates | 7.96 | 12,564,156 | 5.79x |
| seedrandom  · tychei  Fisher-Yates | 9.63 | 10,381,012 | 7.01x |
| seedrandom  · xorwow  Fisher-Yates | 7.90 | 12,664,759 | 5.75x |
| seedrandom  · xor4096  Fisher-Yates | 9.46 | 10,575,869 | 6.88x |
| seedrandom  · xorshift7  Fisher-Yates | 7.55 | 13,251,369 | 5.49x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 12.44 | 8,037,612 | 9.06x |
| pure-rand  · xorshift128+  Fisher-Yates | 16.12 | 6,203,138 | 11.73x |
| pure-rand  · mersenne  Fisher-Yates | 14.28 | 7,002,782 | 10.39x |
| pure-rand  · congruential32  Fisher-Yates | 15.05 | 6,645,919 | 10.95x |
| random-js  · Random.shuffle()  [in-place] | 3.68 | 27,170,007 | 2.68x |

### 6 · String-seeded Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [string seed]** | 1.14 | 87,491,513 | 3.33x |
| **@arkv/rng  · xoroshiro128+  [string seed]** | 1.06 | 94,547,985 | 3.08x |
| **@arkv/rng  · xorshift128+  [string seed]** | 1.03 | 96,619,571 | 3.01x |
| **@arkv/rng  · mersenne  [string seed]** | 1.56 | 64,018,068 | 4.54x |
| **@arkv/rng  · lcg32  [string seed]** | 0.82 | 122,169,336 | 2.38x |
| seedrandom  · default/ARC4  [string seed] | 3.17 | 31,533,824 | 9.23x |
| seedrandom  · alea  [string seed] | 0.79 | 125,841,882 | 2.31x |
| seedrandom  · xor128  [string seed] | 0.34 | 290,939,560 | **fastest** |
| seedrandom  · tychei  [string seed] | 0.71 | 141,307,005 | 2.06x |
| seedrandom  · xorwow  [string seed] | 0.82 | 122,126,516 | 2.38x |
| seedrandom  · xor4096  [string seed] | 0.89 | 112,872,040 | 2.58x |
| seedrandom  · xorshift7  [string seed] | 0.95 | 105,505,376 | 2.76x |
