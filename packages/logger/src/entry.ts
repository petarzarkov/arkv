import { serializeError } from './serialize-error.js';
import {
  type LogEntry,
  type LogLevel,
  RESERVED_CONFLICTS_KEY,
  RESERVED_ENTRY_KEYS,
} from './types.js';

export const PID = process.pid;

/**
 * Built once. This was a `new Set(RESERVED_ENTRY_KEYS)` plus two `delete` calls
 * per entry, which is an allocation on the hot path to express two conditions the
 * loop below can ask directly.
 */
const RESERVED = new Set<string>(RESERVED_ENTRY_KEYS);

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
      merged[key] = serialize(merged[key]);
    } catch (error) {
      // A logging call must not fail because a field was not the shape a
      // serializer expected, and a silent drop would hide that it happened.
      merged[key] = `[serializer threw: ${
        error instanceof Error ? error.message : String(error)
      }]`;
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

  const conflicts: LogEntry = {};
  for (const key of RESERVED) {
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
      conflicts[key] = merged[key];
    }
    delete merged[key];
  }

  const logEntry: LogEntry = {
    level,
    timestamp:
      parts.timestamp === 'epoch' ? Date.now() : new Date().toISOString(),
    pid: PID,
    message,
    ...(appId ? { appId } : {}),
    ...merged,
  };

  if (error) {
    logEntry.error = serializeError(error);
  }

  if (Object.keys(conflicts).length > 0) {
    logEntry[RESERVED_CONFLICTS_KEY] = conflicts;
  }

  return logEntry;
}
