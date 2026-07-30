import { safeEntries } from '@arkv/shared';
import type { LogEntry } from './types.js';

export interface SanitizeOptions {
  maskFields: string[];
  maxArrayLength: number;
  maxDepth: number;
}

const MASKED = '[MASKED]';

export const DEFAULT_MAX_DEPTH = 32;

function shouldMask(key: string, maskFields: string[]): boolean {
  const lower = key.toLowerCase();
  return maskFields.some((field) => lower.includes(field.toLowerCase()));
}

interface FileLike {
  name: string;
  size: number;
  type: string;
}

/**
 * Duck-typed rather than `instanceof File`, so a runtime's own file handle is
 * described the same way. Checked before `Blob`, which `File` extends.
 *
 * The property *types* are checked, not merely their presence: some runtimes
 * answer `'name' in blob` with `true` for a plain `Blob` — the key exists holding
 * `undefined` — so a presence check describes every Blob as `[File: undefined …]`.
 */
function isFileLike(value: object): value is FileLike {
  return (
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { size?: unknown }).size === 'number' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

function describeFile(file: FileLike): string {
  return `[File: ${file.name} (${file.size} bytes, ${file.type})]`;
}

function sanitizeFormData(form: FormData): LogEntry | string {
  const entries: LogEntry = {};
  try {
    for (const [key, value] of form.entries()) {
      entries[key] = typeof value === 'string' ? value : describeFile(value);
    }
    return { '[FormData]': entries };
  } catch {
    return '[FormData: unable to read entries]';
  }
}

/**
 * `JSON.stringify(new Map([['a', 1]]))` is `{}` — the entries are invisible to it,
 * so a Map logged as-is loses everything silently. Kept as `[key, value]` pairs
 * because a Map's keys need not be strings, and masked by key so
 * `new Map([['password', x]])` is no more of a leak than `{ password: x }`.
 */
function sanitizeMap(
  map: ReadonlyMap<unknown, unknown>,
  options: SanitizeOptions,
  visited: WeakSet<object>,
  depth: number,
): LogEntry {
  const pairs: unknown[] = [];
  for (const [key, value] of map) {
    if (pairs.length >= options.maxArrayLength) {
      pairs.push(
        `[TRUNCATED: ${map.size - options.maxArrayLength} more entries]`,
      );
      break;
    }
    pairs.push([
      makeSafeForJson(key, options, visited, depth + 1),
      typeof key === 'string' && shouldMask(key, options.maskFields)
        ? MASKED
        : makeSafeForJson(value, options, visited, depth + 1),
    ]);
  }
  return { '[Map]': pairs };
}

function sanitizeArray(
  array: unknown[],
  options: SanitizeOptions,
  visited: WeakSet<object>,
  depth: number,
): unknown[] {
  const kept = Math.min(array.length, options.maxArrayLength);
  const cleaned: unknown[] = [];
  for (let index = 0; index < kept; index += 1) {
    cleaned.push(makeSafeForJson(array[index], options, visited, depth + 1));
  }
  if (array.length > kept) {
    cleaned.push(`[TRUNCATED: ${array.length - kept} more items]`);
  }
  return cleaned;
}

function sanitizeObject(
  obj: Record<string, unknown>,
  options: SanitizeOptions,
  visited: WeakSet<object>,
  depth: number,
): LogEntry {
  const cleaned: LogEntry = {};
  for (const [key, value] of safeEntries(obj)) {
    if (value === undefined || value === null) {
      continue;
    }
    cleaned[key] = shouldMask(key, options.maskFields)
      ? MASKED
      : makeSafeForJson(value, options, visited, depth + 1);
  }
  return cleaned;
}

function makeSafeForJson(
  value: unknown,
  options: SanitizeOptions,
  visited: WeakSet<object>,
  depth: number,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const valueType = typeof value;

  if (valueType === 'function') {
    return `[Function: ${(value as { name?: string }).name || 'anonymous'}]`;
  }

  if (valueType === 'symbol') {
    return `[Symbol: ${(value as symbol).toString()}]`;
  }

  if (valueType === 'bigint') {
    return `[BigInt: ${(value as bigint).toString()}]`;
  }

  if (valueType !== 'object') {
    return value;
  }

  const obj = value as object;

  if (obj instanceof Date) {
    // `new Date('nope').toISOString()` throws a RangeError. A log call must not.
    return Number.isNaN(obj.getTime())
      ? '[Date: Invalid Date]'
      : obj.toISOString();
  }

  if (obj instanceof RegExp) {
    return `[RegExp: ${obj.toString()}]`;
  }

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack?.replace(/\n(\s+)?/g, ','),
    };
  }

  if (typeof FormData !== 'undefined' && obj instanceof FormData) {
    return sanitizeFormData(obj);
  }

  if (isFileLike(obj)) {
    return describeFile(obj);
  }

  if (typeof Blob !== 'undefined' && obj instanceof Blob) {
    return `[Blob: ${obj.size} bytes, ${obj.type}]`;
  }

  if (obj instanceof ArrayBuffer) {
    return `[ArrayBuffer: ${obj.byteLength} bytes]`;
  }

  // A typed array is JSON-serializable as {"0":1,"1":2,…}, which turns a
  // megabyte buffer into a megabyte of log. Its byte length is the useful part.
  if (ArrayBuffer.isView(obj)) {
    return `[${obj.constructor.name}: ${obj.byteLength} bytes]`;
  }

  if (visited.has(obj)) {
    return { '[Circular]': 'circular reference detected' };
  }

  if (depth > options.maxDepth) {
    return `[TRUNCATED: max depth ${options.maxDepth}]`;
  }

  // Added for the descent and removed after it, so `visited` holds the current
  // path rather than every object ever seen: a value reachable through two
  // different keys is shared, not circular, and has to serialize both times.
  visited.add(obj);
  try {
    if (Array.isArray(obj)) {
      return sanitizeArray(obj, options, visited, depth);
    }
    if (obj instanceof Map) {
      return sanitizeMap(obj, options, visited, depth);
    }
    if (obj instanceof Set) {
      return {
        '[Set]': sanitizeArray(
          Array.from(obj as ReadonlySet<unknown>),
          options,
          visited,
          depth,
        ),
      };
    }
    return sanitizeObject(
      obj as Record<string, unknown>,
      options,
      visited,
      depth,
    );
  } finally {
    visited.delete(obj);
  }
}

export function sanitizeLogEntry(
  obj: LogEntry,
  options: SanitizeOptions,
): LogEntry {
  return sanitizeObject(obj, options, new WeakSet<object>([obj]), 0);
}

function searchForError(
  value: unknown,
  maxDepth: number,
  visited: WeakSet<object>,
  depth: number,
): Error | null {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value !== 'object' || value === null || depth > maxDepth) {
    return null;
  }

  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = searchForError(item, maxDepth, visited, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [, entry] of safeEntries(value as Record<string, unknown>)) {
    const found = searchForError(entry, maxDepth, visited, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * The first `Error` anywhere in the value, so `log({ result: { cause: err } })`
 * still reports a stack instead of an opaque object. Arrays and objects are
 * walked alike at every depth.
 *
 * Bounded by the same `maxDepth` as the sanitizer, and for the same reason: this
 * runs on the caller's object before sanitization, so an unbounded walk exhausts
 * the stack from inside the log call. An error deeper than `maxDepth` would sit
 * behind a truncation marker in the output anyway.
 *
 * `visited` is never cleared, unlike in the sanitizer: this is a search, and a
 * subtree already searched cannot start containing an error.
 */
export function findNestedError(
  value: unknown,
  maxDepth = DEFAULT_MAX_DEPTH,
): Error | null {
  return searchForError(value, maxDepth, new WeakSet<object>(), 0);
}
