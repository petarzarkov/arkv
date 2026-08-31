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
  /**
   * Batch the **default** console transport: one write per timer tick rather than
   * a `console.log` per entry. Default `false`. See
   * `ConsoleTransportOptions.batch` for what it trades.
   *
   * Ignored when `transports` is supplied, since that replaces the default and
   * the transport's own option is then the place to say it.
   */
  batchConsole?: boolean;
  /** Static fields merged into every entry. See `Logger#child`. */
  bindings?: Record<string, unknown>;
  /**
   * Rewrites one top-level field before the entry is sanitized, keyed by its name.
   *
   * `{ req: (value) => ({ method: value.method, url: value.url }) }` is how a
   * request object becomes three fields instead of a walk of the whole thing.
   * Cheaper and far more controllable than letting the generic sanitizer descend
   * into it, and the only way to say "log this shape, not everything on it".
   *
   * A serializer that throws is caught: a logging call must not fail because a
   * field was not the shape it expected.
   *
   * **The reserved names cannot be serialized**, because the entry writes them
   * itself after this runs: `level`, `timestamp`, `pid`, `message`, `appId` and
   * `error`. A serializer keyed on any of them has no effect. That last one
   * catches people arriving from pino, where `serializers: { err }` is the usual
   * first configuration; here an error is rendered by `serializeError`, which
   * already carries the cause chain and the error's own properties.
   */
  serializers?: Record<string, (value: unknown) => unknown>;
  /**
   * `iso` (the default) writes `2026-08-29T06:50:27.000Z`. `epoch` writes
   * milliseconds as a number, which some ingesters prefer and which costs no
   * `Date` allocation per entry.
   */
  timestamp?: 'iso' | 'epoch';
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
