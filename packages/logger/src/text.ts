import { bold, dim, getLevelColorFn, isColorSupported } from '@arkv/colors';
import { isPlainObject, safeStringify } from '@arkv/shared';
import { type LogEntry, type LogFormatter } from './types.js';

/**
 * Fields the line renders in its own positions, so they are not repeated among
 * the trailing pairs.
 *
 * `pid` and `appId` are deliberately not here. They were, and since nothing
 * rendered them in a position either, the text output simply dropped both. They
 * trail as ordinary pairs instead: no information lost, and no header layout
 * invented to hold them.
 */
const HEADER_KEYS = new Set(['level', 'timestamp', 'message', 'error']);

/** How deep `logfmtFormat` flattens before giving up and encoding the rest. */
const MAX_FLATTEN_DEPTH = 4;

/**
 * `09:00:15.123` out of an ISO string, or out of the epoch milliseconds that
 * `timestamp: 'epoch'` writes. Anything else is rendered as it stands.
 */
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** The widest instant a `Date` can hold. Past it `toISOString` throws. */
const MAX_EPOCH_MS = 8.64e15;

function clockTime(value: unknown): string {
  if (typeof value === 'number') {
    // `new Date(1e20).toISOString()` is a `RangeError`, and a formatter that
    // throws takes the log call down with it.
    if (!Number.isFinite(value) || Math.abs(value) > MAX_EPOCH_MS) {
      return String(value);
    }
    return timeOf(new Date(value).toISOString());
  }
  if (typeof value === 'string') {
    // Sliced only when it is the shape the slice assumes; anything else would
    // come out as a meaningless window into the middle of the string.
    return ISO_SHAPE.test(value) ? timeOf(value) : value;
  }
  return '';
}

/**
 * The time half, found rather than counted.
 *
 * A fixed `slice(11, 23)` assumes a four-digit year, and the widest instant a
 * `Date` holds does not have one: `new Date(8.64e15).toISOString()` is
 * `+275760-09-13T00:00:00.000Z`, which that slice rendered as `13T00:00:00.`.
 */
const timeOf = (iso: string): string => iso.slice(iso.indexOf('T') + 1, -1);

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
  const message =
    entry.message === undefined ? '' : oneLine(scalar(entry.message));
  parts.push(colored ? bold(message) : message);

  const pairs: string[] = [];
  for (const key of Object.keys(entry)) {
    if (HEADER_KEYS.has(key)) {
      continue;
    }
    // The key is caller data too: `{ 'note\nlevel=error': 1 }` is a legal object
    // and forges a record exactly as a value would.
    const rendered = `${oneLine(key)}=${oneLine(scalar(entry[key]))}`;
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

/**
 * Backslashes first, then quotes, then the line breaks.
 *
 * A raw newline inside a quoted value still ends the physical line, so a message
 * of `ok\nlevel=error msg=forged` produced two records and the second parsed as a
 * genuine one. That is log forging, and it is reachable from any string a caller
 * logs. One entry is one line, always.
 */
const quote = (value: string): string =>
  `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')}"`;

/** The same guarantee for the format that is not quoted at all. */
const oneLine = (value: string): string =>
  value.includes('\n') || value.includes('\r')
    ? value.replaceAll('\n', '\\n').replaceAll('\r', '\\r')
    : value;

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
        flatten(into, `${key}.${oneLine(nested)}`, value[nested], depth + 1);
      }
      return;
    }
  }
  // `token` quotes and escapes the value; the key gets the same line-break
  // treatment, since an object key can hold one just as freely.
  into.push(`${token(oneLine(key))}=${token(scalar(value))}`);
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
