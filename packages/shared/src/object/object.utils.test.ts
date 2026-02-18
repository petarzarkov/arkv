import { describe, expect, it } from 'bun:test';
import { deepClone, omit, pick } from './object.utils.js';

describe('deepClone', () => {
  it('clones primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
    expect(deepClone(true)).toBe(true);
  });

  it('clones objects without reference', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    cloned.b.c = 99;
    expect(obj.b.c).toBe(2);
  });

  it('clones arrays without reference', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    (cloned[1] as number[])[0] = 99;
    expect((arr[1] as number[])[0]).toBe(2);
  });
});

describe('pick', () => {
  it('picks specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores keys not in the object', () => {
    const obj = { a: 1 } as Record<string, unknown>;
    expect(
      pick(obj, ['a', 'z'] as (keyof typeof obj)[]),
    ).toEqual({
      a: 1,
    });
  });

  it('returns empty object for empty keys', () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });
});

describe('omit', () => {
  it('omits specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('returns full object when omitting nothing', () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
  });

  it('does not mutate the original', () => {
    const obj = { a: 1, b: 2 };
    omit(obj, ['a']);
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});
