import { describe, expect, it } from 'bun:test';
import {
  deepClone,
  isPlainObject,
  omit,
  pick,
  safeEntries,
} from './object.utils.js';

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
    expect(pick(obj, ['a', 'z'] as (keyof typeof obj)[])).toEqual({
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

describe('isPlainObject', () => {
  it('accepts object literals and null-prototype objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(JSON.parse('{"a":1}'))).toBe(true);
  });

  it('rejects primitives and null', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject('str')).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(Symbol('s'))).toBe(false);
    expect(isPlainObject(isPlainObject)).toBe(false);
  });

  it('rejects arrays and errors', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
    expect(isPlainObject(new Error('boom'))).toBe(false);
    expect(isPlainObject(new TypeError('boom'))).toBe(false);
  });

  // Every case below returned `true` before: the predicate only excluded
  // arrays, errors and null, so anything else object-shaped passed. Spreading
  // one of these into a record copies nothing, which is how Maps handed to the
  // logger lost every entry.
  it('rejects built-in containers whose contents do not survive a spread', () => {
    expect(isPlainObject(new Map([['a', 1]]))).toBe(false);
    expect(isPlainObject(new Set([1]))).toBe(false);
    expect(isPlainObject(new WeakMap())).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(/re/)).toBe(false);
    expect(isPlainObject(new Uint8Array(4))).toBe(false);
    expect(isPlainObject(new ArrayBuffer(4))).toBe(false);
    expect(isPlainObject(Promise.resolve())).toBe(false);
  });

  it('rejects class instances', () => {
    class Payload {
      id = 1;
    }
    expect(isPlainObject(new Payload())).toBe(false);

    class Empty {}
    expect(isPlainObject(new Empty())).toBe(false);
    expect(isPlainObject(Object.create({ inherited: true }))).toBe(false);
  });

  it('narrows to a record', () => {
    const value: unknown = { a: 1 };
    if (isPlainObject(value)) {
      expect(value.a).toBe(1);
    } else {
      throw new Error('expected a plain object');
    }
  });
});

describe('safeEntries', () => {
  it('matches Object.entries for a plain object', () => {
    const obj = { a: 1, b: 'two', c: null };
    expect(safeEntries(obj)).toEqual(Object.entries(obj));
  });

  it('returns an empty list for an empty object', () => {
    expect(safeEntries({})).toEqual([]);
  });

  it('swallows a throwing getter instead of letting it escape', () => {
    const obj = {
      ok: 1,
      get boom(): never {
        throw new Error('getter exploded');
      },
      after: 2,
    };

    expect(() => Object.entries(obj)).toThrow('getter exploded');
    expect(safeEntries(obj)).toEqual([
      ['ok', 1],
      ['boom', '[Getter: threw]'],
      ['after', 2],
    ]);
  });

  it('skips non-enumerable and symbol keys, like Object.entries', () => {
    const sym = Symbol('s');
    const obj: Record<string, unknown> = { visible: 1, [sym]: 2 };
    Object.defineProperty(obj, 'hidden', { value: 3, enumerable: false });

    expect(safeEntries(obj)).toEqual([['visible', 1]]);
  });

  it('reads inherited enumerable keys the way Object.keys sees them', () => {
    const obj = Object.create({ inherited: true }) as Record<string, unknown>;
    obj.own = 1;

    expect(safeEntries(obj)).toEqual([['own', 1]]);
  });
});
