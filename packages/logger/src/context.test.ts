import { describe, expect, it } from 'bun:test';
import { ContextStore } from './context.js';
import { Logger } from './logger.js';
import { MemoryTransport } from './testing.js';

describe('ContextStore', () => {
  it('returns an empty context outside any scope', () => {
    expect(new ContextStore().getContext()).toEqual({});
  });

  // The inner scope used to call AsyncLocalStorage.run with its own object,
  // which replaces the store: the outer requestId vanished from every log line
  // written inside the nested scope.
  it('merges a nested scope into the enclosing one', () => {
    const store = new ContextStore();

    store.runWithContext({ requestId: 'r-1', userId: 'u-1' }, () => {
      store.runWithContext({ flow: 'job' }, () => {
        expect(store.getContext()).toEqual({
          requestId: 'r-1',
          userId: 'u-1',
          flow: 'job',
        });
      });
    });
  });

  it('lets the inner scope override a field it names', () => {
    const store = new ContextStore();

    store.runWithContext({ requestId: 'r-1', flow: 'http' }, () => {
      store.runWithContext({ flow: 'job' }, () => {
        expect(store.getContext().flow).toBe('job');
        expect(store.getContext().requestId).toBe('r-1');
      });
      expect(store.getContext().flow).toBe('http');
    });
  });

  it('starts clean when inherit is false', () => {
    const store = new ContextStore();

    store.runWithContext({ requestId: 'r-1' }, () => {
      store.runWithContext(
        { flow: 'detached' },
        () => {
          expect(store.getContext()).toEqual({ flow: 'detached' });
        },
        { inherit: false },
      );
    });
  });

  it('does not let an inner updateContext leak outward', () => {
    const store = new ContextStore();

    store.runWithContext({ requestId: 'r-1' }, () => {
      store.runWithContext({ flow: 'job' }, () => {
        store.updateContext({ userId: 'u-inner' });
      });
      expect(store.getContext().userId).toBeUndefined();
    });
  });

  // Documented behaviour, asserted so it cannot change silently: the store is
  // per-instance, so two apps in one process see two contexts.
  it('keeps two instances independent', () => {
    const a = new ContextStore();
    const b = new ContextStore();

    a.runWithContext({ requestId: 'from-a' }, () => {
      expect(b.getContext()).toEqual({});
    });
  });

  it('propagates the merged context into log entries', () => {
    const store = new ContextStore();
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] }, store);

    store.runWithContext({ requestId: 'r-9' }, () => {
      store.runWithContext({ flow: 'job' }, () => {
        logger.info('nested');
      });
    });

    expect(memory.last?.requestId).toBe('r-9');
    expect(memory.last?.flow).toBe('job');
  });
});
