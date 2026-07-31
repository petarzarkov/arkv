# @arkv/nestjs-context-logger

NestJS module for structured, async-context-aware logging powered by [`@arkv/logger`](../logger).

Provides drop-in replacements for the NestJS built-in logger with:

- **6 log levels**: `verbose`, `debug`, `info`, `warn`, `error`, `fatal`
- **Async request context** — `requestId`, `userId`, `flow`, and custom fields automatically appear in every log entry within an async scope
- **Sensitive field masking** — passwords, tokens, API keys redacted by default
- **Recursive sanitization** — handles `Error`, `Date`, `BigInt`, `Symbol`, `FormData`, `File`, `Blob`, `ArrayBuffer`, circular references, and more
- **Colored JSON** in development, **plain JSON** in production
- **Event filtering** — suppress noisy health-check routes
- **Array truncation** — configurable `maxArrayLength`
- **`forRoot` / `forRootAsync`** — all options optional with sensible defaults

---

## Installation

```sh
bun add @arkv/nestjs-context-logger
# or
npm install @arkv/nestjs-context-logger
```

Peer dependencies (install separately if not already present):

```sh
bun add @nestjs/common @nestjs/core reflect-metadata
```

---

## Quick Start

Register the module once at the application root. All configuration is optional.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { NestJsContextLoggerModule } from '@arkv/nestjs-context-logger';

@Module({
  imports: [
    NestJsContextLoggerModule.forRoot(),
  ],
})
export class AppModule {}
```

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ContextLogger } from '@arkv/nestjs-context-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  // Replace NestJS built-in logger
  app.useLogger(app.get(ContextLogger));
  await app.listen(3000);
}
bootstrap();
```

---

## Configuration

All options are optional. Pass any subset to `forRoot()`.

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | App name. Combined with `version` + `env` to form the `appId` log field. |
| `version` | `string` | — | App version (e.g. `'1.2.3'`). |
| `env` | `string` | — | Environment label (e.g. `'production'`). |
| `level` | `LogLevel` | `'debug'` | Minimum level to emit. Messages below this level are dropped. |
| `isDevelopment` | `boolean` | `NODE_ENV !== 'production'` | Colored JSON output when `true`, plain JSON when `false`. |
| `maskFields` | `string[]` | `[]` | Additional field names to mask. Merged with the built-in defaults. |
| `filterEvents` | `string[]` | `[]` | Context `event` values to suppress (e.g. `['/health']`). |
| `transports` | `Transport[]` | one console transport | Replaces the default; see File output above |
| `bindings` | `Record<string, unknown>` | — | Static fields merged into every entry |
| `maxArrayLength` | `number` | `100` | Arrays longer than this are truncated with a `[TRUNCATED: N more items]` entry. |
| `isGlobal` | `boolean` | `true` | Register as a NestJS global module. |

### Example with explicit config

```ts
import { LogLevel } from '@arkv/nestjs-context-logger';

NestJsContextLoggerModule.forRoot({
  name: 'my-api',
  version: '2.0.0',
  env: 'production',
  level: LogLevel.WARN,
  isDevelopment: false,
  maskFields: ['ssn', 'creditCard'],
  filterEvents: ['/health', '/metrics', '/ready'],
  maxArrayLength: 10,
  isGlobal: true,
})
```

---

## forRootAsync

Use `forRootAsync` when config values come from an async source such as NestJS `ConfigService`, a database, or secrets manager.

### With `useFactory`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  NestJsContextLoggerModule,
  LogLevel,
} from '@arkv/nestjs-context-logger';

@Module({
  imports: [
    ConfigModule.forRoot(),
    NestJsContextLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        name: cfg.get<string>('APP_NAME'),
        version: cfg.get<string>('APP_VERSION'),
        env: cfg.get<string>('NODE_ENV'),
        level:
          cfg.get<LogLevel>('LOG_LEVEL')
          ?? LogLevel.DEBUG,
        maskFields: cfg
          .get<string>('LOG_MASK_FIELDS', '')
          .split(',')
          .filter(Boolean),
        filterEvents: ['/health'],
        maxArrayLength: 20,
      }),
    }),
  ],
})
export class AppModule {}
```

### With `useClass`

```ts
import { Injectable } from '@nestjs/common';
import type {
  LoggerModuleConfig,
  LoggerModuleOptionsFactory,
} from '@arkv/nestjs-context-logger';

@Injectable()
export class LoggerConfigFactory
  implements LoggerModuleOptionsFactory
{
  createLoggerOptions(): LoggerModuleConfig {
    return {
      name: process.env.APP_NAME,
      env: process.env.NODE_ENV,
      level: LogLevel.DEBUG,
    };
  }
}

// In your module:
NestJsContextLoggerModule.forRootAsync({
  useClass: LoggerConfigFactory,
})
```

### With `useExisting`

```ts
NestJsContextLoggerModule.forRootAsync({
  imports: [SharedModule],
  useExisting: LoggerConfigFactory,
})
```

---

## Request Context Middleware

Wire `ContextService.runWithContext` in a NestJS middleware to attach request-scoped data. Every log call within the same async scope automatically includes this data.

```ts
// context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ContextService } from '@arkv/nestjs-context-logger';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  constructor(
    private readonly ctx: ContextService,
  ) {}

  use(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    this.ctx.runWithContext(
      {
        requestId:
          (req.headers['x-request-id'] as string)
          ?? crypto.randomUUID(),
        userId: req.user?.id,
        event: req.path,
        method: req.method,
        flow: 'http',
      },
      next,
    );
  }
}
```

Register it in your module:

```ts
// app.module.ts
import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ContextMiddleware } from './context.middleware';

@Module({
  imports: [NestJsContextLoggerModule.forRoot()],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
```

Every log entry produced within a request will now include `requestId`, `userId`, `event`, `method`, and `flow` fields automatically.

---

## Injecting the Logger

Inject `ContextLogger` anywhere in your application:

```ts
import { Injectable } from '@nestjs/common';
import { ContextLogger } from '@arkv/nestjs-context-logger';

@Injectable()
export class UserService {
  constructor(
    private readonly logger: ContextLogger,
  ) {}

  async findUser(id: string) {
    // String message
    this.logger.info('Finding user');

    // Object — logged as structured data
    this.logger.debug({ action: 'db.query', table: 'users', id });

    try {
      const user = await db.findById(id);

      this.logger.info('User found', { userId: user.id });

      return user;
    } catch (err) {
      // Error instance — stack trace included
      this.logger.error(err instanceof Error
        ? err
        : new Error('Unknown error'));
    }
  }
}
```

### `info` and the deprecated `log`

The primary method is **`info`**. `log` remains as a deprecated alias that
delegates to it — it cannot be removed, because NestJS's `LoggerService`
interface mandates a `log` method and the framework calls it directly when this
logger is installed via `app.useLogger()`. Existing `logger.log(...)` call sites
keep working unchanged.

Both emit **`level: 'info'`**. `@arkv/logger` does not use NestJS's `'log'`
level name at all: the constant is `LogLevel.INFO` and there is no
`LogLevel.LOG`. `log()` is only a method name kept for interface compatibility.

```ts
this.logger.info('Finding user');   // preferred
this.logger.log('Finding user');    // still works, marked @deprecated
```

### All method signatures

Every log method accepts three call patterns, each with optional extra params:

```ts
// 1. String message (with optional extra params)
logger.info('message');
logger.info('message', { extra: 'data' });
logger.info('message', new Error('reason'));
logger.info('message', { err: new Error('reason'), extra: 1 });

// 2. Plain object (logged with key 'Object logged')
logger.info({ action: 'create', resource: 'user' });
logger.info({ action: 'create' }, { durationMs: 12 });

// 3. Error instance — extra fields are allowed alongside it
logger.error(new Error('Something failed'));
logger.warn(new Error('Retrying'), { attempt: 3 });

// Same patterns apply to:
// logger.verbose(), logger.debug(), logger.warn(),
// logger.error(), logger.fatal()
```

### Flushing and shutdown

`ContextLogger` implements `OnApplicationShutdown` and flushes its transports
there. It flushes rather than closes, because NestJS keeps logging after the
shutdown hooks run and a closed transport would drop those last lines; the file
transport's own `process.on('exit')` hook takes the final flush.

`flush()` and `close()` are also available directly. Both are synchronous.

### File output

`@arkv/logger`'s transports are configured straight through the module options:

```ts
import { FileTransport } from '@arkv/logger';

NestJsContextLoggerModule.forRoot({
  name: 'my-api',
  transports: [
    new FileTransport({
      path: '/var/log/my-api/app.log',
      maxSize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});
```

Supplying `transports` replaces the default console transport, so the example
above writes to the file only. See the
[`@arkv/logger` README](../logger/README.md#transports) for rotation, buffering,
flush-on-exit and backpressure.

### Error handling patterns

```ts
// Direct Error — message + stack extracted
logger.error(new Error('DB connection lost'));

// Nested { error: Error } — error extracted, rest merged
logger.warn('Retry failed', {
  error: new Error('timeout'),
  attempt: 3,
  maxRetries: 5,
});

// Nested { err: Error } — same behavior
logger.error('Handler threw', {
  err: new Error('validation error'),
  input: payload,
});

// String on error-level methods — wrapped in Error
logger.error('message', 'Something went wrong');
logger.warn('Degraded mode', 'circuit open');

// Object with nested Error anywhere — auto-detected
logger.error({
  upstream: { response: { cause: new Error('503') } },
});
```

---

## NestJS Built-in Logger Replacement

Pass `ContextLogger` to `app.useLogger()` to capture all NestJS framework logs (bootstrapping, route registration, etc.):

```ts
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ContextLogger } from '@arkv/nestjs-context-logger';

async function bootstrap() {
  // bufferLogs: true holds logs until useLogger() is called
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(ContextLogger));
  await app.listen(3000);
}
bootstrap();
```

---

## Log Levels

Levels are ordered from lowest to highest severity. Only messages at or above the configured `level` are emitted.

| Level | Value | Use Case |
|---|---|---|
| `verbose` | lowest | Fine-grained diagnostic traces |
| `debug` | | Development debugging |
| `info` | | General operational events. NestJS calls this level `log` |
| `warn` | | Unexpected but recoverable situations |
| `error` | | Failures that need attention |
| `fatal` | highest | Application cannot continue |

```ts
import { LogLevel } from '@arkv/nestjs-context-logger';

NestJsContextLoggerModule.forRoot({
  level: LogLevel.WARN, // emits warn, error, fatal only
})
```

---

## Sensitive Field Masking

The following fields are masked by default (case-insensitive substring match):

```
password  secret  token  authorization  cookie
apiKey    apiSecret  apiPass
```

Masked fields appear as `[MASKED]` in output. Masking is applied recursively throughout nested objects and arrays.

### Add custom mask fields

```ts
NestJsContextLoggerModule.forRoot({
  maskFields: ['ssn', 'creditCard', 'cvv'],
})
```

Custom fields are **merged** with the defaults — existing defaults are never removed.

---

## Event Filtering

Use `filterEvents` to silence specific routes (e.g. health checks) from the log output. The filter matches against the `event` field in the async context, which is typically the request path set by your middleware.

```ts
NestJsContextLoggerModule.forRoot({
  filterEvents: [
    '/health',
    '/metrics',
    '/api/service/up',
    '/ready',
  ],
})
```

Requests to these paths will produce no log output regardless of log level.

---

## Development vs Production Output

### Development (colored JSON)

```
{"level": "info","timestamp": "2026-03-08T10:00:00.000Z","pid": 12345,"message": "User found","appId": "my-api-1.0.0-local","requestId": "abc-123","userId": "u_456","event": "/api/users/u_456","method": "GET","flow": "http"}
```
Fields are colored by type: level in green-on-black, errors in red, timestamps in magenta, request IDs in bright green, etc.

### Production (plain JSON)

```json
{"level":"info","timestamp":"2026-03-08T10:00:00.000Z","pid":12345,"message":"User found","appId":"my-api-1.0.0-production","requestId":"abc-123","userId":"u_456","event":"/api/users/u_456","method":"GET","flow":"http"}
```

`isDevelopment` is automatically `false` when `NODE_ENV=production`. Override explicitly if needed:

```ts
NestJsContextLoggerModule.forRoot({
  isDevelopment: process.env.NODE_ENV !== 'production',
})
```

---

## Log Entry Fields

Every log entry includes these core fields:

| Field | Source | Description |
|---|---|---|
| `level` | log call | Log level string |
| `timestamp` | auto | ISO 8601 UTC timestamp |
| `pid` | auto | Process ID |
| `message` | log call | Primary message string |
| `appId` | config | `${name}-${version}-${env}` (only when all three are set) |
| `requestId` | context | From `ContextService.runWithContext` |
| `userId` | context | From `ContextService.runWithContext` |
| `orgId` | context | From `ContextService.runWithContext` |
| `event` | context | Request path / event name |
| `method` | context | HTTP method or handler name |
| `flow` | context | Transport type (`http`, `rpc`, `ws`, etc.) |
| `context` | context | Module/class name (set via `setContext`) |
| `error` | log call | Serialized error with `name`, `message`, `stack` |

Additional fields from `extra` params are spread directly into the entry, except
that `level`, `timestamp`, `pid`, `message`, `appId` and `error` are reserved:
the entry's own value wins and the caller's is preserved under
`reservedFieldConflicts` rather than silently overwriting it.

`null` values are kept (they mean "empty"); `undefined` values are dropped
(JSON has no representation for them).

---

## AsyncContext Reference

The shape of the async context stored and propagated by `ContextService`:

```ts
interface AsyncContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  method?: string;
  event?: string;
  context?: string;
  flow?: string;
  [key: string]: unknown; // any custom fields
}
```

Update the context from within an async scope:

```ts
this.contextService.updateContext({ userId: user.id });
```

---

## API Reference

### `NestJsContextLoggerModule`

| Method | Description |
|---|---|
| `.forRoot(config?)` | Register with static config (all optional) |
| `.forRootAsync(options)` | Register with async config |

### `ContextLogger`

Implements NestJS `LoggerService`.

| Member | Type | Description |
|---|---|---|
| `logLevel` | `LogLevel` (getter) | Current configured log level |
| `setContext(name)` | `void` | Write `context` to async store |
| `setLogLevels(levels)` | `void` | No-op (compat shim; takes NestJS's own level names) |
| `info(...)` | `void` | Log at `info` level |
| `log(...)` | `void` | **Deprecated** alias for `info`; required by `LoggerService` |
| `debug(...)` | `void` | Log at `debug` level |
| `verbose(...)` | `void` | Log at `verbose` level |
| `warn(...)` | `void` | Log at `warn` level |
| `error(...)` | `void` | Log at `error` level |
| `fatal(...)` | `void` | Log at `fatal` level |
| `flush()` | `void` | Push every transport's buffer |
| `close()` | `void` | Flush, then release transport resources |
| `onApplicationShutdown()` | `void` | NestJS hook; flushes |

### `ContextService`

Extends `ContextStore` from `@arkv/logger`.

| Method | Description |
|---|---|
| `getContext()` | Return a copy of the current async context |
| `updateContext(partial)` | Merge fields into the current async context |
| `runWithContext(ctx, fn, opts?)` | Run `fn` within a new async context scope |

Nested `runWithContext` calls **merge**: an inner scope inherits the outer's
fields and overrides only the keys it names, so a job started inside a request
keeps that request's `requestId`. Pass `{ inherit: false }` for a detached scope.

`ContextService` is a NestJS provider, so within one application there is one
instance and one store. The underlying `ContextStore` is per-instance, not
per-process — two NestJS applications in the same process each get their own.

### `LOGGER_MODULE_OPTIONS`

Symbol DI token used to inject the config. Useful if you need to read the resolved config elsewhere:

```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  LOGGER_MODULE_OPTIONS,
  type LoggerModuleConfig,
} from '@arkv/nestjs-context-logger';

@Injectable()
export class MyService {
  constructor(
    @Inject(LOGGER_MODULE_OPTIONS)
    private readonly config: LoggerModuleConfig,
  ) {}
}
```

---

## License

MIT — see [LICENSE](../../LICENSE)
