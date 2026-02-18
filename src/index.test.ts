import { describe, expect, it, mock } from 'bun:test';
import {
  chunk,
  clamp,
  debounce,
  deepClone,
  groupBy,
  omit,
  pick,
  randomInt,
  retry,
  sleep,
  unique,
} from './index';

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

describe('groupBy', () => {
  it('groups items by the key function', () => {
    const items = [
      { type: 'fruit', name: 'apple' },
      { type: 'vegetable', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ];
    const result = groupBy(items, i => i.type);
    expect(result).toEqual({
      fruit: [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
      ],
      vegetable: [{ type: 'vegetable', name: 'carrot' }],
    });
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], () => 'key')).toEqual({});
  });

  it('handles single-item groups', () => {
    const result = groupBy([1, 2, 3], n => String(n));
    expect(Object.keys(result)).toHaveLength(3);
    expect(result['1']).toEqual([1]);
  });
});

describe('unique', () => {
  it('removes duplicate primitives', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it('removes duplicates by key function', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 1, name: 'c' },
    ];
    const result = unique(items, i => i.id);
    expect(result).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([]);
  });

  it('handles strings', () => {
    expect(unique(['a', 'b', 'a', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it('handles exact divisions', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('handles chunk size larger than array', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('handles empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('throws for size < 1', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], -1)).toThrow(RangeError);
  });
});

describe('retry', () => {
  it('returns on first success', async () => {
    const fn = mock(() => Promise.resolve('ok'));
    const result = await retry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const fn = mock(() => {
      calls++;
      if (calls < 3)
        return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    });
    const result = await retry(fn, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const fn = mock(() =>
      Promise.reject(new Error('always fails')),
    );
    await expect(retry(fn, 2, 0)).rejects.toThrow(
      'always fails',
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('debounce', () => {
  it('delays function execution', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await sleep(80);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on subsequent calls', async () => {
    const fn = mock(() => {});
    const debounced = debounce(fn, 50);
    debounced();
    await sleep(30);
    debounced();
    await sleep(30);
    expect(fn).not.toHaveBeenCalled();
    await sleep(50);
    expect(fn).toHaveBeenCalledTimes(1);
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

describe('sleep', () => {
  it('resolves after the given time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
