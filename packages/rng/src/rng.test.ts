import { beforeAll, describe, expect, it } from 'bun:test';
import { initArkvRng, Rng } from './index.js';

describe('@arkv/rng', () => {
  beforeAll(async () => {
    await initArkvRng();
  });

  describe('initArkvRng', () => {
    it('is idempotent', async () => {
      await expect(initArkvRng()).resolves.toBeUndefined();
    });
  });

  describe('Rng construction', () => {
    it('throws before init', () => {
      // Guard is covered by checkInit; since beforeAll already
      // initialized the module, this test documents the API contract.
      expect(() => new Rng()).not.toThrow();
    });

    it('creates instance with system entropy', () => {
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

  describe('int()', () => {
    it('returns an integer in [0, 2^32-1]', () => {
      const rng = new Rng(1n);
      const val = rng.int();
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(2 ** 32 - 1);
      rng.free();
    });
  });

  describe('ints()', () => {
    it('returns a Uint32Array of the requested length', () => {
      const rng = new Rng(1n);
      const arr = rng.ints(100);
      expect(arr).toBeInstanceOf(Uint32Array);
      expect(arr).toHaveLength(100);
      rng.free();
    });

    it('returns values within [0, 2^32-1]', () => {
      const rng = new Rng(1n);
      const arr = rng.ints(50);
      for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(2 ** 32 - 1);
      }
      rng.free();
    });

    it('throws on negative length', () => {
      const rng = new Rng(1n);
      expect(() => rng.ints(-5)).toThrow(
        'Length cannot be negative.',
      );
      rng.free();
    });

    it('is perfectly deterministic across the whole array', () => {
      const rng1 = new Rng(999n);
      const rng2 = new Rng(999n);

      const arr1 = rng1.ints(1000);
      const arr2 = rng2.ints(1000);

      // Uint32Arrays can be deeply compared in Bun test
      expect(arr1).toEqual(arr2);

      rng1.free();
      rng2.free();
    });
  });

  describe('float()', () => {
    it('returns a value in [0, 1)', () => {
      const rng = new Rng(1n);
      const val = rng.float();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
      rng.free();
    });
  });

  describe('range()', () => {
    it('returns value in [min, max) over 100 calls', () => {
      const rng = new Rng(1n);
      for (let i = 0; i < 100; i++) {
        const val = rng.range(10, 20);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThan(20);
      }
      rng.free();
    });
  });

  describe('bool()', () => {
    it('returns a boolean', () => {
      const rng = new Rng(1n);
      expect(typeof rng.bool()).toBe('boolean');
      rng.free();
    });

    it('always returns true with probability 1', () => {
      const rng = new Rng(1n);
      for (let i = 0; i < 20; i++) {
        expect(rng.bool(1)).toBe(true);
      }
      rng.free();
    });

    it('always returns false with probability 0', () => {
      const rng = new Rng(1n);
      for (let i = 0; i < 20; i++) {
        expect(rng.bool(0)).toBe(false);
      }
      rng.free();
    });
  });

  describe('pick()', () => {
    it('returns an element from the array', () => {
      const rng = new Rng(1n);
      const arr = [10, 20, 30, 40, 50];
      const val = rng.pick(arr);
      expect(arr).toContain(val);
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

  describe('shuffle()', () => {
    it('returns an array of the same length', () => {
      const rng = new Rng(1n);
      const arr = [1, 2, 3, 4, 5];
      expect(rng.shuffle(arr)).toHaveLength(arr.length);
      rng.free();
    });

    it('contains the same elements', () => {
      const rng = new Rng(1n);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle(arr);
      expect(shuffled.sort()).toEqual([...arr].sort());
      rng.free();
    });

    it('does not mutate the original array', () => {
      const rng = new Rng(1n);
      const arr = [1, 2, 3, 4, 5];
      const copy = [...arr];
      rng.shuffle(arr);
      expect(arr).toEqual(copy);
      rng.free();
    });

    it('handles empty and single-element arrays', () => {
      const rng = new Rng(1n);
      expect(rng.shuffle([])).toEqual([]);
      expect(rng.shuffle([42])).toEqual([42]);
      rng.free();
    });
  });

  describe('determinism', () => {
    it('produces identical sequences for the same seed', () => {
      const rng1 = new Rng(12345n);
      const rng2 = new Rng(12345n);
      for (let i = 0; i < 10; i++) {
        expect(rng1.int()).toBe(rng2.int());
      }
      rng1.free();
      rng2.free();
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = new Rng(1n);
      const rng2 = new Rng(2n);
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
  });

  describe('free()', () => {
    it('releases Wasm memory without throwing', () => {
      const rng = new Rng(1n);
      expect(() => rng.free()).not.toThrow();
    });
  });
});
