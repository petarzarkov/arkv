import { isPlainObject, safeStringify } from '@arkv/shared';
import type { ContextStore } from './context.js';
import { formatColoredJson } from './format.js';
import {
  findNestedError,
  sanitizeLogEntry,
} from './sanitize.js';
import {
  DEFAULT_MASK_FIELDS,
  LOG_LEVELS,
  type LogEntry,
  type LoggerConfig,
  LogLevel,
} from './types.js';

export class Logger {
  public readonly logLevel: LogLevel;
  readonly #isDevelopment: boolean;
  readonly #maskFields: string[];
  readonly #maxArrayLength: number;
  readonly #filterEvents: string[];
  readonly #context?: ContextStore;
  readonly #appName?: string;
  readonly #appVersion?: string;
  readonly #appEnv?: string;

  constructor(
    config?: LoggerConfig,
    context?: ContextStore,
  ) {
    const cfg = config ?? {};
    this.logLevel = cfg.level ?? LogLevel.DEBUG;
    this.#isDevelopment =
      cfg.isDevelopment ??
      process.env.NODE_ENV !== 'production';
    this.#maskFields =
      cfg.maskFields && cfg.maskFields.length > 0
        ? Array.from(
            new Set([
              ...DEFAULT_MASK_FIELDS,
              ...cfg.maskFields,
            ]),
          )
        : [...DEFAULT_MASK_FIELDS];
    this.#maxArrayLength = cfg.maxArrayLength ?? 100;
    this.#filterEvents = cfg.filterEvents ?? [];
    this.#context = context;
    this.#appName = cfg.name;
    this.#appVersion = cfg.version;
    this.#appEnv = cfg.env;
  }

  get appId(): string | undefined {
    if (this.#appName && this.#appVersion && this.#appEnv) {
      return `${this.#appName}-${this.#appVersion}-${this.#appEnv}`;
    }
    return undefined;
  }

  log(message: string, ...optionalParams: unknown[]): void;
  log(message: Record<string, unknown>): void;
  log(message: Error): void;
  log(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.LOG, message, optionalParams);
  }

  error(
    message: string,
    ...optionalParams: unknown[]
  ): void;
  error(message: Record<string, unknown>): void;
  error(message: Error): void;
  error(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.ERROR, message, optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]): void;
  warn(message: Record<string, unknown>): void;
  warn(message: Error): void;
  warn(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.WARN, message, optionalParams);
  }

  debug(
    message: string,
    ...optionalParams: unknown[]
  ): void;
  debug(message: Record<string, unknown>): void;
  debug(message: Error): void;
  debug(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(LogLevel.DEBUG, message, optionalParams);
  }

  verbose(
    message: string,
    ...optionalParams: unknown[]
  ): void;
  verbose(message: Record<string, unknown>): void;
  verbose(message: Error): void;
  verbose(
    message: string | Record<string, unknown> | Error,
    ...optionalParams: unknown[]
  ): void {
    this.#writeLog(
      LogLevel.VERBOSE,
      message,
      optionalParams,
    );
  }

  fatal(
    message: string,
    ...optionalParams: unknown[]
  ): void;
  fatal(message: Record<string, unknown>): void;
  fatal(message: Error): void;
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
    if (!this.#shouldLog(level)) {
      return;
    }

    const {
      preparedMessage,
      invalidMessageInfo,
      messageError,
      messageExtra,
    } = this.#prepareMessage(message);
    const { error, extra } = this.#extractErrorAndExtra(
      optionalParams,
      level,
    );

    const finalError = messageError || error;
    const finalExtra = {
      ...messageExtra,
      ...extra,
    };

    const logEntry = this.#createLogEntry(
      level,
      preparedMessage,
      finalExtra,
      finalError,
      invalidMessageInfo,
    );

    const sanitizedLogEntry = sanitizeLogEntry(logEntry, {
      maskFields: this.#maskFields,
      maxArrayLength: this.#maxArrayLength,
    });

    const output = this.#isDevelopment
      ? formatColoredJson(sanitizedLogEntry, level)
      : safeStringify(sanitizedLogEntry);

    console.log(output);
  }

  #prepareMessage(
    message:
      | string
      | Record<string, unknown>
      | Error
      | unknown,
  ): {
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
      const foundError = findNestedError(message);
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

    const stack = new Error().stack
      ?.split('\n')
      .slice(2, 7)
      .join('\n');
    const preparedMessage =
      message === null || message === undefined
        ? `[${String(message)}]`
        : `[OBJECT]: ${safeStringify(message as LogEntry)}`;

    const invalidMessageInfo = {
      invalidMessageWarning:
        'Logger called with non-string message parameter',
      invalidMessageCallstack: stack,
      originalMessageType: typeof message,
      originalMessage: safeStringify(message as LogEntry),
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
        } else if (
          isErrorLevel &&
          typeof param.err === 'string'
        ) {
          error = new Error(param.err);
          const { err: _, ...rest } = param;
          Object.assign(extra, rest);
        } else if (
          isErrorLevel &&
          typeof param.error === 'string'
        ) {
          error = new Error(param.error as string);
          const { error: _, ...rest } = param;
          Object.assign(extra, rest);
        } else {
          const foundError = findNestedError(param);
          if (foundError) {
            error = foundError;
          }
          Object.assign(extra, param);
        }
      }
    }
    return { error, extra };
  }

  #createLogEntry(
    level: LogLevel,
    message: string,
    extra: LogEntry,
    error?: Error | null,
    invalidMessageInfo?: LogEntry,
  ): LogEntry {
    const ctx = this.#context
      ? this.#context.getContext()
      : {};

    const logEntry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      message,
      ...(this.appId ? { appId: this.appId } : {}),
      ...ctx,
      ...extra,
      ...(invalidMessageInfo || {}),
    };

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack?.replace(/\n(\s+)?/g, ','),
      };
    }

    return logEntry;
  }

  #shouldLog(level: LogLevel): boolean {
    const configuredIdx = LOG_LEVELS.indexOf(this.logLevel);
    const messageIdx = LOG_LEVELS.indexOf(level);
    if (messageIdx < configuredIdx) {
      return false;
    }

    if (this.#context) {
      const ctx = this.#context.getContext();
      if (
        ctx.event &&
        this.#filterEvents.includes(ctx.event as string)
      ) {
        return false;
      }
    }

    return true;
  }
}
