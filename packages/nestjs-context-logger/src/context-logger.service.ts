import { Logger, type LogLevel } from '@arkv/logger';
import type { LoggerService } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { ContextService } from './context.service.js';
import {
  LOGGER_MODULE_OPTIONS,
  type LoggerModuleConfig,
} from './types.js';

/**
 * Injectable NestJS structured logger service.
 *
 * Wraps @arkv/logger's Logger class and implements
 * NestJS's LoggerService interface, making it a
 * drop-in replacement for the built-in NestJS logger.
 *
 * Features (all inherited from @arkv/logger):
 * - 6 log levels: verbose, debug, log, warn, error, fatal
 * - Async context propagation via ContextService
 * - Sensitive field masking (password, token, etc.)
 * - Recursive sanitization with 15+ type handlers
 * - Colored JSON output in development mode
 * - Plain JSON output in production mode
 * - Event filtering (e.g. health checks)
 * - Array truncation via maxArrayLength
 * - appId auto-computed from name + version + env
 *
 * @example Inject and use in a service:
 * ```ts
 * @Injectable()
 * export class AppService {
 *   constructor(
 *     private readonly logger: ContextLogger,
 *   ) {}
 *
 *   doWork() {
 *     this.logger.log('Starting work');
 *     this.logger.log({ action: 'work', items: 3 });
 *     this.logger.error(new Error('Oops'));
 *     this.logger.warn('Slow query', { duration: 1200 });
 *   }
 * }
 * ```
 *
 * @example Replace NestJS built-in logger:
 * ```ts
 * const app = await NestFactory.create(AppModule, {
 *   bufferLogs: true,
 * });
 * app.useLogger(app.get(ContextLogger));
 * ```
 */
@Injectable()
export class ContextLogger implements LoggerService {
  readonly #logger: Logger;

  constructor(
    @Inject(LOGGER_MODULE_OPTIONS)
    config: LoggerModuleConfig,
    private readonly contextService: ContextService,
  ) {
    const { isGlobal: _ig, ...loggerConfig } = config;
    this.#logger = new Logger(loggerConfig, contextService);
  }

  /**
   * The minimum log level configured for this logger.
   * Messages below this level are silently dropped.
   */
  get logLevel(): LogLevel {
    return this.#logger.logLevel;
  }

  /**
   * Set the current context name. This writes to the
   * async context store so the value appears in log
   * entries as the `context` field.
   *
   * Called automatically by NestJS when this logger
   * is used as the built-in application logger.
   */
  setContext(context: string): void {
    this.contextService.updateContext({ context });
  }

  /**
   * No-op for NestJS LoggerService interface compat.
   * Log level is configured at module registration time
   * via LoggerModuleConfig.level.
   */
  setLogLevels(_levels: LogLevel[]): void {
    // level is set at construction time via config
  }

  log(message: string, ...params: unknown[]): void;
  log(message: Record<string, unknown>): void;
  log(message: Error): void;
  log(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.log(message as string, ...params);
  }

  error(message: string, ...params: unknown[]): void;
  error(message: Record<string, unknown>): void;
  error(message: Error): void;
  error(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.error(message as string, ...params);
  }

  warn(message: string, ...params: unknown[]): void;
  warn(message: Record<string, unknown>): void;
  warn(message: Error): void;
  warn(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.warn(message as string, ...params);
  }

  debug(message: string, ...params: unknown[]): void;
  debug(message: Record<string, unknown>): void;
  debug(message: Error): void;
  debug(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.debug(message as string, ...params);
  }

  verbose(message: string, ...params: unknown[]): void;
  verbose(message: Record<string, unknown>): void;
  verbose(message: Error): void;
  verbose(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.verbose(message as string, ...params);
  }

  fatal(message: string, ...params: unknown[]): void;
  fatal(message: Record<string, unknown>): void;
  fatal(message: Error): void;
  fatal(
    message: string | Record<string, unknown> | Error,
    ...params: unknown[]
  ): void {
    this.#logger.fatal(message as string, ...params);
  }
}
