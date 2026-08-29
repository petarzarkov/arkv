import { isPlainObject, safeStringify } from '@arkv/shared';
import { findNestedError } from './sanitize.js';
import { type LogEntry, LogLevel } from './types.js';

export interface PreparedMessage {
  preparedMessage: string;
  invalidMessageInfo?: LogEntry;
  messageError?: Error;
  messageExtra?: LogEntry;
}

/**
 * The message and the optional params, read into the shape an entry is built
 * from. Pure, and lifted out of `Logger` because it is the largest thing in that
 * class that does not touch its state, and `logger.ts` was over the file cap.
 */
export function prepareMessage(
  message: unknown,
  maxDepth: number,
): PreparedMessage {
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
    const foundError = findNestedError(message, maxDepth);
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

const isErrorLevel = (level: LogLevel): boolean =>
  level === LogLevel.WARN ||
  level === LogLevel.ERROR ||
  level === LogLevel.FATAL;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles multiple error extraction patterns
export function extractErrorAndExtra(
  params: unknown[],
  level: LogLevel,
  maxDepth: number,
): { error: Error | null; extra: LogEntry } {
  let error: Error | null = null;
  const extra: LogEntry = {};
  const unmergeable: unknown[] = [];

  for (const param of params) {
    if (param instanceof Error) {
      error = param;
    } else if (typeof param === 'string') {
      if (isErrorLevel(level)) {
        error = new Error(param);
      } else {
        extra.context = param;
      }
    } else if (isPlainObject(param)) {
      if (param.err instanceof Error) {
        error = param.err;
        const { err: _, ...rest } = param;
        Object.assign(extra, rest);
      } else if (param.error instanceof Error) {
        error = param.error;
        const { error: _, ...rest } = param;
        Object.assign(extra, rest);
      } else if (isErrorLevel(level) && typeof param.err === 'string') {
        error = new Error(param.err);
        const { err: _, ...rest } = param;
        Object.assign(extra, rest);
      } else if (isErrorLevel(level) && typeof param.error === 'string') {
        error = new Error(param.error as string);
        const { error: _, ...rest } = param;
        Object.assign(extra, rest);
      } else {
        const foundError = findNestedError(param, maxDepth);
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
      const foundError = findNestedError(param, maxDepth);
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
