import { extractErrorAndExtra, prepareMessage } from './arguments.js';
import {
  asReader,
  readContextOnce,
  type ContextReader,
  type ContextSource,
} from './context-contract.js';
import { createLogEntry, type EntryParts } from './entry.js';
import { jsonFormat, prettyFormat } from './format.js';
import {
  DEFAULT_MAX_DEPTH,
  type PreparedSanitizeOptions,
  prepareSanitizeOptions,
  sanitizePrepared,
} from './sanitize.js';
import { ConsoleTransport } from './transport.js';
import {
  DEFAULT_MASK_FIELDS,
  LOG_LEVELS,
  type LoggerConfig,
  LogLevel,
  type Transport,
  type TransportStats,
} from './types.js';

/**
 * Built once. `LOG_LEVELS.indexOf(level)` was a linear scan run once per entry
 * plus once per transport per entry, to answer a question with six possible
 * inputs.
 */
const LEVEL_INDEX = Object.freeze(
  Object.fromEntries(LOG_LEVELS.map((level, at) => [level, at])),
) as Readonly<Record<LogLevel, number>>;

function levelIndex(level: LogLevel): number {
  return LEVEL_INDEX[level];
}

/**
 * The level, and the comparisons derived from it, shared by reference between a
 * logger and the children it made.
 *
 * Shared rather than copied because the point of `setLevel` is to turn debug on
 * in a running process, and a fix that reached the root logger but not the twenty
 * children holding its transports would not be one. It is the same sharing
 * `child()` already does with the transports themselves.
 */
interface LevelGate {
  level: LogLevel;
  /** The cheapest gate: the lowest threshold any transport will accept. */
  min: number;
  /** One threshold per transport, positionally. */
  thresholds: number[];
}

function retune(gate: LevelGate, transports: readonly Transport[]): void {
  gate.thresholds = transports.map((transport) =>
    levelIndex(transport.level ?? gate.level),
  );
  gate.min =
    gate.thresholds.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...gate.thresholds);
}

export class Logger {
  readonly #config: LoggerConfig;
  readonly #maskFields: string[];
  readonly #maxArrayLength: number;
  readonly #maxDepth: number;
  readonly #filterEvents: string[];
  readonly #context?: ContextReader;
  readonly #appName?: string;
  readonly #appVersion?: string;
  readonly #appEnv?: string;
  readonly #bindings?: Record<string, unknown>;
  readonly #serializers?: Record<string, (value: unknown) => unknown>;
  readonly #timestamp?: 'iso' | 'epoch';
  readonly #transports: Transport[];
  readonly #sanitizeOptions: PreparedSanitizeOptions;
  #gate: LevelGate;
  readonly #onTransportError?: (error: Error, transport: Transport) => void;
  #reportedTransportFailure = false;

  constructor(config?: LoggerConfig, context?: ContextSource) {
    const cfg = config ?? {};
    this.#config = cfg;
    const isDevelopment =
      cfg.isDevelopment ?? process.env.NODE_ENV !== 'production';
    this.#maskFields =
      cfg.maskFields && cfg.maskFields.length > 0
        ? Array.from(new Set([...DEFAULT_MASK_FIELDS, ...cfg.maskFields]))
        : [...DEFAULT_MASK_FIELDS];
    this.#maxArrayLength = cfg.maxArrayLength ?? 100;
    this.#maxDepth = cfg.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.#filterEvents = cfg.filterEvents ?? [];
    this.#context = context === undefined ? undefined : asReader(context);
    this.#appName = cfg.name;
    this.#appVersion = cfg.version;
    this.#appEnv = cfg.env;
    this.#bindings = cfg.bindings;
    this.#serializers = cfg.serializers;
    this.#timestamp = cfg.timestamp;
    this.#onTransportError = cfg.onTransportError;
    this.#transports = cfg.transports ?? [
      new ConsoleTransport({
        batch: cfg.batchConsole ?? false,
        format: isDevelopment ? prettyFormat : jsonFormat,
      }),
    ];
    // A transport with its own level is independent of the logger's; one
    // without inherits it. Both comparisons are precomputed here rather than
    // recomputed per entry.
    this.#gate = {
      level: cfg.level ?? LogLevel.DEBUG,
      min: Number.POSITIVE_INFINITY,
      thresholds: [],
    };
    retune(this.#gate, this.#transports);
    this.#sanitizeOptions = prepareSanitizeOptions({
      maskFields: this.#maskFields,
      maxArrayLength: this.#maxArrayLength,
      maxDepth: this.#maxDepth,
    });
  }

  get logLevel(): LogLevel {
    return this.#gate.level;
  }

  /**
   * Change the level of this logger and every child it made, without rebuilding
   * anything. What a SIGUSR2 handler or an admin endpoint calls to turn debug on
   * against a running process.
   *
   * A transport that named its own `level` keeps it: that is what makes
   * `transports: [console, file]` able to send debug to one and warnings to the
   * other, and a global switch that overrode it would defeat the arrangement.
   */
  setLevel(level: LogLevel): void {
    this.#gate.level = level;
    retune(this.#gate, this.#transports);
  }

  get appId(): string | undefined {
    if (this.#appName && this.#appVersion && this.#appEnv) {
      return `${this.#appName}-${this.#appVersion}-${this.#appEnv}`;
    }
    return undefined;
  }

  get transports(): readonly Transport[] {
    return this.#transports;
  }

  /**
   * A logger sharing this one's transports and context store, with `bindings`
   * merged into every entry it writes. Per-call fields and async context both
   * take precedence over bindings.
   *
   * The transports are shared, so `close()` on a child closes them for the
   * parent too — close the root logger, not a child.
   */
  child(bindings: Record<string, unknown>): Logger {
    const child = new Logger(
      {
        ...this.#config,
        bindings: { ...this.#bindings, ...bindings },
        transports: this.#transports,
      },
      this.#context,
    );
    // The gate is adopted rather than rebuilt, so `setLevel` on either one moves
    // both. Private field access across instances of the same class is legal.
    child.#gate = this.#gate;
    return child;
  }

  /**
   * Push every transport's buffer to its destination. Synchronous, so it is
   * callable from `process.on('exit')`, and best-effort for a transport whose
   * sink is a network. Await {@link Logger.flushAsync} where you can.
   */
  flush(): void {
    for (const transport of this.#transports) {
      try {
        transport.flush?.();
      } catch (error) {
        this.#reportTransportError(error, transport);
      }
    }
  }

  /** Flush, then release every transport's resources. Synchronous. */
  close(): void {
    for (const transport of this.#transports) {
      try {
        transport.flush?.();
        transport.close?.();
      } catch (error) {
        this.#reportTransportError(error, transport);
      }
    }
  }

  /**
   * Drain every transport, awaiting the ones that can only answer
   * asynchronously. This is what a graceful shutdown awaits, and the only way a
   * batch bound for a collector is known to have left the process.
   *
   * Transports drain concurrently: they are independent sinks, and draining them
   * in series would make a shutdown as slow as their sum. A transport that fails
   * is reported through `onTransportError` and does not prevent the others from
   * finishing.
   */
  async flushAsync(): Promise<void> {
    await this.#settle((transport) =>
      transport.flushAsync ? transport.flushAsync() : transport.flush?.(),
    );
  }

  /** Drain, then release. The async half of {@link Logger.close}. */
  async closeAsync(): Promise<void> {
    await this.#settle(async (transport) => {
      if (transport.closeAsync) {
        await transport.closeAsync();
        return;
      }
      if (transport.flushAsync) {
        await transport.flushAsync();
      } else {
        transport.flush?.();
      }
      transport.close?.();
    });
  }

  async #settle(run: (transport: Transport) => unknown): Promise<void> {
    const results = await Promise.allSettled(
      this.#transports.map(async (transport) => {
        try {
          await run(transport);
        } catch (error) {
          this.#reportTransportError(error, transport);
        }
      }),
    );
    // `run` already reports what it caught; this catches a transport that
    // rejected outside it, so neither becomes an unhandled rejection.
    for (const [at, result] of results.entries()) {
      if (result.status === 'rejected') {
        this.#reportTransportError(
          result.reason,
          this.#transports[at] as Transport,
        );
      }
    }
  }

  /**
   * What each transport is holding and what it has lost, for a health endpoint
   * or a metric. A transport reporting a non-zero `dropped` is losing logs.
   *
   * Transports that keep no counters are omitted rather than reported as zero,
   * which would read as "measured and fine".
   */
  stats(): TransportStats[] {
    const reported: TransportStats[] = [];
    for (const transport of this.#transports) {
      const stats = transport.stats?.();
      if (stats) {
        reported.push(stats);
      }
    }
    return reported;
  }

  info(message: string, ...optionalParams: unknown[]): void;
  info(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  info(message: Error, ...optionalParams: unknown[]): void;
  info(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.INFO, message, optionalParams);
  }

  /**
   * @deprecated Use {@link Logger.info}. Kept because NestJS's `LoggerService`
   * mandates a `log` method and because removing it would break every existing
   * call site. It is only a name: the emitted `level` is `'info'` either way.
   */
  log(message: string, ...optionalParams: unknown[]): void;
  /** @deprecated Use {@link Logger.info}. */
  log(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  /** @deprecated Use {@link Logger.info}. */
  log(message: Error, ...optionalParams: unknown[]): void;
  log(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.info(message as string, ...optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]): void;
  error(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  error(message: Error, ...optionalParams: unknown[]): void;
  error(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.ERROR, message, optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]): void;
  warn(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  warn(message: Error, ...optionalParams: unknown[]): void;
  warn(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.WARN, message, optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]): void;
  debug(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  debug(message: Error, ...optionalParams: unknown[]): void;
  debug(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.DEBUG, message, optionalParams);
  }

  verbose(message: string, ...optionalParams: unknown[]): void;
  verbose(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  verbose(message: Error, ...optionalParams: unknown[]): void;
  verbose(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.VERBOSE, message, optionalParams);
  }

  fatal(message: string, ...optionalParams: unknown[]): void;
  fatal(message: Record<string, unknown>, ...optionalParams: unknown[]): void;
  fatal(message: Error, ...optionalParams: unknown[]): void;
  fatal(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.FATAL, message, optionalParams);
  }

  #writeLog(
    level: LogLevel,
    message: string | Record<string, unknown> | Error,
    optionalParams: unknown[],
  ): void {
    const idx = LEVEL_INDEX[level];
    if (idx < this.#gate.min) {
      return;
    }

    // One read per entry, and no copy at all where the reader offers `peekContext`.
    // This was two `getContext()` calls for every line - one here to check
    // `filterEvents`, one below to build the entry - each allocating a shallow copy
    // that was spread into the entry and thrown away.
    const context = readContextOnce(this.#context);
    if (context.event && this.#filterEvents.includes(context.event as string)) {
      return;
    }

    const { preparedMessage, invalidMessageInfo, messageError, messageExtra } =
      prepareMessage(message, this.#maxDepth);
    const { error, extra } = extractErrorAndExtra(
      optionalParams,
      level,
      this.#maxDepth,
    );

    const finalError = messageError || error;
    // One spread only where there is something to merge. `messageExtra` is set
    // only when the message itself was an object, so for a string message this
    // was a two-source spread over `undefined` and a second object per entry.
    const finalExtra =
      messageExtra === undefined ? extra : { ...messageExtra, ...extra };

    // Assigned rather than spread from a conditional literal. Each
    // `...(x ? { x } : {})` allocated an empty object on every call that had
    // neither, which is every call for a logger configured with neither.
    const parts: EntryParts = {
      level,
      message: preparedMessage,
      bindings: this.#bindings,
      context,
      extra: finalExtra,
      invalidMessageInfo,
      error: finalError,
      appId: this.appId,
    };
    if (this.#serializers) parts.serializers = this.#serializers;
    if (this.#timestamp) parts.timestamp = this.#timestamp;

    const logEntry = createLogEntry(parts);

    const sanitizedLogEntry = sanitizePrepared(logEntry, this.#sanitizeOptions);

    const { thresholds } = this.#gate;
    for (let at = 0; at < this.#transports.length; at += 1) {
      const transport = this.#transports[at] as Transport;
      if (idx < (thresholds[at] as number)) {
        continue;
      }
      try {
        transport.write(sanitizedLogEntry, level);
      } catch (error_) {
        this.#reportTransportError(error_, transport);
      }
    }
  }

  /**
   * A transport that throws is isolated here: a full disk must not surface as an
   * exception in the request path that happened to log a line.
   */
  #reportTransportError(error: unknown, transport: Transport): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.#onTransportError) {
      try {
        this.#onTransportError(err, transport);
      } catch {
        // A failing error handler is the end of the line; there is nowhere
        // left to report to.
      }
      return;
    }
    if (this.#reportedTransportFailure) {
      return;
    }
    this.#reportedTransportFailure = true;
    console.error(
      `[@arkv/logger] transport ${transport.constructor.name} failed and was ignored: ${err.message}. Further failures from this logger are suppressed.`,
    );
  }
}
