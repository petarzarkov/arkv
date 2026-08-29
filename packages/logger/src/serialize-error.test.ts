import { describe, expect, it } from 'bun:test';
import { Logger } from './logger.js';
import { serializeError } from './serialize-error.js';
import { MemoryTransport } from './testing.js';

class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
  }
}

describe('serializeError', () => {
  it('keeps the three fields the entry always had', () => {
    const error = new Error('boom');
    const serialized = serializeError(error);

    expect(serialized.name).toBe('Error');
    expect(serialized.message).toBe('boom');
    expect(typeof serialized.stack).toBe('string');
  });

  it('carries the cause chain, which is what a wrapped error is for', () => {
    const root = new Error('ECONNREFUSED');
    const middle = new Error('could not reach the database', { cause: root });
    const top = new Error('request failed', { cause: middle });

    const serialized = serializeError(top);

    expect(serialized.message).toBe('request failed');
    const first = serialized.cause as { message: string; cause?: unknown };
    expect(first.message).toBe('could not reach the database');
    expect((first.cause as { message: string }).message).toBe('ECONNREFUSED');
  });

  it('keeps a non-Error cause rather than dropping it', () => {
    const serialized = serializeError(
      new Error('failed', { cause: 'the pool was drained' }),
    );

    expect(serialized.cause).toBe('the pool was drained');
  });

  it('carries the properties a library attaches, which is what you filter on', () => {
    const serialized = serializeError(new HttpError('gone', 410, 'E_GONE'));

    expect(serialized.statusCode).toBe(410);
    expect(serialized.code).toBe('E_GONE');
  });

  it('carries an AggregateError branch by branch', () => {
    const aggregate = new AggregateError(
      [new Error('first'), new Error('second')],
      'all attempts failed',
    );

    const serialized = serializeError(aggregate);

    expect(serialized.message).toBe('all attempts failed');
    const branches = serialized.errors as { message: string }[];
    expect(branches.map((branch) => branch.message)).toEqual([
      'first',
      'second',
    ]);
  });

  it('stops on a cause that points back at itself', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    (first as { cause?: unknown }).cause = second;

    const serialized = serializeError(first);

    // Terminates, and says why the chain ends rather than ending silently.
    expect(JSON.stringify(serialized)).toContain('[Circular]');
  });

  it('stops descending a chain longer than the cap', () => {
    let error = new Error('root');
    for (let depth = 0; depth < 40; depth += 1) {
      error = new Error(`wrap ${depth}`, { cause: error });
    }

    const serialized = serializeError(error);
    let hops = 0;
    let node: unknown = serialized.cause;
    while (node && typeof node === 'object') {
      hops += 1;
      node = (node as { cause?: unknown }).cause;
    }

    expect(hops).toBeLessThan(20);
  });

  it('caps the branches of an AggregateError', () => {
    const many = Array.from({ length: 200 }, (_, at) => new Error(`e${at}`));
    const serialized = serializeError(new AggregateError(many, 'many'));

    expect((serialized.errors as unknown[]).length).toBeLessThan(200);
  });
});

describe('an error logged through Logger', () => {
  const capture = (): { logger: Logger; sink: MemoryTransport } => {
    const sink = new MemoryTransport();
    return { logger: new Logger({ transports: [sink] }), sink };
  };

  it('reaches the transport with its cause and its code intact', () => {
    const { logger, sink } = capture();
    const root = new HttpError('upstream refused', 502, 'ECONNREFUSED');

    logger.error(
      'checkout failed',
      new Error('order not placed', { cause: root }),
    );

    const error = sink.last?.error as unknown as {
      message: string;
      cause: { message: string; statusCode: number; code: string };
    };
    expect(error.message).toBe('order not placed');
    expect(error.cause.message).toBe('upstream refused');
    expect(error.cause.statusCode).toBe(502);
    expect(error.cause.code).toBe('ECONNREFUSED');
  });

  it('masks a secret an error carried as a property', () => {
    const { logger, sink } = capture();
    const error = new Error('auth failed');
    Object.assign(error, { token: 'super-secret', endpoint: '/login' });

    logger.error(error);

    const serialized = sink.last?.error as unknown as Record<string, unknown>;
    expect(serialized.token).toBe('[MASKED]');
    expect(serialized.endpoint).toBe('/login');
  });
});
