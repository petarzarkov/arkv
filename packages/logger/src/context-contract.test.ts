import { describe, expect, it, spyOn } from 'bun:test';
import { ContextStore } from './context.js';
import { Logger } from './logger.js';
import { RequestScopedContext } from './request-context.js';
import { defaultTestConfig, parseLogOutput } from './test-utils.js';
import type { ContextScope, ContextSource } from './context-contract.js';

/**
 * The logger used to require a `ContextStore`, so its request fields could only
 * come from an `AsyncLocalStorage`. Anything satisfying the read side does now.
 */
const fieldsFrom = (context: ContextSource | undefined) => {
  const written: string[] = [];
  const logger = new Logger(
    {
      ...defaultTestConfig,
      transports: [
        {
          write: (entry) => {
            written.push(JSON.stringify(entry));
          },
        },
      ],
    },
    context,
  );
  logger.info('probe');
  return parseLogOutput(written[0] ?? '{}');
};

describe('what Logger accepts as a context', () => {
  it('reads a ContextStore, as it always did', () => {
    const store = new ContextStore();
    const fields = store.runWithContext({ requestId: 'r1' }, () =>
      fieldsFrom(store),
    );

    expect(fields.requestId).toBe('r1');
  });

  it('reads a plain object, live', () => {
    const holder = { requestId: 'r2' };
    expect(fieldsFrom(holder).requestId).toBe('r2');

    // Live rather than snapshotted at construction: a host that fills its
    // per-request object after building the logger still gets the fields.
    holder.requestId = 'r3';
    expect(fieldsFrom(holder).requestId).toBe('r3');
  });

  it('reads a function, for a host with its own lookup', () => {
    let current: Record<string, unknown> | undefined = { userId: 'u1' };
    expect(fieldsFrom(() => current).userId).toBe('u1');

    // And an absent scope is not an error.
    current = undefined;
    expect(fieldsFrom(() => current).userId).toBeUndefined();
  });

  it('reads a scope of its own with no AsyncLocalStorage in it', () => {
    const scope = new RequestScopedContext({ requestId: 'r4' });
    expect(fieldsFrom(scope).requestId).toBe('r4');
  });

  it('still works with no context at all', () => {
    expect(fieldsFrom(undefined).message).toBe('probe');
  });
});

/*
 * `ContextStore` does not implement `peekContext`, and this is why: a subclass
 * overriding `getContext` must stay the method the logger reads. The mock stands in
 * for such an override, and it is also how the existing suite sets its fields.
 */
describe('an overridden getContext is not bypassed', () => {
  it('reads getContext on a ContextStore even outside a scope', () => {
    const store = new ContextStore();
    spyOn(store, 'getContext').mockReturnValue({ requestId: 'overridden' });

    expect(fieldsFrom(store).requestId).toBe('overridden');
  });

  it('prefers peekContext only where a reader offers one', () => {
    const reader: ContextScope = new RequestScopedContext({ requestId: 'r5' });
    const peek = spyOn(reader, 'peekContext');

    fieldsFrom(reader);

    expect(peek).toHaveBeenCalled();
  });
});

describe('RequestScopedContext', () => {
  it('merges a nested scope and restores the outer one', () => {
    const scope = new RequestScopedContext({ requestId: 'r1', flow: 'http' });

    scope.runWithContext({ userId: 'u1', flow: 'job' }, () => {
      expect(scope.getContext()).toEqual({
        requestId: 'r1',
        userId: 'u1',
        flow: 'job',
      });
    });

    expect(scope.getContext()).toEqual({ requestId: 'r1', flow: 'http' });
  });

  it('starts clean when inheritance is refused', () => {
    const scope = new RequestScopedContext({ requestId: 'r1' });

    scope.runWithContext(
      { jobId: 'j1' },
      () => {
        expect(scope.getContext()).toEqual({ jobId: 'j1' });
      },
      { inherit: false },
    );
  });

  it('restores the outer scope even when the callback throws', () => {
    const scope = new RequestScopedContext({ requestId: 'r1' });

    expect(() =>
      scope.runWithContext({ requestId: 'inner' }, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(scope.getContext()).toEqual({ requestId: 'r1' });
  });

  it('takes an update onto the live fields', () => {
    const scope = new RequestScopedContext();
    scope.updateContext({ userId: 'u2' });

    expect(scope.getContext()).toEqual({ userId: 'u2' });
  });

  it('hands back a copy, so a mutation cannot reach the fields', () => {
    const scope = new RequestScopedContext({ requestId: 'r1' });
    const copy = scope.getContext();
    copy['requestId'] = 'tampered';

    expect(scope.getContext()['requestId']).toBe('r1');
  });
});
