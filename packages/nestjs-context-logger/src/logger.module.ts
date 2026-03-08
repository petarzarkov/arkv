import {
  type DynamicModule,
  Module,
  type Provider,
} from '@nestjs/common';
import { ContextService } from './context.service.js';
import { ContextLogger } from './context-logger.service.js';
import {
  LOGGER_MODULE_OPTIONS,
  type LoggerModuleAsyncOptions,
  type LoggerModuleConfig,
  type LoggerModuleOptionsFactory,
} from './types.js';

const CORE_PROVIDERS: Provider[] = [
  ContextService,
  ContextLogger,
];

const CORE_EXPORTS = [ContextService, ContextLogger];

function buildAsyncProvider(
  options: LoggerModuleAsyncOptions,
): Provider {
  if (options.useFactory) {
    return {
      provide: LOGGER_MODULE_OPTIONS,
      useFactory: options.useFactory,
      inject: (options.inject ?? []) as never[],
    };
  }

  if (options.useClass) {
    return {
      provide: LOGGER_MODULE_OPTIONS,
      useFactory: async (
        factory: LoggerModuleOptionsFactory,
      ) => factory.createLoggerOptions(),
      inject: [options.useClass],
    };
  }

  if (options.useExisting) {
    return {
      provide: LOGGER_MODULE_OPTIONS,
      useFactory: async (
        factory: LoggerModuleOptionsFactory,
      ) => factory.createLoggerOptions(),
      inject: [options.useExisting],
    };
  }

  return {
    provide: LOGGER_MODULE_OPTIONS,
    useValue: {},
  };
}

/**
 * NestJS module that provides structured async-context
 * logging via @arkv/logger.
 *
 * Register once at the application root. By default
 * the module is global, making ContextLogger and
 * ContextService available in every module without
 * re-importing.
 *
 * @example Zero-config (all defaults):
 * ```ts
 * @Module({
 *   imports: [NestJsContextLoggerModule.forRoot()],
 * })
 * export class AppModule {}
 * ```
 *
 * @example With explicit config:
 * ```ts
 * NestJsContextLoggerModule.forRoot({
 *   name: 'my-api',
 *   version: '1.0.0',
 *   env: 'production',
 *   level: LogLevel.WARN,
 *   isDevelopment: false,
 *   maskFields: ['ssn', 'creditCard'],
 *   filterEvents: ['/health', '/metrics'],
 *   maxArrayLength: 10,
 * })
 * ```
 *
 * @example Async with ConfigService:
 * ```ts
 * NestJsContextLoggerModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: (cfg: ConfigService) => ({
 *     name: cfg.get('APP_NAME'),
 *     version: cfg.get('APP_VERSION'),
 *     env: cfg.get('NODE_ENV'),
 *     level: cfg.get('LOG_LEVEL'),
 *   }),
 * })
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic module pattern requires a class
export class NestJsContextLoggerModule {
  /**
   * Register the logger module with static config.
   * All options are optional.
   */
  static forRoot(
    config: LoggerModuleConfig = {},
  ): DynamicModule {
    const { isGlobal = true, ...loggerConfig } = config;

    return {
      global: isGlobal,
      module: NestJsContextLoggerModule,
      providers: [
        {
          provide: LOGGER_MODULE_OPTIONS,
          useValue: loggerConfig,
        },
        ...CORE_PROVIDERS,
      ],
      exports: CORE_EXPORTS,
    };
  }

  /**
   * Register the logger module with async config.
   * Supports useFactory, useClass, and useExisting.
   */
  static forRootAsync(
    options: LoggerModuleAsyncOptions,
  ): DynamicModule {
    const { isGlobal = true, ...asyncOptions } = options;

    const classProvider: Provider[] = asyncOptions.useClass
      ? [asyncOptions.useClass]
      : [];

    return {
      global: isGlobal,
      module: NestJsContextLoggerModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        buildAsyncProvider(asyncOptions),
        ...classProvider,
        ...CORE_PROVIDERS,
      ],
      exports: CORE_EXPORTS,
    };
  }
}
