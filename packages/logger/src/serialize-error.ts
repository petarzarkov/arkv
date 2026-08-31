import type { LogEntry } from './types.js';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  errors?: unknown[];
  [key: string]: unknown;
}

/** How far a `cause` chain is followed before it is cut. */
export const MAX_CAUSE_DEPTH = 8;

/** How many branches of an `AggregateError` are kept. */
export const MAX_AGGREGATE_ERRORS = 10;

/**
 * Rendered by name, so they are not repeated by the own-property pass. `name`
 * lands here as an own property whenever a subclass declares it as a class field.
 */
const RENDERED = new Set(['name', 'message', 'stack', 'cause', 'errors']);

/**
 * No capture group: the replacement is a comma and never referenced it, so every
 * match was recording a capture nothing read, over a string that is routinely
 * kilobytes of frames. `\s*` matches what `(\s+)?` matched, greedy either way.
 */
const STACK_BREAK = /\n\s*/g;

const flattenStack = (stack: string | undefined): string | undefined =>
  stack?.replace(STACK_BREAK, ',');

/**
 * An error as a plain object, with the three things the entry used to drop.
 *
 * `cause` is standard since Node 16.9 and is the whole reason to wrap an error, so
 * losing it left a message with no origin. `AggregateError.errors` is the same loss
 * for `Promise.any` and for a batch that failed in several places at once. Own
 * enumerable properties are what a library attaches and what you filter on later:
 * `code: 'ECONNREFUSED'`, `statusCode`, `syscall`, `errno`.
 *
 * The three original fields are unchanged, comma-flattened stack included, so an
 * existing consumer parsing `error.stack` sees exactly what it saw before.
 *
 * Secrets are not a concern here: the whole entry goes through `sanitizeLogEntry`
 * afterwards, so a property named `token` on an error is masked like any other.
 */
export function serializeError(error: Error): SerializedError {
  return serialize(error, 0, undefined);
}

/**
 * `path` guards against a `cause` chain that loops back on itself, so it is only
 * consulted while descending. An error with no `cause` and no `errors` never
 * descends, which is almost every error logged, and was allocating a `WeakSet`,
 * adding itself and deleting itself again for a question nobody asked. The first
 * level that actually recurses creates it and passes it down.
 */
function serialize(
  error: Error,
  depth: number,
  path: WeakSet<object> | undefined,
): SerializedError {
  const out: SerializedError = { name: error.name, message: error.message };

  const stack = flattenStack(error.stack);
  if (stack !== undefined) {
    out.stack = stack;
  }

  for (const key of Object.keys(error)) {
    if (RENDERED.has(key)) {
      continue;
    }
    out[key] = (error as unknown as LogEntry)[key];
  }

  const { cause, errors } = error as { cause?: unknown; errors?: unknown };
  const hasBranches = Array.isArray(errors);
  if (cause !== undefined || hasBranches) {
    const seen = path ?? new WeakSet<object>();
    seen.add(error);
    if (cause !== undefined) {
      out.cause = describe(cause, depth, seen);
    }
    if (hasBranches) {
      out.errors = branches(errors, depth, seen);
    }
    // Deleted rather than left, so the same error reached twice down two
    // different branches is rendered twice: only a true cycle on the current
    // path is cut.
    seen.delete(error);
  }
  return out;
}

function branches(
  errors: readonly unknown[],
  depth: number,
  path: WeakSet<object>,
): unknown[] {
  const kept: unknown[] = errors
    .slice(0, MAX_AGGREGATE_ERRORS)
    .map((branch) => describe(branch, depth, path));
  if (errors.length > MAX_AGGREGATE_ERRORS) {
    kept.push(`[${errors.length - MAX_AGGREGATE_ERRORS} more]`);
  }
  return kept;
}

/**
 * A `cause` is whatever was passed: `new Error(msg, { cause: 'a string' })` is
 * legal and the string is the whole explanation, so a non-Error is kept as-is for
 * the sanitizer to render.
 */
function describe(
  value: unknown,
  depth: number,
  path: WeakSet<object>,
): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  if (path.has(value)) {
    return '[Circular]';
  }
  if (depth + 1 >= MAX_CAUSE_DEPTH) {
    return `[cause chain truncated after ${MAX_CAUSE_DEPTH}]`;
  }
  return serialize(value, depth + 1, path);
}
