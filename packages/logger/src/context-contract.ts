import type { AsyncContext } from './types.js';

/**
 * What the logger reads its request-scoped fields through.
 *
 * Split into a read side and a scope side because the halves differ in what can
 * implement them. Reading fields is something a plain object can do; propagating
 * them across an `await` is something only `AsyncLocalStorage` can do. A single
 * interface would oblige every consumer to implement async propagation it may not
 * have, which is the tie this exists to cut.
 */

export interface RunWithContextOptions {
  /**
   * Inherit the enclosing scope's fields. Default `true`.
   */
  inherit?: boolean;
}

/** The read side. The only half `Logger` depends on. */
export interface ContextReader {
  getContext(): AsyncContext;
  /**
   * The live fields, without copying, or `undefined` outside any scope.
   *
   * Optional, and the logger prefers it when present: it reads the context once
   * per entry and only spreads it in, so a copy on the way is thrown away.
   *
   * **{@link ContextStore} deliberately does not implement it.** That class is
   * public and subclassable, and a subclass overriding `getContext` to add or
   * redact a field would be silently bypassed if the logger read an inherited
   * `peekContext` instead. Implement this on a reader of your own, where no such
   * override can exist.
   */
  peekContext?(): AsyncContext | undefined;
}

/** The scope side: what a request pipeline needs, and what `ContextStore` is. */
export interface ContextScope extends ContextReader {
  updateContext(fields: Partial<AsyncContext>): void;
  runWithContext<T>(
    context: AsyncContext,
    callback: () => T,
    options?: RunWithContextOptions,
  ): T;
}

/**
 * Everything `Logger`'s second parameter accepts.
 *
 * A `ContextReader` is the ordinary case. A zero-argument function suits a host
 * that already has its own per-request lookup. A plain object suits a logger built
 * per request, and is read live, so fields added to it after construction appear.
 */
export type ContextSource =
  | ContextReader
  | (() => AsyncContext | undefined)
  | AsyncContext;

const EMPTY: AsyncContext = Object.freeze({});

const hasGetContext = (source: ContextSource): source is ContextReader =>
  typeof (source as ContextReader).getContext === 'function';

/**
 * Normalizes a source once, in the constructor, so the union costs nothing per
 * entry.
 */
export const asReader = (source: ContextSource): ContextReader => {
  if (typeof source === 'function') {
    return { getContext: () => source() ?? {}, peekContext: source };
  }
  if (hasGetContext(source)) return source;

  const fields = source;
  return { getContext: () => ({ ...fields }), peekContext: () => fields };
};

/**
 * One read per entry, without a copy where the reader offers one.
 *
 * `Logger` used to call `getContext()` twice for every line - once to check
 * `filterEvents` and once to build the entry - and each call allocated a shallow
 * copy that was spread into the entry and discarded.
 */
export const readContextOnce = (
  reader: ContextReader | undefined,
): AsyncContext => {
  if (!reader) return EMPTY;
  return reader.peekContext
    ? (reader.peekContext() ?? EMPTY)
    : reader.getContext();
};
