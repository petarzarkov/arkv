import { describe, expect, it } from 'bun:test';
import { findNestedError, sanitizeLogEntry } from './sanitize.js';

/**
 * `findNestedError` runs on the caller's object before sanitization, looking for an
 * `Error` to report a stack from. It walked a typed array as if it were a plain
 * object, enumerating every byte and recursing into each one, and no byte can be an
 * `Error`. A 64 KiB buffer cost 24 ms of event loop per log call; a megabyte cost
 * proportionally more.
 *
 * `ArrayBuffer.isView` covers every typed array and `DataView` in one check.
 */
describe('findNestedError over binary data', () => {
  const MB = new Uint8Array(1024 * 1024);

  it('does not walk a typed array byte by byte', () => {
    const started = Bun.nanoseconds();
    expect(findNestedError({ name: 'upload', body: MB })).toBeNull();
    const elapsedMs = (Bun.nanoseconds() - started) / 1e6;

    // Unfixed this is hundreds of milliseconds for a megabyte. The bound is
    // deliberately loose: the defect is three orders of magnitude away from it, so
    // a slow machine cannot make this flaky.
    expect(elapsedMs).toBeLessThan(50);
  });

  it('still finds an error sitting beside binary data', () => {
    const error = new Error('upload failed');

    expect(findNestedError({ body: MB, cause: error })).toBe(error);
    expect(findNestedError({ nested: { body: MB, cause: error } })).toBe(error);
  });

  it('covers a DataView and a raw ArrayBuffer too', () => {
    const buffer = new ArrayBuffer(1024 * 1024);

    const started = Bun.nanoseconds();
    expect(findNestedError({ view: new DataView(buffer) })).toBeNull();
    expect(findNestedError({ raw: buffer })).toBeNull();
    expect((Bun.nanoseconds() - started) / 1e6).toBeLessThan(50);
  });

  /* The sanitizer's own rendering of a typed array is unchanged by the guard. */
  it('leaves what the sanitizer reports about a buffer alone', () => {
    const entry = sanitizeLogEntry(
      { message: 'x', body: new Uint8Array([1, 2, 3]) },
      { maskFields: [], maxArrayLength: 100, maxDepth: 6 },
    );

    expect(JSON.stringify(entry)).toContain('Uint8Array');
  });
});
