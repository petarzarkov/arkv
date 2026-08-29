/**
 * Frozen object rather than a TS `enum`: the values are what land in a log
 * entry's `level` field and are the only thing consumers may rely on. The
 * companion type below makes `LogLevel` usable in both value and type position,
 * so `LogLevel.ERROR` and `level: LogLevel` both keep working.
 *
 * `INFO` is `'info'`, not NestJS's `'log'`. The method that emits it is
 * `Logger#info`; `Logger#log` survives only as a deprecated alias because
 * NestJS's `LoggerService` interface mandates the method name.
 */
export const LogLevel = Object.freeze({
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const);

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LOG_LEVELS: LogLevel[] = [
  LogLevel.VERBOSE,
  LogLevel.DEBUG,
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.FATAL,
];

export interface AsyncContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  method?: string;
  event?: string;
  context?: string;
  flow?: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  name?: string;
  version?: string;
  env?: string;
  level?: LogLevel;
  /** Defaults to `process.env.NODE_ENV !== 'production'` */
  isDevelopment?: boolean;
  /** Merged with DEFAULT_MASK_FIELDS */
  maskFields?: string[];
  /** Events to skip logging for */
  filterEvents?: string[];
  /** Truncate arrays beyond this length */
  maxArrayLength?: number;
  /**
   * Stop descending past this nesting depth. A cycle is caught by reference, but
   * a long acyclic chain would still exhaust the stack inside a log call.
   */
  maxDepth?: number;
  /**
   * Where entries go. Defaults to a single `ConsoleTransport`.
   *
   * Supplying this **replaces** the default, so
   * `transports: [new FileTransport({ path })]` is how stdout/stderr output is
   * turned off. Include a `ConsoleTransport` explicitly to keep both.
   */
  transports?: Transport[];
  /** Static fields merged into every entry. See `Logger#child`. */
  bindings?: Record<string, unknown>;
  /**
   * Called when a transport's `write`/`flush`/`close` throws. A throwing
   * transport never propagates into the caller's code path; without this hook
   * the first failure per logger is reported on `console.error` and the rest
   * are suppressed.
   */
  onTransportError?: (error: Error, transport: Transport) => void;
}

export type LogEntry = Record<string, unknown> & {
  error?: Error;
};

export type LogFormatter = (entry: LogEntry, level: LogLevel) => string;

/** What a transport is holding and what it has lost, for a health endpoint. */
export interface TransportStats {
  /** The transport's class name, so a report can say which one is unhappy. */
  readonly name: string;
  /** Entries discarded. Anything above zero is worth an alert. */
  readonly dropped: number;
  /** Entries or bytes waiting to be sent. */
  readonly queued: number;
  /** Write, send or open failures since construction. */
  readonly errors: number;
}

/**
 * A sink for sanitized log entries.
 *
 * `write`, `flush` and `close` are synchronous on purpose. `process.on('exit')`
 * cannot await, so a transport whose only flush is async cannot guarantee its
 * buffer reaches the disk when the process ends — which is the one guarantee a
 * file transport exists to provide. See `FileTransport`.
 *
 * A network sink cannot honour that, and pretending otherwise is worse than
 * saying so. `flushAsync` and `closeAsync` are the half a graceful shutdown
 * awaits, where there is still an event loop to await on; the synchronous pair
 * stays what `process.on('exit')` calls, best-effort. A transport implements
 * whichever it can honour, and `Logger` prefers the async one when it is there.
 */
export interface Transport {
  /**
   * Minimum level this transport writes. Falls back to the logger's own level,
   * so `new Logger({ level: DEBUG, transports: [console, file] })` can send
   * debug to the console and only warnings to disk.
   */
  readonly level?: LogLevel;
  write(entry: LogEntry, level: LogLevel): void;
  flush?(): void;
  close?(): void;
  /** Drain what is held, awaiting the sink. Preferred by `Logger#flushAsync`. */
  flushAsync?(): Promise<void>;
  /** Drain, then release. Preferred by `Logger#closeAsync`. */
  closeAsync?(): Promise<void>;
  /** What this transport is holding and what it has lost. */
  stats?(): TransportStats;
}

/**
 * Keys the logger writes itself. A caller-supplied field of the same name is
 * moved aside rather than allowed to replace one — see `RESERVED_CONFLICTS_KEY`.
 */
export const RESERVED_ENTRY_KEYS = Object.freeze([
  'level',
  'timestamp',
  'pid',
  'message',
  'appId',
  'error',
] as const);

export const RESERVED_CONFLICTS_KEY = 'reservedFieldConflicts';

export const DEFAULT_MASK_FIELDS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apiKey',
  'apiSecret',
  'apiPass',
];
