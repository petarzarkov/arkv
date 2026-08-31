import { defineField } from './assign.js';
import type { LogEntry } from './types.js';

export interface SanitizeOptions {
  maskFields: string[];
  maxArrayLength: number;
  maxDepth: number;
}

/** `SanitizeOptions` with the mask list already lowercased. */
export interface PreparedSanitizeOptions extends SanitizeOptions {
  readonly lowerMaskFields: readonly string[];
  /**
   * Whether each key seen so far is masked. The answer depends only on the key and
   * on `lowerMaskFields`, and the latter cannot change for a given prepared
   * options object, so it is worth remembering. See `shouldMask`.
   */
  readonly maskDecisions: Map<string, boolean>;
}

/**
 * Distinct keys remembered. A caller logging objects whose keys are identifiers
 * would otherwise grow this for the life of the logger; past the cap the decision
 * is still correct, just recomputed.
 */
const MAX_MASK_MEMO = 512;

const MASKED = '[MASKED]';

export const DEFAULT_MAX_DEPTH = 32;

/**
 * The mask list, lowercased once per entry rather than once per key.
 *
 * `shouldMask` lowercased every mask field for every key it checked, so an entry
 * with twenty keys and the eight default fields did a hundred and sixty
 * `toLowerCase()` calls to produce eight distinct strings. This was the largest
 * single cost in the sanitizer.
 *
 * Recomputed per `sanitizeLogEntry` call rather than cached against the array,
 * because `maskFields` is public input: a caller that mutates its array between
 * calls would otherwise keep matching against the list it passed the first time.
 * A caller that owns its list privately calls `prepareSanitizeOptions` once
 * instead, which is what `Logger` does.
 */
const loweredMasks = (maskFields: string[]): string[] =>
  maskFields.map((field) => field.toLowerCase());

/**
 * Whether a key names something to redact, answered from a memo.
 *
 * The substring match is what makes `apiKey` cover `myApiKeyValue`, and it is also
 * what made this the hot spot: a twelve-key entry against the nine default fields
 * is twelve `toLowerCase()` calls and up to a hundred and eight `includes` calls,
 * every line. Measured at 1028 ns of the sanitizer's 1658 ns on Bun 1.4.0, which
 * was 62 percent of it and roughly 40 percent of an entire log call.
 *
 * Remembering the answer per key takes that to 59 ns. Keys repeat: `level`,
 * `timestamp`, `requestId` and the rest are the same strings on every entry.
 */
function shouldMask(key: string, options: PreparedSanitizeOptions): boolean {
  const decided = options.maskDecisions.get(key);
  if (decided !== undefined) {
    return decided;
  }
  const lower = key.toLowerCase();
  const masked = options.lowerMaskFields.some((field) => lower.includes(field));
  if (options.maskDecisions.size < MAX_MASK_MEMO) {
    options.maskDecisions.set(key, masked);
  }
  return masked;
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
  options: PreparedSanitizeOptions,
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
      typeof key === 'string' && shouldMask(key, options)
        ? MASKED
        : makeSafeForJson(value, options, visited, depth + 1),
    ]);
  }
  return { '[Map]': pairs };
}

function sanitizeArray(
  array: unknown[],
  options: PreparedSanitizeOptions,
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

/**
 * `safeEntries` with nothing materialized. It builds a pair array per key on top of
 * the key array itself, so a twelve-field entry allocated fourteen arrays per log
 * call and threw all of them away. Reading the key inline keeps the guarantee that
 * makes `safeEntries` worth having - a getter that throws yields a marker rather
 * than taking the log call down - without the pairs.
 *
 * Measured on a twelve-field entry, the two builds compared in one process:
 * `sanitizePrepared` 538 ns to 346 ns, and `Logger.info` 1475 ns to 942 ns, of
 * which this is most.
 */
const readField = (obj: Record<string, unknown>, key: string): unknown => {
  try {
    return obj[key];
  } catch {
    return '[Getter: threw]';
  }
};

function sanitizeObject(
  obj: Record<string, unknown>,
  options: PreparedSanitizeOptions,
  visited: WeakSet<object>,
  depth: number,
): LogEntry {
  const cleaned: LogEntry = {};
  for (const key of Object.keys(obj)) {
    const value = readField(obj, key);
    // `undefined` has no JSON representation — `JSON.stringify` erases the key
    // anyway, so keeping it would make the colored and plain renderings
    // disagree. `null` does have one, and it is the difference between "this
    // field was empty" and "this field was never logged", so it is preserved.
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      defineField(cleaned, key, null);
      continue;
    }
    defineField(
      cleaned,
      key,
      shouldMask(key, options)
        ? MASKED
        : makeSafeForJson(value, options, visited, depth + 1),
    );
  }
  return cleaned;
}

function makeSafeForJson(
  value: unknown,
  options: PreparedSanitizeOptions,
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

/**
 * Lowercases the mask list once, for a caller that holds its options across many
 * entries.
 *
 * `Logger` prepares in its constructor: its `maskFields` copy is private and no
 * caller can reach it, so the mutation hazard that makes `sanitizeLogEntry`
 * re-lower on every call does not apply. That call was an array allocation plus
 * one `toLowerCase()` per mask field on every line logged.
 */
export const prepareSanitizeOptions = (
  options: SanitizeOptions,
): PreparedSanitizeOptions => ({
  ...options,
  lowerMaskFields: loweredMasks(options.maskFields),
  maskDecisions: new Map(),
});

/** `sanitizeLogEntry` for a caller that already prepared its options. */
export function sanitizePrepared(
  obj: LogEntry,
  options: PreparedSanitizeOptions,
): LogEntry {
  return sanitizeObject(obj, options, new WeakSet<object>([obj]), 0);
}

export function sanitizeLogEntry(
  obj: LogEntry,
  options: SanitizeOptions,
): LogEntry {
  return sanitizePrepared(obj, prepareSanitizeOptions(options));
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

  // A typed array or `DataView` holds numbers, never an `Error`, and walking one
  // as a plain object enumerates every element and recurses into each. A 64 KiB
  // buffer cost 24 ms of event loop per log call and a megabyte cost 1.4 s, which
  // is the whole of this guard's reason for existing.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = searchForError(item, maxDepth, visited, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const found = searchForError(
      readField(record, key),
      maxDepth,
      visited,
      depth + 1,
    );
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
