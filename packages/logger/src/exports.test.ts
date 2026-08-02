import { describe, expect, it } from 'bun:test';
import * as logger from './index';

describe('the public surface', () => {
  /*
   * `sanitize.ts` was built into every published tarball and exported from
   * nowhere: not re-exported here, and absent from the `exports` map, so
   * `@arkv/logger/sanitize` did not resolve either.
   */
  it('exports the sanitizer', () => {
    expect(typeof logger.sanitizeLogEntry).toBe('function');
    expect(typeof logger.findNestedError).toBe('function');
    expect(logger.DEFAULT_MAX_DEPTH).toBeGreaterThan(0);
  });

  it('sanitizes through the public export', () => {
    const entry = { password: 'hunter2', keep: 'yes' };
    const out = logger.sanitizeLogEntry(entry, {
      maskFields: ['password'],
      maxArrayLength: 100,
      maxDepth: logger.DEFAULT_MAX_DEPTH,
    }) as Record<string, unknown>;

    expect(out['keep']).toBe('yes');
    expect(out['password']).not.toBe('hunter2');
  });
});
