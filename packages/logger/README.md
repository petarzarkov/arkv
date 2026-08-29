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

### The context is a contract, not a class

`ContextStore` is the batteries-included implementation, not a requirement. The
logger's second argument accepts anything that can answer "what are this request's
fields":

```typescript
import { Logger, RequestScopedContext } from '@arkv/logger';

// A ContextStore, backed by AsyncLocalStorage. What most services want.
new Logger(config, new ContextStore());

// A scope with no AsyncLocalStorage in it, for a logger built per request.
new Logger(config, new RequestScopedContext({ requestId: 'r-1' }));

// A plain object, read live, so fields added later still appear.
const fields = {};
new Logger(config, fields);

// A function, for a host that already has its own per-request lookup.
new Logger(config, () => myFramework.currentRequest()?.fields);
```

The contract is two interfaces, because the halves differ in what can implement
them. `ContextReader` is the read side and the only half the logger depends on.
`ContextScope` adds `updateContext` and `runWithContext`, which is what a request
pipeline needs and what only `AsyncLocalStorage` can do across an `await`. A single
interface would have obliged every consumer to implement async propagation it may
not have.

`RequestScopedContext.runWithContext` saves and restores rather than propagating.
That is correct for a synchronous scope and for one instance per request. It is not
correct for two overlapping async flows through one instance: the restore runs when
the callback returns, and an `await` inside it hands control to another flow that
then reads these fields. Use `ContextStore` for that.

`ContextReader` has an optional `peekContext`, which returns the live fields without
copying and which the logger prefers when present. `ContextStore` does not implement
it on purpose: that class is public and subclassable, and a subclass overriding
`getContext` to add or redact a field would be silently bypassed if the logger read
an inherited `peekContext` instead.

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

#### Writing to a stream

`StreamTransport` takes any `Writable`: a socket, a pipe to a log collector, an
open file handle, or `process.stdout`.

```typescript
import { Logger, StreamTransport } from '@arkv/logger';

const logger = new Logger({
  transports: [new StreamTransport(process.stdout, { bufferBytes: 65536 })],
});
```

That is also the batched console: `process.stdout` is a `Writable`, so one write
per 64 KiB instead of one per line. It takes the same `bufferBytes`,
`flushIntervalMs` and `flushOnExit` options as `FileTransport`, with the same
defaults, so the two cannot disagree about when they flush.

**Batching buys syscalls, not throughput.** Measured on Bun 1.3.14 and Node
v24.18.0: batching 100 entries per turn cuts `write(2)` from 1.000 per entry to
0.010, worth 5.4x on the write path. End to end through `Logger` it is 1.00x, since
the write is 4 to 9 percent of a log call and entry assembly plus sanitization is 73
to 93 percent. Turn it on for the syscall economy and to bound what a full pipe
does, not for faster logging.

The stream belongs to the caller. `close()` flushes and drops the timer and exit
hook; it does not end the stream, because `process.stdout` must not be ended.

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

### Shipping logs somewhere else

`ConsoleTransport`, `StreamTransport` and `FileTransport` write synchronously,
which is what makes flush-on-exit possible. A collector reached over a network
cannot honour that, and pretending otherwise is worse than saying so. Those
transports implement `flushAsync` and `closeAsync`, and a graceful shutdown awaits
`logger.closeAsync()` rather than calling `close()`.

```typescript
import { HttpTransport, Logger } from '@arkv/logger';

const logger = new Logger({
  transports: [
    new HttpTransport({
      url: 'https://logs.example.com/ingest',
      headers: { authorization: `Bearer ${token}` },
      batchSize: 200,
      flushIntervalMs: 2000,
    }),
  ],
});

process.on('SIGTERM', async () => {
  await server.close();
  await logger.closeAsync(); // the batch has actually left the process
});
```

`encode` is the seam every collector differs at, and the reason there is one HTTP
transport rather than four:

```typescript
// Datadog
new HttpTransport({
  url: 'https://http-intake.logs.datadoghq.com/api/v2/logs',
  headers: { 'DD-API-KEY': key },
  contentType: 'application/json',
  encode: (batch) => JSON.stringify(batch.map((each) => each.entry)),
});

// Splunk HEC
new HttpTransport({
  url: 'https://splunk.example.com:8088/services/collector',
  headers: { authorization: `Splunk ${token}` },
  contentType: 'application/json',
  encode: (batch) =>
    batch.map((each) => JSON.stringify({ event: each.entry })).join(''),
});
```

A 4xx that is not 408 or 429 is not retried, because the same bytes will be
rejected the same way. `Retry-After` is obeyed in both its forms.

`SyslogTransport` speaks RFC 5424 over UDP (one datagram per entry) or TCP
(octet-counted per RFC 6587, reconnecting when the daemon restarts).

Anything else that batches is a subclass of `BatchTransport` with a `deliver`
method. The bounded queue, the batching, the single in-flight send, the backoff
and the drop accounting all come from the base.

### Thinning what gets through

```typescript
import { SamplingTransport, ConsoleTransport } from '@arkv/logger';

new Logger({
  transports: [
    new SamplingTransport(new ConsoleTransport(), {
      rate: 0.1,          // one in ten of the routine traffic
      maxPerInterval: 50, // and at most fifty per second per event
      intervalMs: 1000,
    }),
  ],
});
```

Warnings and worse are never sampled, whatever the rate: sampling an error is how
an incident becomes invisible. The per-event budget is what stops one hot loop
spending the whole allowance. When a window closes having discarded anything, one
line naming the count goes through, so a gap in the logs always carries its reason.

### Correlating with a trace

There is no OpenTelemetry dependency here and there does not need to be. `Logger`'s
second argument accepts a plain function, so the active span is read per entry
without this package knowing what a span is:

```typescript
import { trace } from '@opentelemetry/api';

const logger = new Logger(config, () => {
  const span = trace.getActiveSpan()?.spanContext();
  return span ? { traceId: span.traceId, spanId: span.spanId } : {};
});
```

The same shape works for any propagation you already have. A `ContextStore` is for
fields you set yourself; a function is for fields something else is already
tracking.

### Knowing whether logs are being lost

```typescript
logger.stats();
// [{ name: 'FileTransport', dropped: 0, queued: 0, errors: 0 }]
```

Anything above zero on `dropped` is worth an alert. A transport that keeps no
counters is omitted rather than reported as zero, which would read as measured and
fine.

### Changing the level on a running process

```typescript
process.on('SIGUSR2', () => logger.setLevel(LogLevel.DEBUG));
```

A logger and every child it made share one level, so this reaches all of them. A
transport that named its own `level` keeps it.

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
| `logLevel` | `LogLevel` | Current log level. Set it with `setLevel` |
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
| `setLevel(level)` | Change the level of this logger and its children |
| `stats()` | What each transport is holding and has dropped |
| `flush()` | Push every transport's buffer. Synchronous |
| `close()` | Flush, then release transport resources |
| `flushAsync()` | Drain every transport, awaiting the async ones |
| `closeAsync()` | Drain, then release. What a graceful shutdown awaits |

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

Rotated files are named `app.log.1`, `app.log.2` by default. `naming: 'date'`
names them for the period they hold instead, `app.log.2026-08-29`, so a rotated
file's name never changes again and a shipper globbing by day finds it. `utc: false`
makes `interval` follow the host clock rather than UTC.

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

- **Signal handlers.** Installing one changes how the process terminates. The
  `SIGUSR2` and `SIGTERM` examples above are yours to install.
- **Compression of rotated files.** Doing it synchronously stalls the event loop
  for as long as gzip takes on a file that may be hundreds of megabytes; doing it
  asynchronously races the next rotation. `logrotate`, pointed at `path.*`, does it
  properly and is already on the host.
- **A vendor transport per collector.** They differ only in body shape, which is
  `HttpTransport`'s `encode`. Four classes would be four buffering stories and
  three of them a bug.
- **Browser support.** This is a Node package. `node:fs`, `node:net`, `node:dgram`
  and `node:async_hooks` are imported directly from the main entry, and
  `process.pid` / `process.env` are read without a guard.

Two things that used to be on this list and no longer are. **Sampling** is here as
`SamplingTransport`, a decorator rather than a config field, so nothing is thinned
unless it is wrapped and a discard is always announced. **Async transports** are
here as the `flushAsync` / `closeAsync` half of the contract; the synchronous half
stays exactly what it was, because `process.on('exit')` still cannot await.

## License

[MIT](../../LICENSE)
