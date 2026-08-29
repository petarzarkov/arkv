import type { LogEntry } from './types.js';

/**
 * `Object.assign` for a source that came from outside the process.
 *
 * Both `Object.assign` and a plain `target[key] = value` copy with `[[Set]]`, so a
 * key named `__proto__` invokes the prototype setter instead of creating a
 * property. Two things follow, and neither is acceptable in a logger: the field is
 * silently dropped, and the target's prototype becomes whatever was logged.
 * `logger.info('req', JSON.parse(body))` is enough to reach it.
 *
 * Object spread does not have this problem, because it uses `CreateDataProperty`.
 * Where a spread is the natural shape, use one; this is for the places that merge
 * into an object that already exists.
 */
export function assignFields(
  target: LogEntry,
  source: Record<string, unknown> | undefined,
): void {
  if (!source) {
    return;
  }
  for (const key of Object.keys(source)) {
    defineField(target, key, source[key]);
  }
}

/** One field, with the same `__proto__` guarantee as {@link assignFields}. */
export function defineField(
  target: LogEntry,
  key: string,
  value: unknown,
): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }
  target[key] = value;
}
