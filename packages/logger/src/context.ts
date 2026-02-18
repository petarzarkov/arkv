import { AsyncLocalStorage } from 'node:async_hooks';
import type { AsyncContext } from './types.js';

export class ContextStore {
  private readonly asyncLocalStorage =
    new AsyncLocalStorage<AsyncContext>();

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

  runWithContext<T>(
    context: AsyncContext,
    callback: () => T,
  ): T {
    return this.asyncLocalStorage.run(context, callback);
  }
}
