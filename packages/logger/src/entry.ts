import { defineField } from './assign.js';
import { serializeError } from './serialize-error.js';
import {
  type LogEntry,
  type LogLevel,
  RESERVED_CONFLICTS_KEY,
  RESERVED_ENTRY_KEYS,
} from './types.js';

export const PID = process.pid;

/**
 * `new Date().toISOString()` runs per entry for a string whose precision is the
 * millisecond, and at any rate worth logging the millisecond has not moved since
 * the last entry. One `Date.now()` and a compare replaces it, returning the same
 * string the uncached call would have built.
 *
 * Measured on Bun 1.4.0: the call is 128 ns against 27 ns for this, but in
 * `createLogEntry` the whole change is worth 15 ns of 327, because the entry's
 * allocations dominate what the clock costs.
 */
let stampAt = 0;
let stampValue = '';
const isoTimestamp = (): string => {
  const now = Date.now();
  if (now !== stampAt) {
    stampAt = now;
    stampValue = new Date(now).toISOString();
  }
  return stampValue;
};

export interface EntryParts {
  level: LogLevel;
  message: string;
  /** Static fields from the logger or a child's bindings. */
  bindings?: Record<string, unknown>;
  /** Fields from the async context store. */
  context: LogEntry;
  /** Fields the caller passed on this call. */
  extra: LogEntry;
  invalidMessageInfo?: LogEntry;
  error?: Error | null;
  appId?: string;
  serializers?: Record<string, (value: unknown) => unknown>;
  /** `iso` writes a string, `epoch` writes milliseconds as a number. */
  timestamp?: 'iso' | 'epoch';
}

/**
 * What was thrown, as a string, without throwing in turn.
 *
 * `String(value)` calls `toString`, which a thrown object may not have or may
 * define to throw, and a thrown symbol makes it throw outright. That exception
 * would escape the `catch` this is called from and fail the log call, which is
 * the one thing that `catch` exists to prevent.
 */
function describeThrown(error: unknown): string {
  try {
    const described = error instanceof Error ? error.message : error;
    // `Error.message` is a string by construction but not by guarantee: a
    // subclass can define it as anything, and interpolating a symbol throws.
    return typeof described === 'string' ? described : String(described);
  } catch {
    return 'a value that cannot be described';
  }
}

/**
 * Applied to the merged fields before anything is sanitized, so a serializer sees
 * what the caller passed and the sanitizer sees only what the serializer returned.
 */
function applySerializers(
  merged: LogEntry,
  serializers: Record<string, (value: unknown) => unknown>,
): void {
  for (const key of Object.keys(merged)) {
    const serialize = serializers[key];
    if (!serialize) {
      continue;
    }
    try {
      defineField(merged, key, serialize(merged[key]));
    } catch (error) {
      // A logging call must not fail because a field was not the shape a
      // serializer expected, and a silent drop would hide that it happened.
      defineField(merged, key, `[serializer threw: ${describeThrown(error)}]`);
    }
  }
}

/**
 * Assembles one entry, with the logger's own fields protected.
 *
 * Whatever the caller supplied used to be spread over them, so
 * `debug('x', { level: 'y' })` silently replaced the one field a log pipeline
 * routes on. The entry's fields now win, and the caller's are kept under
 * `reservedFieldConflicts` so nothing is lost and the clash is visible.
 */
export function createLogEntry(parts: EntryParts): LogEntry {
  const { level, message, error, appId } = parts;

  /**
   * Spread, and only over the sources that exist. A four-source spread counts a
   * source even when it is `undefined`, and three of these usually are: most
   * loggers have no bindings and most calls produce no `invalidMessageInfo`.
   *
   * **Not `Object.assign`.** It copies with `[[Set]]`, so a source carrying an own
   * `__proto__` key invokes the prototype setter instead of creating a property:
   * the field vanishes from the entry and the merged object's prototype changes
   * with it. `logger.info('req', JSON.parse(body))` is enough to reach that from
   * outside. Spreading uses `CreateDataProperty` and keeps it an ordinary field.
   */
  const merged: LogEntry = parts.bindings
    ? { ...parts.bindings, ...parts.context, ...parts.extra }
    : { ...parts.context, ...parts.extra };
  if (parts.invalidMessageInfo) {
    // Built here, with fixed keys, so there is nothing hostile to copy.
    Object.assign(merged, parts.invalidMessageInfo);
  }

  if (parts.serializers) {
    applySerializers(merged, parts.serializers);
  }

  // Allocated only when there is a clash, which there almost never is. An object
  // per entry plus the `Object.keys` that used to test it for emptiness were both
  // paid on every call to describe a case that does not arise.
  let conflicts: LogEntry | undefined;
  // The array rather than a Set built from it: this walks every reserved name and
  // asks `merged` about it, so nothing here needs `has`, and iterating a Set
  // allocates an iterator per call. Widened to `string` because the literal union
  // includes `error`, whose declared type on `LogEntry` is narrower than the index
  // signature every other key goes through.
  for (const key of RESERVED_ENTRY_KEYS as readonly string[]) {
    // Neither is a reserved name when the entry is not going to write it.
    if ((key === 'appId' && !appId) || (key === 'error' && !error)) {
      continue;
    }
    if (!(key in merged)) {
      continue;
    }
    // `error({ error: err })` is not a clash: the entry's `error` field was
    // derived from that very value, so reporting it twice is just noise.
    if (key !== 'error' || merged.error !== error) {
      (conflicts ??= {})[key] = merged[key];
    }
    delete merged[key];
  }

  const timestamp = parts.timestamp === 'epoch' ? Date.now() : isoTimestamp();

  // Two literals rather than one with `...(appId ? { appId } : {})` in it: that
  // spread allocated an empty object on every call without an appId, which is
  // every call for most loggers.
  const logEntry: LogEntry = appId
    ? { level, timestamp, pid: PID, message, appId, ...merged }
    : { level, timestamp, pid: PID, message, ...merged };

  if (error) {
    logEntry.error = serializeError(error);
  }

  if (conflicts !== undefined) {
    logEntry[RESERVED_CONFLICTS_KEY] = conflicts;
  }

  return logEntry;
}
