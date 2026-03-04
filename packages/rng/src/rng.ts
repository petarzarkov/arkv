import './init.js';
import { ArkvRng as WasmRng } from './wasm/arkv_rng.js';

export type RngAlgorithm =
  | 'pcg64'
  | 'xoroshiro128+'
  | 'xorshift128+'
  | 'mersenne'
  | 'lcg32';

export class Rng {
  private engine: WasmRng;

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
    if (seed !== undefined) {
      if (typeof seed === 'string') {
        this.engine = WasmRng.from_str_seed(
          seed,
          algorithm,
        );
      } else {
        this.engine = new WasmRng(BigInt(seed), algorithm);
      }
    } else {
      this.engine = WasmRng.from_entropy(algorithm);
    }
  }

  /** Random unsigned 32-bit integer [0, 2^32). */
  public int(): number {
    return this.engine.next_u32();
  }

  /** * Generates an array of `length` random unsigned 32-bit integers
   * in a single WebAssembly boundary crossing.
   * Returns a highly optimized Uint32Array.
   */
  public ints(length: number): Uint32Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    return this.engine.next_u32_array(length);
  }

  /** Random float in [0, 1). */
  public float(): number {
    return this.engine.next_float();
  }

  /**
   * Generates an array of `length` random floats in [0, 1)
   * in a single WebAssembly boundary crossing.
   * Returns a Float64Array.
   */
  public floats(length: number): Float64Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    return this.engine.next_f64_array(length);
  }

  /** Random integer in [min, max). */
  public range(min: number, max: number): number {
    return this.engine.next_range(min, max);
  }

  /**
   * Generates an array of `length` random integers in [min, max)
   * in a single WebAssembly boundary crossing.
   * Returns a Uint32Array.
   */
  public ranges(
    min: number,
    max: number,
    length: number,
  ): Uint32Array {
    if (length < 0) {
      throw new Error('Length cannot be negative.');
    }
    return this.engine.next_range_array(min, max, length);
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

    // Single Wasm boundary crossing!
    const indices = this.engine.next_shuffle_indices(len);

    let indexPointer = 0;
    for (let i = len - 1; i > 0; i--) {
      // Pull the pre-calculated random index
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
