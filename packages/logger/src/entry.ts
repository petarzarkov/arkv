import {
  type LogEntry,
  type LogLevel,
  RESERVED_CONFLICTS_KEY,
  RESERVED_ENTRY_KEYS,
} from './types.js';

export const PID = process.pid;

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

  const reserved = new Set<string>(RESERVED_ENTRY_KEYS);
  if (!appId) {
    reserved.delete('appId');
  }
  if (!error) {
    reserved.delete('error');
  }

  const conflicts: LogEntry = {};
  for (const key of reserved) {
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
    logEntry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack?.replace(/\n(\s+)?/g, ','),
    };
  }

  if (Object.keys(conflicts).length > 0) {
    logEntry[RESERVED_CONFLICTS_KEY] = conflicts;
  }

  return logEntry;
}
