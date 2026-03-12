import type { LoggerConfig } from '@arkv/logger';
import type { ModuleMetadata, Type } from '@nestjs/common';

export const LOGGER_MODULE_OPTIONS: unique symbol = Symbol(
  'LOGGER_MODULE_OPTIONS',
);

/**
 * Configuration for NestJsContextLoggerModule.
 * All fields are optional — sensible defaults apply.
 *
 * Extends LoggerConfig from @arkv/logger:
 * - name: app name (used in appId field of log entries)
 * - version: app version
 * - env: environment label (e.g. 'production')
 * - level: minimum log level (default: 'debug')
 * - isDevelopment: colored output when true (default: NODE_ENV !== 'production')
 * - maskFields: additional fields to mask beyond defaults
 * - filterEvents: event names to suppress from logs
 * - maxArrayLength: max array items before truncation (default: 100)
 */
export interface LoggerModuleConfig extends LoggerConfig {
  /**
   * Register the module as a NestJS global module.
   * When true, ContextLogger and ContextService are
   * available everywhere without re-importing the module.
   * @default true
   */
  isGlobal?: boolean;
}

/**
 * Factory interface for use with useClass / useExisting
 * in forRootAsync.
 */
export interface LoggerModuleOptionsFactory {
  createLoggerOptions():
    | Promise<LoggerModuleConfig>
    | LoggerModuleConfig;
}

/**
 * Async options for NestJsContextLoggerModule.forRootAsync.
 * Supports useFactory, useClass, and useExisting patterns.
 */
export interface LoggerModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Register as a global module.
   * @default true
   */
  isGlobal?: boolean;

  /**
   * Factory function to produce LoggerModuleConfig.
   * Inject dependencies via the inject array.
   */
  useFactory?: (
    // biome-ignore lint/suspicious/noExplicitAny: allow any args for factory function
    ...args: any[]
  ) => Promise<LoggerModuleConfig> | LoggerModuleConfig;

  /**
   * Tokens to inject into the useFactory function.
   */
  // biome-ignore lint/suspicious/noExplicitAny: injection tokens can be any provider token
  inject?: any[];

  /**
   * Class that implements LoggerModuleOptionsFactory.
   * A new instance will be created by the injector.
   */
  useClass?: Type<LoggerModuleOptionsFactory>;

  /**
   * Existing provider that implements
   * LoggerModuleOptionsFactory.
   */
  useExisting?: Type<LoggerModuleOptionsFactory>;
}
