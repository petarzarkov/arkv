import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { Logger } from './logger.js';
import { MemoryTransport } from './testing.js';
import type { LogFilter } from './types.js';

const capture = (
  config: ConstructorParameters<typeof Logger>[0] = {},
): { logger: Logger; sink: MemoryTransport } => {
  const sink = new MemoryTransport();
  return { logger: new Logger({ ...config, transports: [sink] }), sink };
};

const redactQuery: LogFilter = (entry) => {
  const url = entry['url'];
  if (typeof url !== 'string') return entry;
  return { ...entry, url: url.replace(/([?&]token=)[^&]*/g, '$1[REDACTED]') };
};

describe('filters', () => {
  const spies: { mockRestore(): void }[] = [];
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });
  const silence = (method: 'log' | 'error') => {
    const spy = spyOn(console, method).mockImplementation(() => undefined);
    spies.push(spy);
    return spy;
  };

  it('reaches a secret inside a value, which no key-name mask can', () => {
    const { logger, sink } = capture({ filters: [redactQuery] });

    logger.info('reset', { url: '/reset?token=abc123&lang=en' });

    expect(sink.last?.url).toBe('/reset?token=[REDACTED]&lang=en');
  });

  it('drops the entry on undefined, and the filters after it never run', () => {
    let later = 0;
    const { logger, sink } = capture({
      filters: [
        (entry) => (entry['path'] === '/health' ? undefined : entry),
        (entry) => {
          later += 1;
          return entry;
        },
      ],
    });

    logger.info('request', { path: '/health' });
    logger.info('request', { path: '/orders' });

    expect(sink.entries.map((entry) => entry['path'])).toEqual(['/orders']);
    expect(later).toBe(1);
  });

  it('runs in order, each seeing what the one before returned', () => {
    const { logger, sink } = capture({
      filters: [
        (entry) => ({ ...entry, trail: ['a'] }),
        (entry) => ({
          ...entry,
          trail: [...(entry['trail'] as string[]), 'b'],
        }),
      ],
    });

    logger.info('ordered');

    expect(sink.last?.trail).toEqual(['a', 'b']);
  });

  it('runs once per entry, however many transports there are', () => {
    let runs = 0;
    const first = new MemoryTransport();
    const second = new MemoryTransport();
    const logger = new Logger({
      transports: [first, second],
      filters: [
        (entry) => {
          runs += 1;
          return entry;
        },
      ],
    });

    logger.info('fan out');

    expect(runs).toBe(1);
    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
  });

  it('covers the default console transport, with nothing to wrap', () => {
    const log = silence('log');
    const logger = new Logger({
      isDevelopment: false,
      filters: [
        redactQuery,
        (entry) => (entry.message === 'noise' ? undefined : entry),
      ],
    });

    logger.info('noise');
    logger.info('reset', { url: '/reset?token=abc123' });

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('token=[REDACTED]');
    expect(line).not.toContain('abc123');
  });

  it('runs before sanitization, so what it returns is still masked', () => {
    const { logger, sink } = capture({
      filters: [(entry) => ({ ...entry, token: 'added-by-filter' })],
    });

    logger.info('checked');

    expect(sink.last?.token).toBe('[MASKED]');
  });

  it('spares a dropped entry the sanitize walk', () => {
    const reads = (filter: LogFilter): number => {
      let count = 0;
      capture({ filters: [filter] }).logger.info('walked', {
        nested: {
          get deep() {
            count += 1;
            return 'value';
          },
        },
      });
      return count;
    };

    expect(reads(() => undefined)).toBeLessThan(reads((entry) => entry));
  });

  it('sees the error already serialized, so it tests the name', () => {
    let seen: unknown;
    const { logger } = capture({
      filters: [
        (entry) => {
          seen = entry.error;
          return entry;
        },
      ],
    });

    logger.error('failed', new TypeError('bad input'));

    expect(seen).not.toBeInstanceOf(Error);
    expect(seen).toMatchObject({ name: 'TypeError', message: 'bad input' });
  });

  it('is handed the level', () => {
    const { logger, sink } = capture({
      filters: [(entry, level) => (level === 'debug' ? undefined : entry)],
    });

    logger.debug('chatty');
    logger.warn('kept');

    expect(sink.entries.map((entry) => entry.message)).toEqual(['kept']);
  });

  it('drops the entry when a filter throws, reports once, and never fails the call', () => {
    const error = silence('error');
    const { logger, sink } = capture({
      filters: [
        () => {
          throw new Error('regex blew up');
        },
      ],
    });

    expect(() => logger.info('first')).not.toThrow();
    expect(() => logger.info('second')).not.toThrow();

    expect(sink.entries).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('regex blew up');
  });

  it('carries over to a child logger', () => {
    const { logger, sink } = capture({ filters: [redactQuery] });

    logger.child({ module: 'auth' }).info('reset', { url: '/r?token=abc' });

    expect(sink.last?.url).toBe('/r?token=[REDACTED]');
    expect(sink.last?.module).toBe('auth');
  });
});
