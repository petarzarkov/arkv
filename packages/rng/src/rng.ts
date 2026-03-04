import { wasmMemory } from './init.js';
import {
  ArkvLcg32,
  ArkvMersenne,
  ArkvPcg64,
  ArkvXoroshiro128Plus,
  ArkvXorshift128Plus,
} from './wasm/arkv_rng.js';

export type RngAlgorithm =
  | 'pcg64'
  | 'xoroshiro128+'
  | 'xorshift128+'
  | 'mersenne'
  | 'lcg32';

// Structural interface satisfied by all wasm-bindgen-generated RNG classes.
interface WasmEngine {
  next_u32(): number;
  next_float(): number;
  next_range(min: number, max: number): number;
  fill_u32s(length: number): number;
  fill_f64s(length: number): number;
  fill_range_u32s(
    min: number,
    max: number,
    length: number,
  ): number;
  fill_shuffle_u32s(length: number): number;
  free(): void;
}

function makeEngine(
  algorithm: RngAlgorithm,
  seed: number | bigint | string | undefined,
): WasmEngine {
  if (seed !== undefined) {
    if (typeof seed === 'string') {
      switch (algorithm) {
        case 'pcg64':
          return ArkvPcg64.from_str_seed(seed);
        case 'xoroshiro128+':
          return ArkvXoroshiro128Plus.from_str_seed(seed);
        case 'xorshift128+':
          return ArkvXorshift128Plus.from_str_seed(seed);
        case 'mersenne':
          return ArkvMersenne.from_str_seed(seed);
        case 'lcg32':
          return ArkvLcg32.from_str_seed(seed);
      }
    } else {
      const s = BigInt(seed);
      switch (algorithm) {
        case 'pcg64':
          return new ArkvPcg64(s);
        case 'xoroshiro128+':
          return new ArkvXoroshiro128Plus(s);
        case 'xorshift128+':
          return new ArkvXorshift128Plus(s);
        case 'mersenne':
          return new ArkvMersenne(s);
        case 'lcg32':
          return new ArkvLcg32(s);
      }
    }
  } else {
    switch (algorithm) {
      case 'pcg64':
        return ArkvPcg64.from_entropy();
      case 'xoroshiro128+':
        return ArkvXoroshiro128Plus.from_entropy();
      case 'xorshift128+':
        return ArkvXorshift128Plus.from_entropy();
      case 'mersenne':
        return ArkvMersenne.from_entropy();
      case 'lcg32':
        return ArkvLcg32.from_entropy();
    }
  }
}

export class Rng {
  private engine: WasmEngine;

  /**
   * Pass a seed for deterministic output, or omit for system entropy.
   * `algorithm` selects the PRNG backend (default: `'pcg64'`).
   *
   * String seeds are hashed to a u64 via FNV-1a 64-bit (UTF-8 bytes) inside
   * the WebAssembly layer, so `new Rng('hello.')` is fully deterministic and
   * cross-platform. Note that `new Rng('42')` and `new Rng(42)` produce
   * different sequences.
   */
  constructor(
    seed?: number | bigint | string,
    algorithm: RngAlgorithm = 'pcg64',
  ) {
    this.engine = makeEngine(algorithm, seed);
  }

  /** Random unsigned 32-bit integer [0, 2^32). */
  public int(): number {
    return this.engine.next_u32();
  }

  /**
   * Generates an array of `length` random unsigned 32-bit integers
   * in a single WebAssembly boundary crossing.
   * Returns a Uint32Array view into WASM memory — valid until the next
   * call on this instance. Call `.slice()` if you need a persistent copy.
   */
  public ints(length: number): Uint32Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    if (length === 0) return new Uint32Array(0);
    const ptr = this.engine.fill_u32s(length);
    return new Uint32Array(wasmMemory.buffer, ptr, length);
  }

  /** Random float in [0, 1). */
  public float(): number {
    return this.engine.next_float();
  }

  /**
   * Generates an array of `length` random floats in [0, 1)
   * in a single WebAssembly boundary crossing.
   * Returns a Float64Array view into WASM memory — valid until the next
   * call on this instance. Call `.slice()` if you need a persistent copy.
   */
  public floats(length: number): Float64Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    if (length === 0) return new Float64Array(0);
    const ptr = this.engine.fill_f64s(length);
    return new Float64Array(wasmMemory.buffer, ptr, length);
  }

  /** Random integer in [min, max). */
  public range(min: number, max: number): number {
    return this.engine.next_range(min, max);
  }

  /**
   * Generates an array of `length` random integers in [min, max)
   * in a single WebAssembly boundary crossing.
   * Returns a Uint32Array view into WASM memory — valid until the next
   * call on this instance. Call `.slice()` if you need a persistent copy.
   */
  public ranges(
    min: number,
    max: number,
    length: number,
  ): Uint32Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    if (length === 0) return new Uint32Array(0);
    const ptr = this.engine.fill_range_u32s(
      min,
      max,
      length,
    );
    return new Uint32Array(wasmMemory.buffer, ptr, length);
  }

  /**
   * Random boolean. `probability` controls the chance of
   * returning `true` (default 0.5).
   */
  public bool(probability = 0.5): boolean {
    return this.float() < probability;
  }

  /**
   * Pick a uniformly random element from a non-empty array.
   * Throws if the array is empty.
   */
  public pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from an empty array.');
    }
    return array[this.range(0, array.length)] as T;
  }

  /**
   * Return a new array with the same elements in a random
   * order (Fisher-Yates). The original is not mutated.
   */
  public shuffle<T>(array: readonly T[]): T[] {
    const len = array.length;
    const result = [...array];

    if (len <= 1) {
      return result;
    }

    // Single Wasm boundary crossing — zero-copy view into preallocated buffer.
    const ptr = this.engine.fill_shuffle_u32s(len);
    const indices = new Uint32Array(
      wasmMemory.buffer,
      ptr,
      len - 1,
    );

    let indexPointer = 0;
    for (let i = len - 1; i > 0; i--) {
      const j = indices[indexPointer++];
      const tmp = result[i] as T;
      result[i] = result[j] as T;
      result[j] = tmp;
    }

    return result;
  }

  /** Free Wasm memory. Call when the instance is no longer needed. */
  public free(): void {
    this.engine.free();
  }
}
