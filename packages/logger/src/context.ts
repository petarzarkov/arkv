import { AsyncLocalStorage } from 'node:async_hooks';
import type { AsyncContext } from './types.js';

export interface RunWithContextOptions {
  /**
   * Inherit the enclosing scope's fields. Default `true`.
   */
  inherit?: boolean;
}

/**
 * Request-scoped fields propagated across async boundaries.
 *
 * **The store is per-instance, not per-process.** Every `new ContextStore()`
 * owns its own `AsyncLocalStorage`, so two stores in one process hold two
 * independent contexts, and a `Logger` only ever reads the store it was
 * constructed with. Two apps booted in the same process each get their own
 * unless they are handed the same instance — construct one and share it.
 */
export class ContextStore {
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
    const next =
      options?.inherit === false
        ? context
        : { ...this.asyncLocalStorage.getStore(), ...context };
    return this.asyncLocalStorage.run(next, callback);
  }
}
