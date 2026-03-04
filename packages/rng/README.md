# @arkv/rng

Seedable, zero dependency, blazing fast, isomorphic pseudo-random number generator powered by **Rust + WebAssembly** (PCG64 algorithm). Works identically in Node.js, Bun, and the browser — no native compilation required.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Initialization](#initialization)
  - [Basic](#basic)
  - [Seeded (deterministic)](#seeded-deterministic)
  - [Array utilities](#array-utilities)
- [High Performance](#high-performance)
- [API](#api)
- [Benchmark](#benchmark)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Build](#build)
  - [Test](#test)
  - [rust-analyzer](#rust-analyzer)
- [License](#license)

## Install

```bash
bun add @arkv/rng
# or
npm install @arkv/rng
```

## Usage

### Initialization

The Wasm binary must be initialized once before use:

```typescript
import { initArkvRng, Rng } from '@arkv/rng';

await initArkvRng();
```

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

Pass a seed for reproducible sequences:

```typescript
const rng = new Rng(12345n);

console.log(rng.int()); // always the same value
console.log(rng.int()); // always the next value in the sequence
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
## High Performance

@arkv/rng is heavily optimized for zero-overhead boundary crossing. Calling .int() repeatedly inside a JavaScript loop incurs microscopic overhead as execution passes between JS and WebAssembly.

To bypass this for large datasets, use the batch methods: `.ints(N)`, `.floats(N)`, `.ranges(min, max, N)`, and `.shuffle(array)`. These methods compute the entire sequence natively in Rust and return the results as a single typed array, eliminating per-value boundary crossings entirely.

## API

### `initArkvRng(): Promise<void>`

Loads the inlined Wasm binary. Must be awaited once before
creating any `Rng` instance. Safe to call multiple times.

### `new Rng(seed?: number | bigint)`

| Param | Description |
|-------|-------------|
| `seed` | Optional seed for deterministic output. Omit for system entropy. |

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

### rust-analyzer

The repo root contains a `Cargo.toml` workspace that includes this
package. Open the repo root in VS Code and rust-analyzer will
discover the crate automatically — no extra configuration needed.

## Benchmark

Run `bun run build:wasm && bun run bench` to reproduce.

Compared against: `seedrandom` (all 7 algorithm variants), `pure-rand` (all 4 algorithms),
`random-js` (Mersenne Twister).

### 1 · Sequential u32 Integer  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64** | 2.10 | 47,681,283 | 6.87x |
| **@arkv/rng  · xoroshiro128+** | 1.74 | 57,374,256 | 5.71x |
| **@arkv/rng  · xorshift128+** | 0.95 | 104,923,427 | 3.12x |
| **@arkv/rng  · mersenne** | 0.75 | 133,479,805 | 2.46x |
| **@arkv/rng  · lcg32** | 0.63 | 159,705,631 | 2.05x |
| seedrandom  · default/ARC4 | 2.91 | 34,367,202 | 9.54x |
| seedrandom  · alea | 1.37 | 72,799,967 | 4.50x |
| seedrandom  · xor128 | 0.35 | 284,115,931 | 1.15x |
| seedrandom  · tychei | 1.26 | 79,206,603 | 4.14x |
| seedrandom  · xorwow | 2.17 | 46,000,424 | 7.13x |
| seedrandom  · xor4096 | 2.36 | 42,451,687 | 7.72x |
| seedrandom  · xorshift7 | 0.52 | 192,891,560 | 1.70x |
| pure-rand  · xoroshiro128+  (uniform) | 11.31 | 8,841,903 | 37.07x |
| pure-rand  · xorshift128+  (uniform) | 4.67 | 21,417,092 | 15.31x |
| pure-rand  · mersenne  (uniform) | 3.15 | 31,705,308 | 10.34x |
| pure-rand  · congruential32  (uniform) | 2.74 | 36,430,430 | 9.00x |
| random-js  · MersenneTwister | 2.07 | 48,335,051 | 6.78x |

### 2 · Batched u32 Array (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [native batch]** | 0.99 | 101,085,149 | 1.92x |
| **@arkv/rng  · xoroshiro128+  [native batch]** | 0.60 | 166,626,676 | 1.17x |
| **@arkv/rng  · xorshift128+  [native batch]** | 0.69 | 144,505,538 | 1.35x |
| **@arkv/rng  · mersenne  [native batch]** | 0.72 | 138,895,448 | 1.40x |
| **@arkv/rng  · lcg32  [native batch]** | 0.51 | 194,501,444 | **fastest** |
| pure-rand  · xoroshiro128+  loop | 3.62 | 27,636,761 | 7.04x |
| pure-rand  · xorshift128+  loop | 3.97 | 25,173,160 | 7.73x |
| pure-rand  · mersenne  loop | 5.71 | 17,517,694 | 11.10x |
| pure-rand  · congruential32  loop | 3.45 | 29,004,819 | 6.71x |
| random-js  loop | 1.61 | 62,304,985 | 3.12x |

### 3 · Float [0, 1)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  [batch]** | 1.53 | 65,493,889 | 7.42x |
| **@arkv/rng  · xoroshiro128+  [batch]** | 0.42 | 240,644,349 | **fastest** |
| **@arkv/rng  · xorshift128+  [batch]** | 0.93 | 107,326,078 | 4.52x |
| **@arkv/rng  · mersenne  [batch]** | 0.99 | 100,981,745 | 4.81x |
| **@arkv/rng  · lcg32  [batch]** | 0.85 | 117,013,808 | 4.15x |
| **@arkv/rng  · pcg64  [single]** | 1.06 | 94,249,907 | 5.15x |
| seedrandom  · default/ARC4 | 3.03 | 33,046,337 | 14.70x |
| seedrandom  · alea | 0.71 | 140,255,208 | 3.46x |
| seedrandom  · xor128 | 0.34 | 291,030,159 | 1.67x |
| seedrandom  · tychei | 0.63 | 158,460,273 | 3.06x |
| seedrandom  · xorwow | 0.73 | 136,159,088 | 3.57x |
| seedrandom  · xor4096 | 0.90 | 110,683,014 | 4.39x |
| seedrandom  · xorshift7 | 0.73 | 137,484,825 | 3.53x |
| pure-rand  · xoroshiro128+ | 1.45 | 68,902,032 | 7.05x |
| pure-rand  · xorshift128+ | 1.66 | 60,367,554 | 8.04x |
| pure-rand  · mersenne | 2.19 | 45,738,582 | 10.62x |
| pure-rand  · congruential32 | 1.69 | 59,314,584 | 8.19x |
| random-js  · Random.real(0, 1) | 2.10 | 47,664,102 | 10.19x |

### 4 · Bounded Range [1, 1000)  — uniform distribution  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  ranges [batch]** | 1.42 | 70,441,286 | 3.85x |
| **@arkv/rng  · xoroshiro128+  ranges [batch]** | 0.65 | 154,527,501 | 1.75x |
| **@arkv/rng  · xorshift128+  ranges [batch]** | 0.64 | 155,908,463 | 1.74x |
| **@arkv/rng  · mersenne  ranges [batch]** | 0.78 | 127,565,014 | 2.13x |
| **@arkv/rng  · lcg32  ranges [batch]** | 0.65 | 154,395,803 | 1.76x |
| **@arkv/rng  · pcg64  range() [single]** | 1.31 | 76,462,420 | 3.55x |
| seedrandom  · default/ARC4  + floor | 3.09 | 32,388,989 | 8.37x |
| seedrandom  · alea  + floor | 0.70 | 143,147,733 | 1.89x |
| seedrandom  · xor128  + floor | 0.38 | 265,858,457 | 1.02x |
| seedrandom  · tychei  + floor | 1.44 | 69,675,098 | 3.89x |
| seedrandom  · xorwow  + floor | 2.03 | 49,258,463 | 5.50x |
| seedrandom  · xor4096  + floor | 2.08 | 48,138,091 | 5.63x |
| seedrandom  · xorshift7  + floor | 0.53 | 188,503,190 | 1.44x |
| pure-rand  · xoroshiro128+  uniformInt | 11.59 | 8,631,514 | 31.41x |
| pure-rand  · xorshift128+  uniformInt | 10.11 | 9,892,056 | 27.41x |
| pure-rand  · mersenne  uniformInt | 12.03 | 8,311,092 | 32.62x |
| pure-rand  · congruential32  uniformInt | 11.94 | 8,377,802 | 32.36x |
| random-js  · Random.integer(1, 999) | 5.43 | 18,414,209 | 14.72x |

### 5 · Array Shuffle (100 k elements)  (N=100,000)

| Library | ms | ops/sec | vs fastest |
|:--------|---:|-------:|----------:|
| **@arkv/rng  · pcg64  shuffle()** | 2.97 | 33,617,174 | 2.37x |
| **@arkv/rng  · xoroshiro128+  shuffle()** | 2.73 | 36,566,975 | 2.18x |
| **@arkv/rng  · xorshift128+  shuffle()** | 2.85 | 35,026,466 | 2.27x |
| **@arkv/rng  · mersenne  shuffle()** | 2.73 | 36,662,953 | 2.17x |
| **@arkv/rng  · lcg32  shuffle()** | 1.26 | 79,542,851 | **fastest** |
| seedrandom  · default/ARC4  Fisher-Yates | 5.66 | 17,663,142 | 4.50x |
| seedrandom  · alea  Fisher-Yates | 3.07 | 32,536,599 | 2.44x |
| seedrandom  · xor128  Fisher-Yates | 9.01 | 11,099,659 | 7.17x |
| seedrandom  · tychei  Fisher-Yates | 9.99 | 10,013,207 | 7.94x |
| seedrandom  · xorwow  Fisher-Yates | 8.25 | 12,128,457 | 6.56x |
| seedrandom  · xor4096  Fisher-Yates | 8.35 | 11,976,949 | 6.64x |
| seedrandom  · xorshift7  Fisher-Yates | 5.68 | 17,594,136 | 4.52x |
| pure-rand  · xoroshiro128+  Fisher-Yates | 13.14 | 7,610,892 | 10.45x |
| pure-rand  · xorshift128+  Fisher-Yates | 14.97 | 6,679,304 | 11.91x |
| pure-rand  · mersenne  Fisher-Yates | 16.32 | 6,128,425 | 12.98x |
| pure-rand  · congruential32  Fisher-Yates | 16.41 | 6,095,560 | 13.05x |
| random-js  · Random.shuffle()  [in-place] | 6.89 | 14,503,833 | 5.48x |
