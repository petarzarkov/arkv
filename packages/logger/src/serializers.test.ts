import { describe, expect, it } from 'bun:test';
import { Logger } from './logger.js';
import { MemoryTransport } from './testing.js';

const capture = (
  config: ConstructorParameters<typeof Logger>[0] = {},
): { logger: Logger; sink: MemoryTransport } => {
  const sink = new MemoryTransport();
  return { logger: new Logger({ ...config, transports: [sink] }), sink };
};

describe('serializers', () => {
  it('rewrites a field into the shape worth keeping', () => {
    const { logger, sink } = capture({
      serializers: {
        req: (value) => {
          const request = value as { method: string; url: string };
          return { method: request.method, url: request.url };
        },
      },
    });

    logger.info('handled', {
      req: {
        method: 'GET',
        url: '/orders',
        headers: { cookie: 'a=b' },
        socket: { remoteAddress: '10.0.0.1' },
      },
    });

    expect(sink.last?.req).toEqual({ method: 'GET', url: '/orders' });
  });

  it('leaves a field with no serializer alone', () => {
    const { logger, sink } = capture({
      serializers: { req: () => 'rewritten' },
    });

    logger.info('handled', { req: {}, other: { kept: true } });

    expect(sink.last?.other).toEqual({ kept: true });
  });

  it('applies to a binding as well as a per-call field', () => {
    const { logger, sink } = capture({
      bindings: { deploy: { sha: 'abc123', dirty: true } },
      serializers: {
        deploy: (value) => (value as { sha: string }).sha,
      },
    });

    logger.info('booted');

    expect(sink.last?.deploy).toBe('abc123');
  });

  it('says so rather than failing the call when a serializer throws', () => {
    const { logger, sink } = capture({
      serializers: {
        req: () => {
          throw new Error('not the shape I expected');
        },
      },
    });

    expect(() => logger.info('handled', { req: null })).not.toThrow();
    expect(String(sink.last?.req)).toContain('not the shape I expected');
  });

  it('runs before sanitization, so what it returns is what gets masked', () => {
    const { logger, sink } = capture({
      serializers: {
        auth: () => ({ token: 'still-secret', scheme: 'bearer' }),
      },
    });

    logger.info('checked', { auth: 'anything' });

    expect(sink.last?.auth).toEqual({ token: '[MASKED]', scheme: 'bearer' });
  });
});

describe('timestamp mode', () => {
  it('writes an ISO string by default', () => {
    const { logger, sink } = capture();

    logger.info('hello');

    expect(typeof sink.last?.timestamp).toBe('string');
    expect(String(sink.last?.timestamp)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes epoch milliseconds when asked', () => {
    const before = Date.now();
    const { logger, sink } = capture({ timestamp: 'epoch' });

    logger.info('hello');

    const at = sink.last?.timestamp as number;
    expect(typeof at).toBe('number');
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});
