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

  const merged: LogEntry = {
    ...parts.bindings,
    ...parts.context,
    ...parts.extra,
    ...parts.invalidMessageInfo,
  };

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
    timestamp: new Date().toISOString(),
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
