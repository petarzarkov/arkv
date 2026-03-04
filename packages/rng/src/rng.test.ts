import { describe, expect, it } from 'bun:test';
import { Rng, type RngAlgorithm } from './index.js';

const ALGORITHMS: RngAlgorithm[] = [
  'pcg64',
  'xoroshiro128+',
  'xorshift128+',
  'mersenne',
  'lcg32',
];

describe('@arkv/rng', () => {
  // ── Construction ────────────────────────────────────────────────────────────

  describe('Rng construction', () => {
    it('creates instance with system entropy (default algorithm)', () => {
      const rng = new Rng();
      expect(rng).toBeInstanceOf(Rng);
      rng.free();
    });

    it('creates instance with numeric seed', () => {
      const rng = new Rng(42);
      expect(rng).toBeInstanceOf(Rng);
      rng.free();
    });

    it('creates instance with bigint seed', () => {
      const rng = new Rng(42n);
      expect(rng).toBeInstanceOf(Rng);
      rng.free();
    });
  });

  // ── Per-algorithm tests ────────────────────────────────────────────────────

  for (const algo of ALGORITHMS) {
    describe(`algorithm: '${algo}'`, () => {
      it('creates instance with seed', () => {
        const rng = new Rng(42, algo);
        expect(rng).toBeInstanceOf(Rng);
        rng.free();
      });

      it('creates instance with entropy', () => {
        const rng = new Rng(undefined, algo);
        expect(rng).toBeInstanceOf(Rng);
        rng.free();
      });

      it('int() returns an integer in [0, 2^32-1]', () => {
        const rng = new Rng(1n, algo);
        const val = rng.int();
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(2 ** 32 - 1);
        rng.free();
      });

      it('float() returns a value in [0, 1)', () => {
        const rng = new Rng(1n, algo);
        const val = rng.float();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
        rng.free();
      });

      it('range() returns value in [min, max) over 100 calls', () => {
        const rng = new Rng(1n, algo);
        for (let i = 0; i < 100; i++) {
          const val = rng.range(10, 20);
          expect(val).toBeGreaterThanOrEqual(10);
          expect(val).toBeLessThan(20);
        }
        rng.free();
      });

      it('ints() returns a Uint32Array of the correct length and range', () => {
        const rng = new Rng(1n, algo);
        const arr = rng.ints(50);
        expect(arr).toBeInstanceOf(Uint32Array);
        expect(arr).toHaveLength(50);
        for (const val of arr) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(2 ** 32 - 1);
        }
        rng.free();
      });

      it('floats() returns a Float64Array of values in [0, 1)', () => {
        const rng = new Rng(1n, algo);
        const arr = rng.floats(50);
        expect(arr).toBeInstanceOf(Float64Array);
        expect(arr).toHaveLength(50);
        for (const val of arr) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThan(1);
        }
        rng.free();
      });

      it('ranges() returns a Uint32Array of values in [min, max)', () => {
        const rng = new Rng(1n, algo);
        const arr = rng.ranges(5, 15, 50);
        expect(arr).toBeInstanceOf(Uint32Array);
        expect(arr).toHaveLength(50);
        for (const val of arr) {
          expect(val).toBeGreaterThanOrEqual(5);
          expect(val).toBeLessThan(15);
        }
        rng.free();
      });

      it('is deterministic: same seed → same sequence', () => {
        const rng1 = new Rng(999n, algo);
        const rng2 = new Rng(999n, algo);
        for (let i = 0; i < 10; i++) {
          expect(rng1.int()).toBe(rng2.int());
        }
        rng1.free();
        rng2.free();
      });

      it('ints() is deterministic across arrays', () => {
        const rng1 = new Rng(999n, algo);
        const rng2 = new Rng(999n, algo);
        expect(rng1.ints(100)).toEqual(rng2.ints(100));
        rng1.free();
        rng2.free();
      });

      it('produces different sequences for different seeds', () => {
        const rng1 = new Rng(1n, algo);
        const rng2 = new Rng(2n, algo);
        const seq1 = Array.from({ length: 5 }, () =>
          rng1.int(),
        );
        const seq2 = Array.from({ length: 5 }, () =>
          rng2.int(),
        );
        expect(seq1).not.toEqual(seq2);
        rng1.free();
        rng2.free();
      });

      it('shuffle() returns same elements in (likely) different order', () => {
        const rng = new Rng(1n, algo);
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const shuffled = rng.shuffle(arr);
        expect(shuffled).toHaveLength(arr.length);
        expect(shuffled.sort()).toEqual([...arr].sort());
        expect(arr).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        ]); // not mutated
        rng.free();
      });

      it('free() releases Wasm memory without throwing', () => {
        const rng = new Rng(1n, algo);
        expect(() => rng.free()).not.toThrow();
      });
    });
  }

  // ── Cross-algorithm isolation ───────────────────────────────────────────────

  describe('cross-algorithm isolation', () => {
    it('different algorithms with the same seed produce different sequences', () => {
      // Collect the first int from every algorithm
      const results = ALGORITHMS.map(algo => {
        const rng = new Rng(12345n, algo);
        const val = rng.int();
        rng.free();
        return val;
      });
      // At least two values must differ (all distinct algorithms)
      const unique = new Set(results);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  // ── Shared method tests (default algorithm) ────────────────────────────────

  describe('bool()', () => {
    it('returns a boolean', () => {
      const rng = new Rng(1n);
      expect(typeof rng.bool()).toBe('boolean');
      rng.free();
    });

    it('always returns true with probability 1', () => {
      const rng = new Rng(1n);
      for (let i = 0; i < 20; i++)
        expect(rng.bool(1)).toBe(true);
      rng.free();
    });

    it('always returns false with probability 0', () => {
      const rng = new Rng(1n);
      for (let i = 0; i < 20; i++)
        expect(rng.bool(0)).toBe(false);
      rng.free();
    });
  });

  describe('pick()', () => {
    it('returns an element from the array', () => {
      const rng = new Rng(1n);
      const arr = [10, 20, 30, 40, 50];
      expect(arr).toContain(rng.pick(arr));
      rng.free();
    });

    it('returns the only element of a single-item array', () => {
      const rng = new Rng(1n);
      expect(rng.pick(['only'])).toBe('only');
      rng.free();
    });

    it('throws on an empty array', () => {
      const rng = new Rng(1n);
      expect(() => rng.pick([])).toThrow(
        'Cannot pick from an empty array.',
      );
      rng.free();
    });
  });

  describe('ints() error handling', () => {
    it('throws on negative length', () => {
      const rng = new Rng(1n);
      expect(() => rng.ints(-5)).toThrow(
        'Length cannot be negative.',
      );
      rng.free();
    });
  });

  describe('shuffle() edge cases', () => {
    it('handles empty array', () => {
      const rng = new Rng(1n);
      expect(rng.shuffle([])).toEqual([]);
      rng.free();
    });

    it('handles single-element array', () => {
      const rng = new Rng(1n);
      expect(rng.shuffle([42])).toEqual([42]);
      rng.free();
    });
  });
});
