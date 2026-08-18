import { isPlainObject, safeStringify } from '@arkv/shared';
import {
  asReader,
  readContextOnce,
  type ContextReader,
  type ContextSource,
} from './context-contract.js';
import { createLogEntry } from './entry.js';
import { jsonFormat, prettyFormat } from './format.js';
import {
  DEFAULT_MAX_DEPTH,
  findNestedError,
  sanitizeLogEntry,
} from './sanitize.js';
import { ConsoleTransport } from './transport.js';
import {
  DEFAULT_MASK_FIELDS,
  LOG_LEVELS,
  type LogEntry,
  type LoggerConfig,
  LogLevel,
  type Transport,
} from './types.js';

function levelIndex(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

export class Logger {
  public readonly logLevel: LogLevel;
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
  readonly #transports: Transport[];
  readonly #minLevelIdx: number;
  readonly #onTransportError?: (error: Error, transport: Transport) => void;
  #reportedTransportFailure = false;

  constructor(config?: LoggerConfig, context?: ContextSource) {
    const cfg = config ?? {};
    this.#config = cfg;
    this.logLevel = cfg.level ?? LogLevel.DEBUG;
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
    this.#onTransportError = cfg.onTransportError;
    this.#transports = cfg.transports ?? [
      new ConsoleTransport({
        format: isDevelopment ? prettyFormat : jsonFormat,
      }),
    ];
    // A transport with its own level is independent of the logger's; one
    // without inherits it. The cheapest gate is the lowest of them all.
    this.#minLevelIdx =
      this.#transports.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(
            ...this.#transports.map((t) =>
              levelIndex(t.level ?? this.logLevel),
            ),
          );
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
    return new Logger(
      {
        ...this.#config,
        bindings: { ...this.#bindings, ...bindings },
        transports: this.#transports,
      },
      this.#context,
    );
  }

  /** Push every transport's buffer to its destination. Synchronous. */
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
    if (levelIndex(level) < this.#minLevelIdx) {
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
      this.#prepareMessage(message);
    const { error, extra } = this.#extractErrorAndExtra(optionalParams, level);

    const finalError = messageError || error;
    const finalExtra = {
      ...messageExtra,
      ...extra,
    };

    const logEntry = createLogEntry({
      level,
      message: preparedMessage,
      bindings: this.#bindings,
      context,
      extra: finalExtra,
      invalidMessageInfo,
      error: finalError,
      appId: this.appId,
    });

    const sanitizedLogEntry = sanitizeLogEntry(logEntry, {
      maskFields: this.#maskFields,
      maxArrayLength: this.#maxArrayLength,
      maxDepth: this.#maxDepth,
    });

    const idx = levelIndex(level);
    for (const transport of this.#transports) {
      if (idx < levelIndex(transport.level ?? this.logLevel)) {
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

  #prepareMessage(message: unknown): {
    preparedMessage: string;
    invalidMessageInfo?: LogEntry;
    messageError?: Error;
    messageExtra?: LogEntry;
  } {
    if (typeof message === 'string') {
      return { preparedMessage: message };
    }

    if (message instanceof Error) {
      return {
        preparedMessage: message.message,
        messageError: message,
      };
    }

    if (isPlainObject(message)) {
      const foundError = findNestedError(message, this.#maxDepth);
      if (foundError) {
        return {
          preparedMessage: foundError.message,
          messageError: foundError,
          messageExtra: message,
        };
      }
      return {
        preparedMessage: 'Object logged',
        messageExtra: message,
      };
    }

    const stack = new Error().stack?.split('\n').slice(2, 7).join('\n');
    const preparedMessage =
      message === null || message === undefined
        ? `[${String(message)}]`
        : `[OBJECT]: ${safeStringify(message as LogEntry)}`;

    const invalidMessageInfo = {
      invalidMessageWarning: 'Logger called with non-string message parameter',
      invalidMessageCallstack: stack,
      originalMessageType: typeof message,
      // Objects reach here — a Map, a Set, a Date, a class instance — so the
      // value is handed over raw for the sanitizer to render. Pre-stringifying
      // it would report `new Map([['a', 1]])` as `{}`.
      originalMessage:
        typeof message === 'object' && message !== null
          ? message
          : safeStringify(message as LogEntry),
    };

    return {
      preparedMessage,
      invalidMessageInfo,
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles multiple error extraction patterns
  #extractErrorAndExtra(
    params: unknown[],
    level: LogLevel,
  ): {
    error: Error | null;
    extra: LogEntry;
  } {
    let error: Error | null = null;
    const extra: LogEntry = {};
    const unmergeable: unknown[] = [];

    for (const param of params) {
      if (param instanceof Error) {
        error = param;
      } else if (typeof param === 'string') {
        const isErrorLevel =
          level === LogLevel.WARN ||
          level === LogLevel.ERROR ||
          level === LogLevel.FATAL;
        if (isErrorLevel) {
          error = new Error(param);
        } else {
          extra.context = param;
        }
      } else if (isPlainObject(param)) {
        const isErrorLevel =
          level === LogLevel.WARN ||
          level === LogLevel.ERROR ||
          level === LogLevel.FATAL;

        if (param.err instanceof Error) {
          error = param.err;
          const { err: _, ...rest } = param;
          Object.assign(extra, rest);
        } else if (param.error instanceof Error) {
          error = param.error;
          const { error: _, ...rest } = param;
          Object.assign(extra, rest);
        } else if (isErrorLevel && typeof param.err === 'string') {
          error = new Error(param.err);
          const { err: _, ...rest } = param;
          Object.assign(extra, rest);
        } else if (isErrorLevel && typeof param.error === 'string') {
          error = new Error(param.error as string);
          const { error: _, ...rest } = param;
          Object.assign(extra, rest);
        } else {
          const foundError = findNestedError(param, this.#maxDepth);
          if (foundError) {
            error = foundError;
          }
          Object.assign(extra, param);
        }
      } else if (typeof param === 'object' && param !== null) {
        // An array, Map, Set, Date, typed array or class instance cannot be
        // merged into a flat record — `Object.assign` copies none of a Map's
        // entries, and a class instance's fields would collide with reserved
        // entry keys. Collected under `params` instead, where the sanitizer
        // knows how to render every one of those shapes.
        const foundError = findNestedError(param, this.#maxDepth);
        if (foundError) {
          error = foundError;
        }
        unmergeable.push(param);
      }
    }

    if (unmergeable.length > 0) {
      extra.params = unmergeable;
    }

    return { error, extra };
  }
}
