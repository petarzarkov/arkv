import { describe, expect, it } from 'bun:test';
import { safeStringify } from './string.utils.js';

describe('safeStringify', () => {
  it('stringifies plain objects', () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('stringifies arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('stringifies primitives', () => {
    expect(safeStringify('hello')).toBe('"hello"');
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify(null)).toBe('null');
    expect(safeStringify(true)).toBe('true');
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = safeStringify(obj);
    expect(result).toContain('[Circular]');
    expect(result).toContain('"a":1');
  });

  it('handles nested objects', () => {
    expect(safeStringify({ a: { b: { c: 1 } } })).toBe(
      '{"a":{"b":{"c":1}}}',
    );
  });
});
