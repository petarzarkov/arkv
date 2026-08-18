export { ContextStore, type RunWithContextOptions } from './context.js';
// The contract the logger reads its request fields through, so a consumer can
// satisfy it without owning an `AsyncLocalStorage`. `asReader` and `readContextOnce`
// stay internal: they are how `Logger` normalizes its second argument, not something
// a consumer has a use for.
export type {
  ContextReader,
  ContextScope,
  ContextSource,
} from './context-contract.js';
export { RequestScopedContext } from './request-context.js';
export {
  type CaptureGlobalErrorsOptions,
  captureGlobalErrors,
} from './errors.js';
export {
  FileTransport,
  type FileTransportOptions,
  type RotationInterval,
} from './file.js';
export { jsonFormat, prettyFormat } from './format.js';
export { Logger } from './logger.js';
export { ConsoleTransport, type ConsoleTransportOptions } from './transport.js';
export {
  type AsyncContext,
  DEFAULT_MASK_FIELDS,
  LOG_LEVELS,
  type LogEntry,
  type LogFormatter,
  type LoggerConfig,
  LogLevel,
  RESERVED_CONFLICTS_KEY,
  RESERVED_ENTRY_KEYS,
  type Transport,
} from './types.js';

/**
 * The redaction pass the logger applies, exported so a consumer can apply it to
 * something the logger never sees - an error payload on its way to a different
 * sink, say.
 *
 * `dist/esm/sanitize.js` was already built and shipped, and neither re-exported
 * here nor reachable through the `exports` map, so it was a file no consumer could
 * import.
 */
export {
  DEFAULT_MAX_DEPTH,
  findNestedError,
  sanitizeLogEntry,
  type SanitizeOptions,
} from './sanitize.js';
