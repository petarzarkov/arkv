import { bold, dim, getLevelColorFn, isColorSupported } from '@arkv/colors';
import { isPlainObject, safeStringify } from '@arkv/shared';
import { type LogEntry, type LogFormatter } from './types.js';

/**
 * Fields the line renders in its own positions, so they are not repeated among
 * the trailing pairs.
 */
const HEADER_KEYS = new Set([
  'level',
  'timestamp',
  'pid',
  'message',
  'error',
  'appId',
]);

/** How deep `logfmtFormat` flattens before giving up and encoding the rest. */
const MAX_FLATTEN_DEPTH = 4;

/**
 * `09:00:15.123` out of an ISO string, or out of the epoch milliseconds that
 * `timestamp: 'epoch'` writes. Anything else is rendered as it stands.
 */
function clockTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(11, 23);
  }
  if (typeof value === 'string' && value.length >= 23) {
    return value.slice(11, 23);
  }
  return typeof value === 'string' ? value : '';
}

/** A value as one token. An object becomes JSON, which is the cheap rendering. */
function scalar(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return safeStringify(value as LogEntry);
}

/**
 * A human line, for a terminal.
 *
 * ```
 * 09:00:15.123 INFO  order placed  requestId=01a049b3 elapsedMs=14
 * ```
 *
 * The reserved fields take their own positions and everything else trails as
 * `key=value`, which is the arrangement `pino-pretty` and `bunyan` both settled
 * on. Nested values are rendered as JSON rather than inspected. `util.inspect` is
 * the obvious tool and the wrong one: measured on Bun 1.4.0 it is 7.4 microseconds
 * against 155 nanoseconds for `JSON.stringify` of the same entry, where a whole
 * `Logger.info` call is roughly 1.5 microseconds. A formatter runs once per entry,
 * so that is several times the cost of everything else the logger does. It is why
 * `pino` pretty-prints in a separate process rather than in the one serving
 * requests.
 *
 * An error follows on its own lines, indented, because a stack on one line is not
 * a thing anybody reads.
 */
export const textFormat: LogFormatter = (entry, level) => {
  const colored = isColorSupported();
  const paint = colored ? getLevelColorFn(level) : undefined;
  const label = level.toUpperCase().padEnd(7);

  const parts: string[] = [];
  const time = clockTime(entry.timestamp);
  if (time !== '') {
    parts.push(colored ? dim(time) : time);
  }
  parts.push(paint ? paint(label) : label);
  // Through `scalar`, not `String`: the entry builder always writes a string
  // here, but `LogEntry` does not promise one and a hand-built entry can hold
  // anything. `String({})` would render `[object Object]`.
  const message = entry.message === undefined ? '' : scalar(entry.message);
  parts.push(colored ? bold(message) : message);

  const pairs: string[] = [];
  for (const key of Object.keys(entry)) {
    if (HEADER_KEYS.has(key)) {
      continue;
    }
    const rendered = `${key}=${scalar(entry[key])}`;
    pairs.push(colored ? dim(rendered) : rendered);
  }

  let line = `${parts.join(' ')}${pairs.length > 0 ? `  ${pairs.join(' ')}` : ''}`;

  const error = entry.error as SerializedShape | undefined;
  if (error) {
    line += renderError(error, colored, 'error');
  }
  return line;
};

interface SerializedShape {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
}

/**
 * The error, its frames, and the chain behind it.
 *
 * `Caused by:` is the shape Java and Python print and the one people already know
 * how to read. Without it the cause the entry now carries would be visible in the
 * JSON and invisible in the format meant for a human.
 */
function renderError(
  error: SerializedShape,
  colored: boolean,
  label: 'error' | 'cause',
): string {
  const prefix = label === 'cause' ? 'Caused by: ' : '';
  const head = `${prefix}${error.name ?? 'Error'}: ${error.message ?? ''}`;
  let out = `\n  ${colored ? getLevelColorFn('error')(head) : head}`;

  // The entry builder comma-flattens the stack, which is right for JSON and
  // unreadable here. Splitting on the comma alone would also split a message
  // that contains one, so only the parts that look like frames are taken.
  const stack = typeof error.stack === 'string' ? error.stack : '';
  for (const part of stack.split(',')) {
    const frame = part.trim();
    if (frame.startsWith('at ')) {
      out += `\n    ${colored ? dim(frame) : frame}`;
    }
  }

  const { cause } = error;
  if (isPlainObject(cause)) {
    out += renderError(cause as SerializedShape, colored, 'cause');
  } else if (cause !== undefined) {
    // `new Error(msg, { cause: 'a string' })` is legal and the string is the
    // whole explanation.
    const text = `Caused by: ${scalar(cause)}`;
    out += `\n  ${colored ? getLevelColorFn('error')(text) : text}`;
  }
  return out;
}

const needsQuoting = (value: string): boolean =>
  value === '' || /[\s"=]/.test(value);

const quote = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const token = (value: string): string =>
  needsQuoting(value) ? quote(value) : value;

function flatten(
  into: string[],
  key: string,
  value: unknown,
  depth: number,
): void {
  if (isPlainObject(value) && depth < MAX_FLATTEN_DEPTH) {
    const keys = Object.keys(value);
    if (keys.length > 0) {
      for (const nested of keys) {
        flatten(into, `${key}.${nested}`, value[nested], depth + 1);
      }
      return;
    }
  }
  into.push(`${key}=${token(scalar(value))}`);
}

/**
 * `key=value` pairs on one line, the format Heroku, Grafana Loki and Splunk read
 * without a parser.
 *
 * ```
 * level=info time=2026-08-29T09:00:15.123Z msg="order placed" order.id=ord_1
 * ```
 *
 * logfmt is flat, so a nested object becomes dotted keys rather than an encoded
 * blob: `order.id`, not `order={"id":…}`. Past {@link MAX_FLATTEN_DEPTH} it stops
 * and encodes what is left, because a deeply nested field flattened all the way
 * produces more keys than a log line can usefully carry.
 *
 * A value is quoted when it holds whitespace, a quote or an equals sign, which is
 * the rule every logfmt reader implements. It is never coloured: this format
 * exists to be parsed.
 */
export const logfmtFormat: LogFormatter = (entry) => {
  const pairs: string[] = [];
  if (entry.level !== undefined) {
    pairs.push(`level=${token(scalar(entry.level))}`);
  }
  if (entry.timestamp !== undefined) {
    pairs.push(`time=${token(scalar(entry.timestamp))}`);
  }
  if (entry.message !== undefined) {
    pairs.push(`msg=${token(scalar(entry.message))}`);
  }
  for (const key of Object.keys(entry)) {
    if (key === 'level' || key === 'timestamp' || key === 'message') {
      continue;
    }
    flatten(pairs, key, entry[key], 0);
  }
  return pairs.join(' ');
};
