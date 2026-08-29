export {
  BatchTransport,
  type BatchedEntry,
  type BatchTransportOptions,
} from './batch.js';
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
// `retryAfterMs` stays internal: it is how this transport reads one header, not
// something a consumer has a use for.
export {
  HttpDeliveryError,
  HttpTransport,
  type HttpTransportOptions,
} from './http.js';
export { Logger } from './logger.js';
export { SamplingTransport, type SamplingOptions } from './sampling.js';
export {
  MAX_AGGREGATE_ERRORS,
  MAX_CAUSE_DEPTH,
  type SerializedError,
  serializeError,
} from './serialize-error.js';
export { StreamTransport, type StreamTransportOptions } from './stream.js';
export { logfmtFormat, textFormat } from './text.js';
export {
  type SyslogProtocol,
  SyslogTransport,
  type SyslogTransportOptions,
} from './syslog.js';
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
  type TransportStats,
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
  type PreparedSanitizeOptions,
  prepareSanitizeOptions,
  sanitizeLogEntry,
  sanitizePrepared,
  type SanitizeOptions,
} from './sanitize.js';
