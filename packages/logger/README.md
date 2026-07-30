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

`LogLevel` is a frozen object plus a union of its values, so it works in both
value and type position and the bare strings are accepted too:

```typescript
const a: LogLevel = LogLevel.WARN;
const b: LogLevel = 'warn';       // also valid
```

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

A **plain object** param is merged into the entry as extra fields. Anything else
object-shaped — an array, `Map`, `Set`, `Date`, typed array or class instance —
cannot be merged without losing its contents, so it is collected under a `params`
array instead and rendered by the sanitizer:

```typescript
logger.log('Cache state', { hits: 1 });        // → { hits: 1 }
logger.log('Cache state', new Map([['a', 1]])); // → { params: [{ '[Map]': [['a', 1]] }] }
```

A message that is not a `string`, an `Error` or a plain object is reported with
an `invalidMessageWarning`, and the value itself is kept under
`originalMessage`.

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
| `maxDepth` | `number` | `32` | Max nesting depth before truncation |

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
