import { strip } from '@arkv/colors';
import type { LogEntry, LogLevel, Transport } from './types.js';

/**
 * Parse one emitted line back into an entry. Handles both renderings — the
 * colored development output and the plain JSON of production — so a test does
 * not have to know which one the logger was configured for.
 */
export function parseLogEntry(output: string): LogEntry {
  return JSON.parse(strip(output)) as LogEntry;
}

export interface MemoryTransportOptions {
  level?: LogLevel;
}

/**
 * Collects sanitized entries in memory instead of writing them anywhere.
 *
 * Preferable to spying on `console.log` in a consumer's tests: the entry is
 * asserted as an object, so there is no formatting or ANSI to parse and no
 * global to restore.
 */
export class MemoryTransport implements Transport {
  readonly level?: LogLevel;
  readonly entries: LogEntry[] = [];

  constructor(options: MemoryTransportOptions = {}) {
    this.level = options.level;
  }

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }

  get last(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  clear(): void {
    this.entries.length = 0;
  }
}
