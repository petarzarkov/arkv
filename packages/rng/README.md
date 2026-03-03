# @arkv/rng

Seedable, isomorphic pseudo-random number generator powered by **Rust + WebAssembly** (PCG64 algorithm). Works identically in Node.js, Bun, and the browser — no native compilation required.

## Benchmark

- PRNGs with N=100000 iterations

```
--- Sequential Integer Generation (100k) ---
@arkv/rng (Wasm single) : 2.66 ms
seedrandom (JS float*N) : 5.00 ms
pure-rand (JS engine)   : 11.98 ms

--- Batched Integer Generation (100k array) ---
@arkv/rng (Wasm batched) : 1.20 ms
pure-rand (manual loop)  : 12.91 ms

--- Array Shuffling (100k elements) ---
@arkv/rng (Wasm batched indices) : 2.88 ms
seedrandom (JS Fisher-Yates)     : 6.09 ms
```

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

rng.ints(100);                // Returns a fast Uint32Array of 100 random integers
rng.pick([1, 2, 3, 4, 5]);    // Returns a random element
rng.shuffle([1, 2, 3, 4, 5]); // Returns a new, randomly shuffled array
rng.bool(0.8);                // Returns true 80% of the time
```
## High Performance

@arkv/rng is heavily optimized for zero-overhead boundary crossing. Calling .int() repeatedly inside a JavaScript loop incurs microscopic overhead as execution passes between JS and WebAssembly.

To bypass this for large datasets, use .ints(N) and .shuffle(array). These methods calculate the entire sequence of numbers or Fisher-Yates indices natively in Rust and return the results as a single batched Uint32Array, providing up to a 1.6x speedup for large arrays.

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
| `range(min, max)` | `number` | Random integer in `[min, max)` |
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
