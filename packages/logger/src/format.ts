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
  magenta,
  red,
  yellow,
} from '@arkv/colors';
import { safeStringify } from '@arkv/shared';
import type { LogEntry, LogLevel } from './types.js';

export function formatColoredJson(
  obj: LogEntry,
  level: LogLevel,
): string {
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
      const keyWithoutQuotes = key
        .replace(/"/g, '')
        .slice(0, -1);
      const colorizer =
        colorMap[
          keyWithoutQuotes as keyof typeof colorMap
        ] || getValueColor(value);
      return `${cyan(key)}${colorizer(value)}`;
    },
  );
}
