# @arkv/logger

Structured logger for **Node.js** with async context, sanitization, colored
output, and console + rotating file transports.

Framework-agnostic, but not runtime-agnostic: this package targets Node (>= 18)
and uses `node:fs` and `node:async_hooks`. It is **not** built for the browser.
ESM, CJS and types are all shipped, because Node's own dual module system needs
them.

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

logger.info('Server started');
logger.debug('Loading config', { path: '/etc/app' });
logger.warn('Disk usage high', { usage: 92 });
logger.error('Request failed', new Error('timeout'));
```

`log()` is a **deprecated alias for `info()`** and still works everywhere `info`
does. It cannot be removed: NestJS's `LoggerService` interface mandates a `log`
method. It is only a name — both emit `level: 'info'`.

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
| `LogLevel.INFO` | `'info'` |
| `LogLevel.WARN` | `'warn'` |
| `LogLevel.ERROR` | `'error'` |
| `LogLevel.FATAL` | `'fatal'` |

There is no `LogLevel.LOG` and nothing emits `'log'`. NestJS names this level
`log`; this package names it `info`, matching the method that emits it.

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
      logger.info('Processing request');
      doWork();
    },
  );
}
```

**The store is per-instance, not per-process.** Every `new ContextStore()` owns
its own `AsyncLocalStorage`, so two stores in one process hold two independent
contexts and a `Logger` only ever reads the store it was constructed with. Two
apps booted in the same process each get their own unless they are handed the
same instance — construct one and share it.

**Nested scopes merge.** The inner scope inherits the outer's fields and
overrides only the keys it names, so a job started inside a request keeps that
request's `requestId`. The merged context is a fresh object, so an
`updateContext` inside the inner scope does not leak back out.

```typescript
context.runWithContext({ requestId: 'r-1' }, () => {
  context.runWithContext({ flow: 'job' }, () => {
    // { requestId: 'r-1', flow: 'job' }
  });

  // Opt out for a genuinely detached scope:
  context.runWithContext({ flow: 'cron' }, work, { inherit: false });
});
```

### Sensitive Field Masking

Fields matching known sensitive names are automatically replaced with `[MASKED]`:

```typescript
logger.info('User login', {
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

### Reserved Fields

`level`, `timestamp`, `pid`, `message`, `appId` and `error` are written by the
logger. A caller field of the same name no longer replaces one — the entry's
value wins and the caller's is kept under `reservedFieldConflicts`, so nothing is
lost and the clash is visible to whatever reads the log:

```typescript
logger.debug('msg', { level: 'x' });
// → { level: 'debug', message: 'msg', …, reservedFieldConflicts: { level: 'x' } }
```

The same applies to fields arriving from the async context or from `bindings`.
`RESERVED_ENTRY_KEYS` and `RESERVED_CONFLICTS_KEY` are exported.

### `null` vs missing

`null` is preserved; `undefined` is dropped. `null` is a real JSON value and is
the difference between "this field was empty" and "this field was never logged".
`undefined` has no JSON representation — `JSON.stringify` erases the key anyway,
so keeping it would make the colored and plain renderings disagree.

```typescript
logger.info('user', { deletedAt: null, nickname: undefined });
// → { …, deletedAt: null }   // nickname is absent
```

### Child Loggers

```typescript
const dbLogger = logger.child({ component: 'db' });
dbLogger.info('query', { ms: 12 });
// → { …, component: 'db', ms: 12 }
```

A child shares the parent's transports and context store. Per-call fields and
async context both take precedence over bindings. Because the transports are
shared, `close()` on a child closes them for the parent too — close the root.

### Transports

Console today, file optionally, both with independent levels:

```typescript
import { ConsoleTransport, FileTransport, Logger, LogLevel } from '@arkv/logger';

const logger = new Logger({
  level: LogLevel.DEBUG,
  transports: [
    new ConsoleTransport({ level: LogLevel.DEBUG }),
    new FileTransport({
      path: '/var/log/app/app.log',
      level: LogLevel.WARN,
      maxSize: 10 * 1024 * 1024,
      maxFiles: 5,
      interval: 'daily',
    }),
  ],
});
```

Supplying `transports` **replaces** the default console transport, so

```typescript
new Logger({ transports: [new FileTransport({ path: '/var/log/app.log' })] });
```

is how stdout/stderr output is turned off. An empty array logs nowhere.

A transport is a three-method interface; implement it for anything else:

```typescript
interface Transport {
  readonly level?: LogLevel;
  write(entry: LogEntry, level: LogLevel): void;
  flush?(): void;
  close?(): void;
}
```

Each transport formats for itself, so the console can be colored while the file
stays plain JSON. `jsonFormat` and `prettyFormat` are exported.

#### Flushing, exit, and durability

Every transport method is **synchronous**, and `FileTransport` writes with
`fs.writeSync` on an append-mode fd. That is the whole design: `process.on('exit')`
cannot await, so a transport that flushes asynchronously cannot guarantee its
buffer reaches disk when the process ends.

- Default (`bufferBytes: 0`) writes through on every entry — nothing can be lost,
  at one syscall per line.
- `bufferBytes > 0` batches. The buffer is flushed the moment it reaches that
  size, plus every `flushIntervalMs` (default 1000, on an unref'd timer), plus
  from a `process.on('exit')` hook.
- `logger.flush()` and `logger.close()` are explicit and synchronous.

No signal handlers are installed. Registering a `SIGINT`/`SIGTERM` listener
suppresses the default termination, which is the caller's decision, not a
logger's — call `logger.close()` from your own shutdown hook.

#### Backpressure: blocks, does not drop

A synchronous batched write applies backpressure to the caller by blocking for
the duration of one `writeSync` of at most `bufferBytes`. There is no unbounded
in-memory queue to overflow, so under a slow disk the process slows down rather
than growing a backlog that would eventually take it out of memory.

Entries are discarded only when the write itself fails or an open failure
disabled the transport. Those are counted on `droppedCount` and announced in-band
on the next successful write:

```json
{"level":"warn","message":"file transport dropped 3 log entries","droppedEntries":3,"path":"/var/log/app.log"}
```

A failed payload is discarded rather than retained on purpose: holding a growing
backlog against a disk that is not accepting writes is how a logger takes down
the service it was meant to observe.

#### Transport failure is isolated

A transport that throws from `write`, `flush` or `close` never propagates into
the caller. `onTransportError` receives it; without that hook the first failure
per logger is reported on `console.error` and the rest are suppressed.

```typescript
new Logger({
  transports: [new FileTransport({ path: '/var/log/app.log' })],
  onTransportError: (error, transport) => metrics.increment('log.transport.error'),
});
```

### Uncaught Errors

```typescript
import { captureGlobalErrors } from '@arkv/logger';

const stop = captureGlobalErrors(logger);
```

Logs `uncaughtException` at fatal and `unhandledRejection` at error, flushes, and
then exits with code 1 — Node's own behaviour, which installing a listener
otherwise suppresses. Pass `{ exitOnUncaught: false }` if something else arranges
the shutdown. Returns a disposer.

### Testing

```typescript
import { MemoryTransport, parseLogEntry } from '@arkv/logger/testing';

const memory = new MemoryTransport();
const logger = new Logger({ transports: [memory] });

logger.info('hello', { orderId: 1 });
expect(memory.last?.orderId).toBe(1);
```

`MemoryTransport` collects sanitized entries as objects — no console spy, no
formatting to parse, no global to restore. `parseLogEntry` is there for the cases
where you do spy on `console.log`: it strips ANSI and parses, so it works against
the colored and plain renderings alike.

This is a **real subpath export**, unlike the old `src/test-utils.ts`, which was
excluded from `dist` precisely because it was an accidental leak rather than a
supported entry point.

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
| `transports` | `readonly Transport[]` | The configured transports |

| Method | Description |
|--------|-------------|
| `info(message, ...params)` | Log at `info` level |
| `log(message, ...params)` | **Deprecated** alias for `info` |
| `debug(message, ...params)` | Log at `debug` level |
| `verbose(message, ...params)` | Log at `verbose` level |
| `warn(message, ...params)` | Log at `warn` level |
| `error(message, ...params)` | Log at `error` level |
| `fatal(message, ...params)` | Log at `fatal` level |
| `child(bindings)` | Logger with bound fields, sharing transports |
| `flush()` | Push every transport's buffer. Synchronous |
| `close()` | Flush, then release transport resources |

Each method accepts `string`, `Record<string, unknown>`, or `Error` as the
message, **plus optional extra params in every case**. `warn(err, { attempt: 3 })`
and `info({ action: 'x' }, { ms: 4 })` both type-check.

A **plain object** param is merged into the entry as extra fields. Anything else
object-shaped — an array, `Map`, `Set`, `Date`, typed array or class instance —
cannot be merged without losing its contents, so it is collected under a `params`
array instead and rendered by the sanitizer:

```typescript
logger.info('Cache state', { hits: 1 });        // → { hits: 1 }
logger.info('Cache state', new Map([['a', 1]])); // → { params: [{ '[Map]': [['a', 1]] }] }
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
| `transports` | `Transport[]` | one `ConsoleTransport` | Replaces the default — see [Transports](#transports) |
| `bindings` | `Record<string, unknown>` | — | Static fields merged into every entry |
| `onTransportError` | `(error, transport) => void` | — | Called instead of the one-shot `console.error` |

### `FileTransport`

| Option | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` | — | Log file. Parent directories are created |
| `level` | `LogLevel` | logger's level | Minimum level for this transport |
| `format` | `LogFormatter` | `jsonFormat` | Per-transport formatting |
| `maxSize` | `number` | `0` (off) | Rotate once the file reaches this many bytes |
| `interval` | `'hourly' \| 'daily'` | — | Rotate when the **UTC** hour/day changes |
| `maxFiles` | `number` | `5` | Rotated files to keep (`app.log.1` … `app.log.N`) |
| `bufferBytes` | `number` | `0` | `0` writes through; above that, batches |
| `flushIntervalMs` | `number` | `1000` | Partial-buffer flush. Unref'd. Buffering only |
| `flushOnExit` | `boolean` | `true` | `process.on('exit')` hook. Buffering only |
| `onError` | `(error) => void` | — | Every write/rotate/open failure |

Readable state: `filePath`, `droppedCount`, `errorCount`, `pendingBytes`.
Rotation is checked before each write, so a file overshoots `maxSize` by at most
one batch.

### `ContextStore`

```typescript
new ContextStore()
```

| Method | Description |
|--------|-------------|
| `getContext()` | Get current async context |
| `updateContext(partial)` | Merge partial update into current context |
| `runWithContext(ctx, callback, options?)` | Execute callback within a context. Nested calls merge unless `{ inherit: false }` |

### Deliberately not included

- **Sampling / rate limiting.** Any default policy is wrong for someone, and it
  drops logs silently — the exact failure mode the reserved-key and `null`
  handling above exist to avoid. A consumer can wrap a `Transport` in ten lines.
- **Async transports.** The interface is synchronous so that flush-on-exit is
  achievable at all. A network transport would need its own buffering story.
- **Signal handlers.** Installing one changes how the process terminates.
- **Browser support.** This is a Node package. `node:fs` and `node:async_hooks`
  are imported directly from the main entry, and `process.pid` / `process.env`
  are read without a guard.

## License

[MIT](../../LICENSE)
