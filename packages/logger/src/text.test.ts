import { describe, expect, it } from 'bun:test';
import { strip } from '@arkv/colors';
import { Logger } from './logger.js';
import { logfmtFormat, textFormat } from './text.js';
import { LogLevel, type LogEntry } from './types.js';

const entry = (extra: LogEntry = {}): LogEntry => ({
  level: 'info',
  timestamp: '2026-08-29T09:00:15.123Z',
  pid: 4242,
  message: 'order placed',
  ...extra,
});

const text = (given: LogEntry, level: LogLevel = LogLevel.INFO): string =>
  strip(textFormat(given, level));

describe('textFormat', () => {
  it('leads with the clock time, the level and the message', () => {
    const line = text(entry());

    expect(line.startsWith('09:00:15.123 INFO')).toBe(true);
    expect(line).toContain('order placed');
    // The reserved fields take their own positions rather than trailing.
    expect(line).not.toContain('timestamp=');
    expect(line).not.toContain('message=');
  });

  it('reads an epoch timestamp as a clock time too', () => {
    const at = Date.UTC(2026, 7, 29, 9, 0, 15, 123);

    expect(text(entry({ timestamp: at })).startsWith('09:00:15.123')).toBe(
      true,
    );
  });

  it('trails everything else as key=value', () => {
    const line = text(entry({ requestId: 'r-1', elapsedMs: 14 }));

    expect(line).toContain('requestId=r-1');
    expect(line).toContain('elapsedMs=14');
  });

  it('renders a nested value as JSON rather than dropping it', () => {
    const line = text(entry({ order: { id: 'ord_1', total: 4200 } }));

    expect(line).toContain('order={"id":"ord_1","total":4200}');
  });

  it('pads the level so lines stay in columns', () => {
    const info = text(entry(), LogLevel.INFO);
    const verbose = text(entry({ level: 'verbose' }), LogLevel.VERBOSE);

    expect(info.indexOf('order placed')).toBe(verbose.indexOf('order placed'));
  });

  it('puts an error and its frames on their own lines', () => {
    const line = text(
      entry({
        error: {
          name: 'HttpError',
          message: 'upstream refused',
          stack:
            'HttpError: upstream refused,at handler (/a.ts:1:1),at run (/b.ts:2:2)',
        },
      }),
      LogLevel.ERROR,
    );
    const lines = line.split('\n');

    expect(lines[1]).toBe('  HttpError: upstream refused');
    expect(lines[2]).toBe('    at handler (/a.ts:1:1)');
    expect(lines[3]).toBe('    at run (/b.ts:2:2)');
  });

  it('does not split a message that happens to contain a comma', () => {
    const line = text(
      entry({
        error: {
          name: 'Error',
          message: 'unset, using the default',
          stack: 'Error: unset, using the default,at run (/b.ts:2:2)',
        },
      }),
      LogLevel.ERROR,
    );

    // Only the part that looks like a frame is treated as one.
    expect(line).toContain('  Error: unset, using the default');
    expect(
      line.split('\n').filter((each) => each.includes('at ')),
    ).toHaveLength(1);
  });

  it('follows the cause chain, which the JSON carries and a human needs', () => {
    const line = text(
      entry({
        error: {
          name: 'Error',
          message: 'order not placed',
          stack: 'Error: order not placed,at a (/a.ts:1:1)',
          cause: {
            name: 'Error',
            message: 'ECONNREFUSED',
            stack: 'Error: ECONNREFUSED,at b (/b.ts:2:2)',
          },
        },
      }),
      LogLevel.ERROR,
    );

    expect(line).toContain('Caused by: Error: ECONNREFUSED');
    expect(line).toContain('at b (/b.ts:2:2)');
  });

  it('keeps a non-Error cause, since the string is the whole explanation', () => {
    const line = text(
      entry({
        error: {
          name: 'Error',
          message: 'failed',
          cause: 'the pool was drained',
        },
      }),
      LogLevel.ERROR,
    );

    expect(line).toContain('Caused by: the pool was drained');
  });
});

describe('logfmtFormat', () => {
  it('leads with level, time and msg', () => {
    const line = logfmtFormat(entry(), LogLevel.INFO);

    expect(
      line.startsWith(
        'level=info time=2026-08-29T09:00:15.123Z msg="order placed"',
      ),
    ).toBe(true);
  });

  it('quotes a value with whitespace, a quote or an equals sign', () => {
    const line = logfmtFormat(
      entry({ a: 'has space', b: 'has"quote', c: 'has=equals', d: 'plain' }),
      LogLevel.INFO,
    );

    expect(line).toContain('a="has space"');
    expect(line).toContain('b="has\\"quote"');
    expect(line).toContain('c="has=equals"');
    // Nothing to escape, so nothing is quoted.
    expect(line).toContain('d=plain');
  });

  it('quotes an empty value, which would otherwise read as a bare key', () => {
    expect(logfmtFormat(entry({ note: '' }), LogLevel.INFO)).toContain(
      'note=""',
    );
  });

  it('flattens a nested object into dotted keys, because logfmt is flat', () => {
    const line = logfmtFormat(
      entry({ order: { id: 'ord_1', total: 4200 } }),
      LogLevel.INFO,
    );

    expect(line).toContain('order.id=ord_1');
    expect(line).toContain('order.total=4200');
    expect(line).not.toContain('order={');
  });

  it('stops flattening past the depth cap and encodes what is left', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'bottom' } } } } } };
    const line = logfmtFormat(entry(deep), LogLevel.INFO);

    // Four levels of flattening, then the remainder as one encoded value
    // rather than an unbounded run of keys.
    expect(line).toContain('a.b.c.d.e=');
    expect(line).toContain('bottom');
    expect(line).not.toContain('a.b.c.d.e.f=');
  });

  it('renders an empty object as a value rather than vanishing', () => {
    expect(logfmtFormat(entry({ meta: {} }), LogLevel.INFO)).toContain(
      'meta={}',
    );
  });

  it('is never coloured, because this format exists to be parsed', () => {
    const line = logfmtFormat(entry(), LogLevel.ERROR);

    expect(strip(line)).toBe(line);
  });
});

describe('through a Logger', () => {
  it('formats what the logger actually emits, redaction included', () => {
    const lines: string[] = [];
    const logger = new Logger({
      transports: [
        {
          write: (given, level) => lines.push(strip(textFormat(given, level))),
        },
      ],
    });

    logger.info('signed in', { userId: 'u-1', password: 'hunter2' });

    expect(lines[0]).toContain('userId=u-1');
    // The formatter sees the sanitized entry, so masking still applies.
    expect(lines[0]).toContain('password=[MASKED]');
  });
});
