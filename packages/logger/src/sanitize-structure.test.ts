import { describe, expect, it } from 'bun:test';
import {
  findNestedError,
  sanitizeLogEntry,
  type SanitizeOptions,
} from './sanitize.js';
import { DEFAULT_MASK_FIELDS, type LogEntry } from './types.js';

const baseOptions: SanitizeOptions = {
  maskFields: [...DEFAULT_MASK_FIELDS],
  maxArrayLength: 100,
  maxDepth: 32,
};

const withOptions = (overrides: Partial<SanitizeOptions>): SanitizeOptions => ({
  ...baseOptions,
  ...overrides,
});

const CIRCULAR = { '[Circular]': 'circular reference detected' };

describe('sanitizeLogEntry', () => {
  it('should serialize a value reachable twice, both times', () => {
    const shared = { id: 1 };

    expect(
      sanitizeLogEntry({ left: shared, right: shared }, baseOptions),
    ).toEqual({ left: { id: 1 }, right: { id: 1 } });
  });

  it('should report a real cycle instead of following it', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;

    expect(sanitizeLogEntry({ node }, baseOptions)).toEqual({
      node: { name: 'root', self: CIRCULAR },
    });
  });

  it('should report a cycle back to the entry itself', () => {
    const entry: LogEntry = { message: 'hi' };
    entry.entry = entry;

    expect(sanitizeLogEntry(entry, baseOptions)).toEqual({
      message: 'hi',
      entry: CIRCULAR,
    });
  });

  it('should report a cycle through an array', () => {
    const list: unknown[] = ['a'];
    list.push(list);

    expect(sanitizeLogEntry({ list }, baseOptions)).toEqual({
      list: ['a', CIRCULAR],
    });
  });

  it('should stop at maxDepth', () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 3; index += 1) {
      node = { next: node };
    }

    expect(
      sanitizeLogEntry({ root: node }, withOptions({ maxDepth: 2 })),
    ).toEqual({ root: { next: { next: '[TRUNCATED: max depth 2]' } } });
  });

  // A cycle is caught by reference; depth is what saves an acyclic chain. An
  // untruncated walk of this exhausts the stack from inside the log call.
  it('should survive a structure nested tens of thousands of levels deep', () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 20_000; index += 1) {
      node = { next: node };
    }

    expect(() => sanitizeLogEntry({ node }, baseOptions)).not.toThrow();
  });

  it('should keep Map entries, masked by key, with non-string keys intact', () => {
    const map = new Map<unknown, unknown>([
      ['password', 'hunter2'],
      ['id', 7],
      [1, 'one'],
    ]);

    expect(sanitizeLogEntry({ map }, baseOptions)).toEqual({
      map: {
        '[Map]': [
          ['password', '[MASKED]'],
          ['id', 7],
          [1, 'one'],
        ],
      },
    });
  });

  it('should truncate a Map at maxArrayLength', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    expect(
      sanitizeLogEntry({ map }, withOptions({ maxArrayLength: 1 })),
    ).toEqual({
      map: { '[Map]': [['a', 1], '[TRUNCATED: 2 more entries]'] },
    });
  });

  it('should keep Set entries', () => {
    expect(
      sanitizeLogEntry({ tags: new Set(['a', 'b']) }, baseOptions),
    ).toEqual({ tags: { '[Set]': ['a', 'b'] } });
  });

  it('should describe an invalid Date instead of throwing', () => {
    expect(sanitizeLogEntry({ when: new Date('nope') }, baseOptions)).toEqual({
      when: '[Date: Invalid Date]',
    });
  });

  it('should reduce a binary payload to its size', () => {
    expect(
      sanitizeLogEntry(
        {
          bytes: new Uint8Array([1, 2, 3]),
          view: new DataView(new ArrayBuffer(4)),
          buffer: new ArrayBuffer(8),
          blob: new Blob(['abcd'], { type: 'application/octet-stream' }),
          file: new File(['abc'], 'a.png', { type: 'image/png' }),
        },
        baseOptions,
      ),
    ).toEqual({
      bytes: '[Uint8Array: 3 bytes]',
      view: '[DataView: 4 bytes]',
      buffer: '[ArrayBuffer: 8 bytes]',
      // A plain Blob carries a `name` key holding `undefined` in some runtimes,
      // so a presence check alone would describe it as a File.
      blob: '[Blob: 4 bytes, application/octet-stream]',
      file: '[File: a.png (3 bytes, image/png)]',
    });
  });

  it('should describe FormData entries', () => {
    const form = new FormData();
    form.set('name', 'ada');
    form.set('avatar', new File(['abc'], 'a.png', { type: 'image/png' }));

    expect(sanitizeLogEntry({ form }, baseOptions)).toEqual({
      form: {
        '[FormData]': {
          name: 'ada',
          avatar: '[File: a.png (3 bytes, image/png)]',
        },
      },
    });
  });

  it('should mark a getter that throws rather than failing the call', () => {
    const value = {
      ok: 1,
      get boom(): string {
        throw new Error('reading this throws');
      },
    };

    expect(sanitizeLogEntry({ value }, baseOptions)).toEqual({
      value: { ok: 1, boom: '[Getter: threw]' },
    });
  });

  it('should walk a class instance rather than calling it unserializable', () => {
    class Payload {
      amount = BigInt(9);
      password = 'hunter2';
    }

    expect(sanitizeLogEntry({ payload: new Payload() }, baseOptions)).toEqual({
      payload: { amount: '[BigInt: 9]', password: '[MASKED]' },
    });
  });
});

describe('findNestedError', () => {
  it('should find an error nested through arrays at any depth', () => {
    const error = new Error('deep');

    expect(findNestedError({ a: [[{ b: [error] }]] })).toBe(error);
  });

  it('should return the value itself when it is already an Error', () => {
    const error = new Error('top');

    expect(findNestedError(error)).toBe(error);
  });

  it('should return null when there is no error', () => {
    expect(findNestedError({ a: 1, b: { c: 'error' } })).toBeNull();
  });

  it('should terminate on a cycle through an array', () => {
    const list: unknown[] = [];
    list.push(list);

    expect(findNestedError({ list })).toBeNull();
  });

  it('should terminate on a cycle through an object', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;

    expect(findNestedError(cyclic)).toBeNull();
  });

  it('should survive a getter that throws', () => {
    const value = {
      get boom(): string {
        throw new Error('reading this throws');
      },
    };

    expect(findNestedError(value)).toBeNull();
  });

  it('should not descend past maxDepth', () => {
    const nest = (levels: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { boom: new Error('buried') };
      for (let index = 0; index < levels; index += 1) {
        node = { next: node };
      }
      return node;
    };

    expect(findNestedError(nest(2), 32)).toBeInstanceOf(Error);
    expect(findNestedError(nest(40), 32)).toBeNull();
  });

  it('should not overflow the stack on a deeply nested acyclic object', () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 50_000; index += 1) {
      node = { next: node };
    }

    expect(() => findNestedError({ node })).not.toThrow();
  });
});
