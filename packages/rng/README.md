# @arkv/rng

Seedable, zero dependency, blazing fast, isomorphic pseudo-random number generator powered by **Rust + WebAssembly** (PCG64 algorithm). Works identically in Node.js, Bun, and the browser — no native compilation required.

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

Compared against: `seedrandom`, `pure-rand`, `random-js` (Mersenne Twister),
`Math.random()`, and `crypto.getRandomValues()`.

```text
1 · Sequential u32 Integer  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.int()                     │     0.80 │    125,611,414 │    2.56x │
│ Math.random() †                            │     0.31 │    321,837,305 │  fastest │
│ seedrandom                                 │     2.66 │     37,645,415 │    8.55x │
│ pure-rand  · xoroshiro128+                 │    11.06 │      9,044,085 │   35.59x │
│ random-js  · MersenneTwister               │     1.98 │     50,547,889 │    6.37x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

2 · Batched u32 Array (100 k elements)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.ints(N)  [native batch]   │     0.94 │    106,761,300 │    9.61x │
│ Math.random()  loop †                      │     2.05 │     48,748,860 │   21.05x │
│ pure-rand  loop                            │     7.37 │     13,575,100 │   75.61x │
│ random-js  loop                            │     1.76 │     56,721,208 │   18.09x │
│ crypto.getRandomValues()  [bulk fill] †    │     0.10 │  1,026,346,310 │  fastest │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

3 · Float [0, 1)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.floats(N)  [native batch] │     1.43 │     70,072,027 │    6.53x │
│ Math.random() †                            │     0.22 │    457,519,330 │  fastest │
│ @arkv/rng  · Rng.float()  [single]         │     0.76 │    132,325,892 │    3.46x │
│ seedrandom                                 │     2.91 │     34,335,047 │   13.33x │
│ random-js  · Random.real(0, 1)             │     3.14 │     31,835,738 │   14.37x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

4 · Bounded Range [1, 1000)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.ranges(1,1000,N) [batch]  │     1.21 │     82,957,123 │    3.12x │
│ Math.random()  + floor †                   │     0.39 │    258,908,390 │  fastest │
│ @arkv/rng  · Rng.range(1, 1000)  [single]  │     1.08 │     92,261,987 │    2.81x │
│ seedrandom  + floor                        │     3.09 │     32,379,907 │    8.00x │
│ pure-rand  · uniformIntDistribution        │    10.89 │      9,181,969 │   28.20x │
│ random-js  · Random.integer(1, 999)        │     5.95 │     16,804,715 │   15.41x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

5 · Array Shuffle (100 k elements)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.shuffle()  [new array]    │     3.72 │     26,892,557 │  fastest │
│ seedrandom  Fisher-Yates  [in-place]       │     5.33 │     18,776,621 │    1.43x │
│ random-js  · Random.shuffle()  [in-place]  │     6.00 │     16,661,946 │    1.61x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘
```

> † `Math.random()` and `crypto.getRandomValues()` are native V8/OS calls —
> not seedable, no reproducible sequences. Run `bun run bench` on your machine
> for accurate results.
