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
import type { ColorFn } from '@arkv/colors';
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

/** Which key gets which color, at any depth - `stack` inside `error` included. */
const keyColors: Record<string, ColorFn> = {
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

/**
 * Structural characters. Colored explicitly rather than left bare, and the reason is
 * measured rather than stylistic: `warn` and above go through `console.error`, and
 * **Bun wraps that in red itself** - `\x1b[0m\x1b[31m` before the line and
 * `\x1b[0m` after. Every token this colors overrides that wrapper; every character
 * it leaves bare keeps it. So an uncolored `{` came out red at the head of a
 * warning, looking like part of the message.
 */
const PUNCTUATION = new Set(['{', '}', '[', ']', ',', ':']);

/** Where a bare literal - a number, `true`, `false`, `null` - stops. */
const isLiteralEnd = (char: string): boolean =>
  PUNCTUATION.has(char) || char === ' ' || char === '\n' || char === '\t';

/**
 * Reads one JSON string token starting at the opening quote, and returns the index
 * just past its closing quote.
 *
 * Knowing where a string ends is the whole point: the previous implementation was a
 * regex, `/(".*?":\s*)(.*?)(?=,|\n|$)/g`, and a regex cannot tokenize JSON. Two
 * defects came out of that and both are fixed by scanning instead:
 *
 * - **A comma inside a string value split the value.** A message reading
 *   `"unset, using the default"` was colored up to the comma; the remainder was
 *   emitted bare, and the following `","appId":` was then matched as if it were a
 *   *key* and colored cyan.
 * - **The closing brace was swallowed into the last value.** `(?=,|\n|$)` has no
 *   `}` in its lookahead, so the final value's color span ran to end of line and
 *   the `}` came out in whatever color that value had.
 */
const endOfString = (json: string, open: number): number => {
  for (let index = open + 1; index < json.length; index += 1) {
    const char = json[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '"') return index + 1;
  }
  // Unreachable for `JSON.stringify` output, which never leaves a string open.
  return json.length;
};

/** The next non-whitespace character, or `''` at the end. */
const peek = (json: string, from: number): string => {
  for (let index = from; index < json.length; index += 1) {
    const char = json[index];
    if (char !== ' ' && char !== '\n' && char !== '\t') return char ?? '';
  }
  return '';
};

/**
 * Colors `safeStringify`'s output by scanning it, so nothing is re-serialized and
 * the bytes are unchanged once the escapes are stripped. That equivalence is the
 * invariant worth keeping: it is what lets a pretty line still be parsed, and it
 * comes free here rather than needing every `JSON.stringify` edge case - dropped
 * `undefined`, `toJSON`, non-finite numbers, the circular fallback - reimplemented.
 */
export function formatColoredJson(obj: LogEntry, level: LogLevel): string {
  const json = safeStringify(obj);
  // A key applies its color to the value that follows it, including through an
  // array, so every entry of `"maskFields":["a","b"]` is colored alike.
  const keyStack: (string | undefined)[] = [undefined];
  let out = '';
  let index = 0;

  const colorFor = (value: string): ColorFn => {
    const key = keyStack[keyStack.length - 1];
    if (key === 'level') return getLevelColorFn(level);
    const mapped = key === undefined ? undefined : keyColors[key];
    return mapped ?? getValueColor(value);
  };

  while (index < json.length) {
    const char = json[index] ?? '';

    if (char === '"') {
      const end = endOfString(json, index);
      const token = json.slice(index, end);
      if (peek(json, end) === ':') {
        // A key: remember it unquoted, so the value after the colon can be
        // colored by name. `slice` rather than stripping quotes globally - a key
        // may legitimately contain one.
        keyStack[keyStack.length - 1] = token.slice(1, -1);
        out += cyan(token);
      } else {
        out += colorFor(token)(token);
      }
      index = end;
      continue;
    }

    if (PUNCTUATION.has(char)) {
      // A nested object or array gets its own key frame, so leaving it restores
      // the key of the level above rather than leaking the last inner one.
      if (char === '{' || char === '[') {
        keyStack.push(keyStack[keyStack.length - 1]);
      }
      if ((char === '}' || char === ']') && keyStack.length > 1) keyStack.pop();
      out += gray(char);
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\n' || char === '\t') {
      out += char;
      index += 1;
      continue;
    }

    let end = index;
    while (end < json.length && !isLiteralEnd(json[end] ?? '')) end += 1;
    const token = json.slice(index, end);
    out += colorFor(token)(token);
    index = end;
  }

  return out;
}
