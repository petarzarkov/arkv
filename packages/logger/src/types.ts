/**
 * Frozen object rather than a TS `enum`: the values are what land in a log
 * entry's `level` field and are the only thing consumers may rely on. The
 * companion type below makes `LogLevel` usable in both value and type position,
 * so `LogLevel.ERROR` and `level: LogLevel` both keep working.
 */
export const LogLevel = Object.freeze({
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  LOG: 'log',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const);

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LOG_LEVELS: LogLevel[] = [
  LogLevel.VERBOSE,
  LogLevel.DEBUG,
  LogLevel.LOG,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.FATAL,
];

export interface AsyncContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  method?: string;
  event?: string;
  context?: string;
  flow?: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  name?: string;
  version?: string;
  env?: string;
  level?: LogLevel;
  /** Defaults to `process.env.NODE_ENV !== 'production'` */
  isDevelopment?: boolean;
  /** Merged with DEFAULT_MASK_FIELDS */
  maskFields?: string[];
  /** Events to skip logging for */
  filterEvents?: string[];
  /** Truncate arrays beyond this length */
  maxArrayLength?: number;
  /**
   * Stop descending past this nesting depth. A cycle is caught by reference, but
   * a long acyclic chain would still exhaust the stack inside a log call.
   */
  maxDepth?: number;
}

export type LogEntry = Record<string, unknown> & {
  error?: Error;
};

export const DEFAULT_MASK_FIELDS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apiKey',
  'apiSecret',
  'apiPass',
];
