export enum LogLevel {
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  LOG = 'log',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

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
