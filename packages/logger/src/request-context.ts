import type {
  ContextScope,
  RunWithContextOptions,
} from './context-contract.js';
import type { AsyncContext } from './types.js';

/**
 * A `ContextScope` holding its fields in a plain field, with no `node:` import at
 * all.
 *
 * For a host that builds one logger per request, or one that already has its own
 * per-request object and wants the logger reading from it. It is also what keeps
 * {@link ContextScope} honest: a contract with one ALS-backed implementation is a
 * contract shaped like ALS.
 *
 * **`runWithContext` saves and restores rather than propagating.** That is correct
 * for a synchronous scope, and for one instance per request where nothing else
 * shares it. It is *not* correct for two overlapping async flows through one
 * instance: the restore runs when `callback` returns, and an `await` inside it
 * hands control to another flow that then reads these fields. Use
 * {@link ContextStore} for that, which is what `AsyncLocalStorage` is for.
 */
export class RequestScopedContext implements ContextScope {
  #fields: AsyncContext;

  constructor(fields: AsyncContext = {}) {
    this.#fields = fields;
  }

  getContext(): AsyncContext {
    return { ...this.#fields };
  }

  peekContext(): AsyncContext | undefined {
    return this.#fields;
  }

  updateContext(fields: Partial<AsyncContext>): void {
    Object.assign(this.#fields, fields);
  }

  runWithContext<T>(
    context: AsyncContext,
    callback: () => T,
    options?: RunWithContextOptions,
  ): T {
    const previous = this.#fields;
    this.#fields =
      options?.inherit === false ? { ...context } : { ...previous, ...context };
    try {
      return callback();
    } finally {
      this.#fields = previous;
    }
  }
}
