import {
  brightBlue,
  brightCyan,
  brightGreen,
  brightMagenta,
  brightYellow,
  cyan,
  getLevelColorFn,
  getValueColor,
  gray,
  green,
  isColorSupported,
  magenta,
  red,
  yellow,
} from '@arkv/colors';
import { safeStringify } from '@arkv/shared';
import type { LogEntry, LogFormatter, LogLevel } from './types.js';

/** Plain JSON — one entry per line, what a log shipper wants. */
export const jsonFormat: LogFormatter = (entry) => safeStringify(entry);

/**
 * ANSI-colored JSON, for a terminal - and plain JSON when there is not one.
 *
 * Gated here rather than at the two places that choose between `prettyFormat` and
 * `jsonFormat`, because `transport.ts` does `options.format ?? (pretty ? ...)` and
 * `logger.ts` passes `format:` explicitly: gating those would mean editing both
 * and would still miss a caller passing `prettyFormat` directly.
 *
 * Without this, a non-TTY stdout got escape sequences written into the JSON, which
 * stopped it being parseable, and neither `NO_COLOR` nor `FORCE_COLOR=0`
 * suppressed them because nothing on the path asked.
 */
export const prettyFormat: LogFormatter = (entry, level) =>
  isColorSupported() ? formatColoredJson(entry, level) : safeStringify(entry);

export function formatColoredJson(obj: LogEntry, level: LogLevel): string {
  const jsonString = safeStringify(obj);

  const colorMap = {
    level: getLevelColorFn(level),
    message: green,
    timestamp: magenta,
    requestId: brightGreen,
    userId: brightBlue,
    context: brightCyan,
    duration: yellow,
    event: brightMagenta,
    error: red,
    exception: red,
    flow: brightGreen,
    method: brightBlue,
    stack: gray,
    status: brightYellow,
    elapsed: brightYellow,
  };

  return jsonString.replace(
    /(".*?":\s*)(.*?)(?=,|\n|$)/g,
    (_: string, key: string, value: string) => {
      const keyWithoutQuotes = key.replace(/"/g, '').slice(0, -1);
      const colorizer =
        colorMap[keyWithoutQuotes as keyof typeof colorMap] ||
        getValueColor(value);
      return `${cyan(key)}${colorizer(value)}`;
    },
  );
}
