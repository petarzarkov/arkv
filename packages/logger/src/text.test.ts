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

describe('one entry is one line', () => {
  it('escapes the line breaks that would forge a second logfmt record', () => {
    const forged = logfmtFormat(
      entry({ message: 'ok\nlevel=error msg="admin deleted everything"' }),
      LogLevel.INFO,
    );

    // A raw newline inside a quoted value still ends the physical line, and the
    // remainder parses as a genuine record of its own.
    expect(forged.split('\n')).toHaveLength(1);
    expect(forged).toContain('\\n');
    expect(forged).not.toMatch(/\n/);
  });

  it('escapes a carriage return too, which ends a line on its own', () => {
    const line = logfmtFormat(entry({ note: 'a\rb' }), LogLevel.INFO);

    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('\\r');
  });

  it('keeps a text line to one line, error block aside', () => {
    const line = text(entry({ message: 'ok\nfake line', note: 'a\nb' }));

    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('\\n');
  });
});

describe('fields the header does not render', () => {
  it('trails pid and appId rather than dropping them', () => {
    const line = text(entry({ appId: 'api-1.0.0-prod' }));

    expect(line).toContain('pid=4242');
    expect(line).toContain('appId=api-1.0.0-prod');
  });
});

describe('a timestamp that is not what it claims', () => {
  it('does not throw on an epoch outside the Date range', () => {
    // `new Date(1e20).toISOString()` is a RangeError, and a formatter that
    // throws takes the log call with it.
    expect(() => text(entry({ timestamp: 1e20 }))).not.toThrow();
    expect(() => text(entry({ timestamp: Number.NaN }))).not.toThrow();
    expect(() => text(entry({ timestamp: Infinity }))).not.toThrow();
  });

  it('leaves a string that is not an ISO timestamp alone', () => {
    // Slicing 11..23 of this would produce a meaningless window into it.
    const line = text(entry({ timestamp: 'not-a-timestamp-but-long-enough' }));

    expect(line).toContain('not-a-timestamp-but-long-enough');
  });
});

describe('a key is caller data too', () => {
  const forged = { 'note\nlevel=error msg=forged': 'x' };

  it('cannot forge a record through a text key', () => {
    expect(text(entry(forged)).split('\n')).toHaveLength(1);
  });

  it('cannot forge a record through a logfmt key', () => {
    const line = logfmtFormat(entry(forged), LogLevel.INFO);

    expect(line.split('\n')).toHaveLength(1);
    expect(line).toContain('\\n');
  });

  it('cannot forge one through a nested key either', () => {
    const line = logfmtFormat(
      entry({ meta: { 'a\rlevel=error': 1 } }),
      LogLevel.INFO,
    );

    // `split('\n')` alone cannot see a raw carriage return, and a terminal
    // treats one as a line break all the same.
    expect(line).not.toMatch(/[\n\r]/);
    expect(line).toContain('\\r');
  });
});

describe('every field meets the same boundary', () => {
  // The message was escaped, then keys and values, then the timestamp. Each was
  // the same bug in a field the previous fix had not thought of, which is why
  // the escaping moved to one place per format.
  const breaks = ['\n', '\r'];

  for (const which of breaks) {
    const label = which === '\n' ? 'a newline' : 'a carriage return';

    it(`cannot start a line from a timestamp holding ${label}`, () => {
      const forged = `bad${which}level=error msg=forged`;
      expect(text(entry({ timestamp: forged }))).not.toMatch(/[\n\r]/);
    });

    it(`cannot start one from an ISO-prefixed timestamp holding ${label}`, () => {
      // Matches the ISO shape at the front and carries a break behind it.
      const forged = `2026-08-29T09:00:15${which}level=error`;
      expect(text(entry({ timestamp: forged }))).not.toMatch(/[\n\r]/);
    });

    it(`cannot start one from a message holding ${label}`, () => {
      expect(text(entry({ message: `ok${which}level=error` }))).not.toMatch(
        /[\n\r]/,
      );
    });

    it(`cannot start one from a field name holding ${label}`, () => {
      expect(text(entry({ [`k${which}level=error`]: 1 }))).not.toMatch(
        /[\n\r]/,
      );
    });

    it(`cannot start a logfmt line from any of them holding ${label}`, () => {
      const line = logfmtFormat(
        entry({
          timestamp: `bad${which}x`,
          message: `ok${which}y`,
          [`k${which}z`]: `v${which}w`,
        }),
        LogLevel.INFO,
      );
      expect(line).not.toMatch(/[\n\r]/);
    });
  }

  it('still renders the error block it writes itself', () => {
    const line = text(
      entry({
        error: {
          name: 'Error',
          message: 'boom',
          stack: 'Error: boom,at a (/a:1:1)',
        },
      }),
      LogLevel.ERROR,
    );

    // Ours, not the caller's, so it keeps its lines.
    expect(line.split('\n')).toHaveLength(3);
  });
});

describe('the widest instant a Date holds', () => {
  it('reads its time even though the year is expanded', () => {
    // `new Date(8.64e15).toISOString()` is `+275760-09-13T00:00:00.000Z`, which
    // a fixed slice(11, 23) rendered as `13T00:00:00.`.
    expect(text(entry({ timestamp: 8.64e15 })).startsWith('00:00:00.000')).toBe(
      true,
    );
  });

  it('still reads an ordinary one', () => {
    expect(text(entry()).startsWith('09:00:15.123')).toBe(true);
  });
});

describe('the error block is caller data too', () => {
  // Only the indentation between these lines belongs to the formatter. Treating
  // the whole block as its own structure let a fourth instance of the forging
  // bug through.
  const frames = (line: string): string[] =>
    line.split('\n').filter((each) => each.trim().startsWith('at '));

  for (const which of ['\n', '\r']) {
    const label = which === '\n' ? 'a newline' : 'a carriage return';

    it(`cannot forge a record through an error message holding ${label}`, () => {
      const line = text(
        entry({
          error: {
            name: 'E',
            message: `boom${which}level=error msg=forged`,
            stack: 'E: boom,at a (/a:1:1)',
          },
        }),
        LogLevel.ERROR,
      );

      // Head, one frame, and the record itself. Nothing else.
      expect(line.split('\n')).toHaveLength(3);
      expect(line).toContain(which === '\n' ? '\\n' : '\\r');
    });

    it(`cannot forge one through an error name holding ${label}`, () => {
      const line = text(
        entry({ error: { name: `E${which}level=error`, message: 'boom' } }),
        LogLevel.ERROR,
      );

      expect(line.split('\n')).toHaveLength(2);
    });

    it(`cannot forge one through a stack frame holding ${label}`, () => {
      const line = text(
        entry({
          error: {
            name: 'E',
            message: 'boom',
            stack: `E: boom,at a (/a:1:1)${which}level=error msg=forged`,
          },
        }),
        LogLevel.ERROR,
      );

      expect(frames(line)).toHaveLength(1);
      expect(line.split('\n')).toHaveLength(3);
    });

    it(`cannot forge one through a scalar cause holding ${label}`, () => {
      const line = text(
        entry({
          error: {
            name: 'E',
            message: 'boom',
            cause: `drained${which}level=error msg=forged`,
          },
        }),
        LogLevel.ERROR,
      );

      expect(line.split('\n')).toHaveLength(3);
    });

    it(`cannot forge one through a nested cause holding ${label}`, () => {
      const line = text(
        entry({
          error: {
            name: 'E',
            message: 'boom',
            cause: { name: 'Inner', message: `deep${which}level=error` },
          },
        }),
        LogLevel.ERROR,
      );

      expect(line.split('\n')).toHaveLength(3);
    });
  }
});
