import { jsonFormat, prettyFormat } from './format.js';
import {
  type LogEntry,
  type LogFormatter,
  LogLevel,
  type Transport,
} from './types.js';

export interface ConsoleTransportOptions {
  level?: LogLevel;
  /** Defaults to colored JSON when `pretty`, plain JSON otherwise. */
  format?: LogFormatter;
  /** Colored output. Defaults to `process.env.NODE_ENV !== 'production'`. */
  pretty?: boolean;
}

function isErrorLevel(level: LogLevel): boolean {
  return (
    level === LogLevel.WARN ||
    level === LogLevel.ERROR ||
    level === LogLevel.FATAL
  );
}

/**
 * Writes to stdout, and to stderr for warn/error/fatal so the two are separable
 * by a log shipper, `2>` redirection or CI annotations.
 */
export class ConsoleTransport implements Transport {
  readonly level?: LogLevel;
  readonly #format: LogFormatter;

  constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
    const pretty = options.pretty ?? process.env.NODE_ENV !== 'production';
    this.#format = options.format ?? (pretty ? prettyFormat : jsonFormat);
  }

  write(entry: LogEntry, level: LogLevel): void {
    const output = this.#format(entry, level);
    if (isErrorLevel(level)) {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}
