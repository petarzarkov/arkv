import { describe, expect, it } from 'bun:test';
import { clamp, randomInt } from './number.utils.js';

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('clamps to min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above', () => {
    expect(clamp(20, 0, 10)).toBe(10);
  });

  it('handles equal min and max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it('throws when min > max', () => {
    expect(() => clamp(5, 10, 1)).toThrow(RangeError);
  });
});

describe('randomInt', () => {
  it('returns an integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInt(1, 10);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('works when min equals max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('throws for non-integer arguments', () => {
    expect(() => randomInt(1.5, 10)).toThrow(TypeError);
    expect(() => randomInt(1, 10.5)).toThrow(TypeError);
  });

  it('throws when min > max', () => {
    expect(() => randomInt(10, 1)).toThrow(RangeError);
  });
});
