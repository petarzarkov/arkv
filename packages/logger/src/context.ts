import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  ContextScope,
  RunWithContextOptions,
} from './context-contract.js';
import type { AsyncContext } from './types.js';

export type { RunWithContextOptions };

/**
 * Request-scoped fields propagated across async boundaries.
 *
 * **The store is per-instance, not per-process.** Every `new ContextStore()`
 * owns its own `AsyncLocalStorage`, so two stores in one process hold two
 * independent contexts, and a `Logger` only ever reads the store it was
 * constructed with. Two apps booted in the same process each get their own
 * unless they are handed the same instance — construct one and share it.
 */
export class ContextStore implements ContextScope {
  private readonly asyncLocalStorage = new AsyncLocalStorage<AsyncContext>();

  getContext(): AsyncContext {
    const context = this.asyncLocalStorage.getStore();
    if (!context) {
      return {};
    }
    return { ...context };
  }

  updateContext(obj: Partial<AsyncContext>): void {
    const context = this.asyncLocalStorage.getStore();
    if (context) {
      Object.assign(context, obj);
    }
  }

  /**
   * Nested scopes merge: the inner one inherits the outer's fields and
   * overrides only the keys it names. `AsyncLocalStorage.run` on its own
   * replaces the store outright, which drops the `requestId` an outer scope
   * established — the field a log is most often correlated by.
   *
   * The merged context is a fresh object, so an `updateContext` inside the
   * inner scope does not leak back out. Pass `{ inherit: false }` for a scope
   * that must start clean, such as a detached background job.
   */
  runWithContext<T>(
    context: AsyncContext,
    callback: () => T,
    options?: RunWithContextOptions,
  ): T {
    if (options?.inherit === false) {
      return this.asyncLocalStorage.run(context, callback);
    }
    // One spread where there is nothing to merge, which is the outermost scope of
    // every request. A two-source object spread costs 112.9 ns against 21.9 ns for
    // one, so merging with `undefined` was most of the cost of entering a scope.
    const enclosing = this.asyncLocalStorage.getStore();
    return this.asyncLocalStorage.run(
      enclosing === undefined ? { ...context } : { ...enclosing, ...context },
      callback,
    );
  }
}
