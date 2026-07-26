# @arkv/logger

Framework-agnostic structured logger with async context, sanitization, and colored output.

## Install

```bash
bun add @arkv/logger
# or
npm install @arkv/logger
```

## Usage

### Basic Logging

```typescript
import { Logger } from '@arkv/logger';

const logger = new Logger({
  name: 'my-app',
  version: '1.0.0',
  env: 'production',
});

logger.log('Server started');
logger.debug('Loading config', { path: '/etc/app' });
logger.warn('Disk usage high', { usage: 92 });
logger.error('Request failed', new Error('timeout'));
```

### Log Levels

Six levels in ascending severity:

```typescript
import { Logger, LogLevel } from '@arkv/logger';

const logger = new Logger({ level: LogLevel.WARN });

logger.debug('skipped');  // below WARN, not logged
logger.warn('logged');    // WARN and above are logged
logger.error('logged');
logger.fatal('logged');
```

| Level | Value |
|-------|-------|
| `LogLevel.VERBOSE` | `'verbose'` |
| `LogLevel.DEBUG` | `'debug'` |
| `LogLevel.LOG` | `'log'` |
| `LogLevel.WARN` | `'warn'` |
| `LogLevel.ERROR` | `'error'` |
| `LogLevel.FATAL` | `'fatal'` |

### Async Context

Track request-scoped data across async boundaries using `ContextStore` (backed by `AsyncLocalStorage`):

```typescript
import { Logger, ContextStore } from '@arkv/logger';

const context = new ContextStore();
const logger = new Logger({ name: 'api' }, context);

function handleRequest(req) {
  context.runWithContext(
    { requestId: req.id, userId: req.user },
    () => {
      // requestId and userId are automatically
      // included in every log entry
      logger.log('Processing request');
      doWork();
    },
  );
}
```

### Sensitive Field Masking

Fields matching known sensitive names are automatically replaced with `[MASKED]`:

```typescript
logger.log('User login', {
  username: 'alice',
  password: 'secret',    // → [MASKED]
  token: 'jwt-abc',      // → [MASKED]
  apiKey: 'key-123',     // → [MASKED]
});
```

Default masked fields: `password`, `secret`, `token`, `authorization`, `cookie`, `apiKey`, `apiSecret`, `apiPass`. Add custom fields via config:

```typescript
const logger = new Logger({
  maskFields: ['ssn', 'creditCard'],
});
```

### Error Handling

Errors are automatically extracted and serialized from multiple patterns:

```typescript
// Direct Error object
logger.error('Failed', new Error('timeout'));

// Error as message
logger.error(new Error('crash'));

// Wrapped in object
logger.error('Op failed', { err: new Error('db') });
logger.error('Op failed', { error: new Error('db') });

// String shorthand at error/warn/fatal level
logger.error('Op failed', { error: 'connection refused' });

// Deeply nested errors are found automatically
logger.error('Op failed', {
  metadata: { nested: { err: new Error('deep') } },
});
```

### Development vs Production Output

In development (`NODE_ENV !== 'production'`), output is colored JSON for readability. In production, output is plain JSON for log aggregators:

```typescript
// Colored dev output (default)
const dev = new Logger({ isDevelopment: true });

// Plain JSON for production
const prod = new Logger({ isDevelopment: false });
```

### Event Filtering

Suppress logs for specific events (e.g. health checks):

```typescript
const logger = new Logger(
  { filterEvents: ['/health', '/ready'] },
  contextStore,
);
```

When the context's `event` field matches a filtered event, the log is silently dropped.

## API

### `Logger`

```typescript
new Logger(config?: LoggerConfig, context?: ContextStore)
```

| Property | Type | Description |
|----------|------|-------------|
| `logLevel` | `LogLevel` | Current log level (read-only) |
| `appId` | `string \| undefined` | `name-version-env` or `undefined` |

| Method | Description |
|--------|-------------|
| `log(message, ...params)` | Log at `log` level |
| `debug(message, ...params)` | Log at `debug` level |
| `verbose(message, ...params)` | Log at `verbose` level |
| `warn(message, ...params)` | Log at `warn` level |
| `error(message, ...params)` | Log at `error` level |
| `fatal(message, ...params)` | Log at `fatal` level |

Each method accepts `string`, `Record<string, unknown>`, or `Error` as the message, plus optional extra params.

### `LoggerConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | — | Application name |
| `version` | `string` | — | Application version |
| `env` | `string` | — | Environment name |
| `level` | `LogLevel` | `DEBUG` | Minimum log level |
| `isDevelopment` | `boolean` | `NODE_ENV !== 'production'` | Colored vs plain JSON output |
| `maskFields` | `string[]` | `[]` | Additional fields to mask (merged with defaults) |
| `filterEvents` | `string[]` | `[]` | Context events to suppress |
| `maxArrayLength` | `number` | `100` | Max array items before truncation |

### `ContextStore`

```typescript
new ContextStore()
```

| Method | Description |
|--------|-------------|
| `getContext()` | Get current async context |
| `updateContext(partial)` | Merge partial update into current context |
| `runWithContext(ctx, callback)` | Execute callback within a context |

## License

[MIT](../../LICENSE)
