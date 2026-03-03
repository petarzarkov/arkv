# @arkv/rng

Seedable, blazing fast, isomorphic pseudo-random number generator powered by **Rust + WebAssembly** (PCG64 algorithm). Works identically in Node.js, Bun, and the browser — no native compilation required.

## Benchmark

Run `bun run build:wasm && bun run bench` to reproduce.

Compared against: `seedrandom`, `pure-rand`, `random-js` (Mersenne Twister),
`Math.random()`, and `crypto.getRandomValues()`.

```
1 · Sequential u32 Integer  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ Math.random()                        †     │     0.15 │    651,597,391 │  fastest │
│ @arkv/rng  · Rng.int()                     │     0.80 │    125,083,493 │    5.21x │
│ random-js  · MersenneTwister               │     1.92 │     52,114,331 │   12.50x │
│ seedrandom                                 │     2.81 │     35,625,324 │   18.29x │
│ pure-rand  · xoroshiro128+                 │     7.87 │     12,700,637 │   51.30x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

2 · Batched u32 Array (100 k elements)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ crypto.getRandomValues()  [bulk fill] †    │     0.07 │  1,414,047,144 │  fastest │
│ @arkv/rng  · Rng.ints(N)  [native batch]   │     0.72 │    138,695,101 │   10.20x │
│ Math.random()  loop                  †     │     1.26 │     79,644,277 │   17.75x │
│ random-js  loop                            │     1.32 │     75,750,575 │   18.67x │
│ pure-rand  loop                            │     3.88 │     25,795,960 │   54.82x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

3 · Float [0, 1)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ Math.random()                        †     │     0.15 │    679,675,659 │  fastest │
│ @arkv/rng  · Rng.float()  [single]         │     0.83 │    119,907,815 │    5.67x │
│ @arkv/rng  · Rng.floats(N)  [native batch] │     0.91 │    109,450,624 │    6.21x │
│ random-js  · Random.real(0, 1)             │     2.11 │     47,351,669 │   14.35x │
│ seedrandom                                 │     2.79 │     35,857,935 │   18.95x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

4 · Bounded Range [1, 1000)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ Math.random()  + floor               †     │     0.29 │    347,092,063 │  fastest │
│ @arkv/rng  · Rng.ranges(1,1000,N) [batch]  │     0.92 │    108,613,720 │    3.20x │
│ @arkv/rng  · Rng.range(1, 1000)  [single]  │     1.58 │     63,216,280 │    5.49x │
│ seedrandom  + floor                        │     3.16 │     31,612,257 │   10.98x │
│ random-js  · Random.integer(1, 999)        │     4.70 │     21,283,701 │   16.31x │
│ pure-rand  · uniformIntDistribution        │     8.74 │     11,441,404 │   30.34x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘

5 · Array Shuffle (100 k elements)  (N=100,000)
┌────────────────────────────────────────────┬──────────┬────────────────┬──────────┐
│ Library                                    │       ms │        ops/sec │ slowdown │
├────────────────────────────────────────────┼──────────┼────────────────┼──────────┤
│ @arkv/rng  · Rng.shuffle()  [new array]    │     2.12 │     47,076,170 │  fastest │
│ random-js  · Random.shuffle()  [in-place]  │     3.83 │     26,124,899 │    1.80x │
│ seedrandom  Fisher-Yates  [in-place]       │     4.86 │     20,568,048 │    2.29x │
└────────────────────────────────────────────┴──────────┴────────────────┴──────────┘
```

> † `Math.random()` and `crypto.getRandomValues()` are native V8/OS calls —
> not seedable, no reproducible sequences. Run `bun run bench` on your machine
> for accurate results.

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
