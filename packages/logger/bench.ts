/**
 * Where a log call actually spends its time.
 *
 * The claim this exists to keep honest is the one in `StreamTransport`'s own
 * documentation: the write is a small fraction of a log call and entry assembly
 * plus sanitization is most of it. That number was measured once and written down;
 * without something committed to re-run it, the next change to the hot path is
 * guesswork.
 *
 * `bun bench.ts` from this package.
 */
import { Logger } from './src/logger.js';
import { prepareSanitizeOptions, sanitizePrepared } from './src/sanitize.js';
import { createLogEntry } from './src/entry.js';
import { serializeError } from './src/serialize-error.js';
import { logfmtFormat, textFormat } from './src/text.js';
import { prettyFormat } from './src/format.js';
import { DEFAULT_MASK_FIELDS, LogLevel, type LogEntry } from './src/types.js';
import type { Transport } from './src/types.js';

// `isColorSupported()` reads the environment and stdout's TTY status, so without
// this the formatter numbers depend on where the benchmark was run from. Off is
// also the production path: nothing in a container renders escapes.
process.env.NO_COLOR = '1';

const N = 200_000;

class NullTransport implements Transport {
  count = 0;
  write(): void {
    this.count += 1;
  }
}

/** Discards the formatted string, so formatting is paid for and the sink is not. */
class FormatOnlyTransport implements Transport {
  length = 0;
  write(entry: LogEntry): void {
    this.length += JSON.stringify(entry).length;
  }
}

interface Result {
  readonly label: string;
  readonly ns: number;
}

const results: Result[] = [];

function bench(label: string, iterations: number, run: () => void): void {
  // One warm pass, so the first result is not paying for JIT tiering.
  for (let at = 0; at < Math.min(iterations, 2000); at += 1) run();
  const started = Bun.nanoseconds();
  for (let at = 0; at < iterations; at += 1) run();
  results.push({ label, ns: (Bun.nanoseconds() - started) / iterations });
}

const context = {
  requestId: '01a049b3-c425-74db-a536-b149253c39f5',
  userId: 'usr_8812',
  event: '/api/orders',
  flow: 'http',
};

const extra = {
  statusCode: 200,
  elapsedMs: 14,
  order: { id: 'ord_1', total: 4200, currency: 'EUR' },
};

const sanitizeOptions = prepareSanitizeOptions({
  maskFields: [...DEFAULT_MASK_FIELDS],
  maxArrayLength: 100,
  maxDepth: 32,
});

const assembled = createLogEntry({
  level: LogLevel.INFO,
  message: 'order placed',
  context,
  extra,
});

bench('createLogEntry', N, () => {
  createLogEntry({
    level: LogLevel.INFO,
    message: 'order placed',
    context,
    extra,
  });
});

bench('sanitizePrepared', N, () => {
  sanitizePrepared(assembled, sanitizeOptions);
});

bench('JSON.stringify', N, () => {
  JSON.stringify(assembled);
});

const nullSink = new NullTransport();
const nullLogger = new Logger({ transports: [nullSink] });
bench('Logger.info, discarding sink', N, () => {
  nullLogger.info('order placed', extra);
});

const formatting = new Logger({ transports: [new FormatOnlyTransport()] });
bench('Logger.info, formatting sink', N, () => {
  formatting.info('order placed', extra);
});

const belowLevel = new Logger({
  level: LogLevel.ERROR,
  transports: [new NullTransport()],
});
bench('Logger.debug below the level', N, () => {
  belowLevel.debug('never rendered', extra);
});

const child = nullLogger.child({ module: 'orders', region: 'eu-west-1' });
bench('child logger, discarding sink', N, () => {
  child.info('order placed', extra);
});

const wrapped = new Error('upstream refused', {
  cause: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
});
bench('serializeError, one cause deep', N, () => {
  serializeError(wrapped);
});

const withError = new Logger({ transports: [new NullTransport()] });
bench('Logger.error with an error', N, () => {
  withError.error('checkout failed', wrapped);
});

bench('textFormat', N, () => {
  textFormat(assembled, LogLevel.INFO);
});

bench('logfmtFormat', N, () => {
  logfmtFormat(assembled, LogLevel.INFO);
});

bench('prettyFormat', N, () => {
  prettyFormat(assembled, LogLevel.INFO);
});

const widest = results.reduce(
  (longest, each) => Math.max(longest, each.label.length),
  0,
);
const baseline = results.find((each) =>
  each.label.startsWith('Logger.info, discarding'),
)?.ns;

console.log(`\n${N.toLocaleString()} iterations each, Bun ${Bun.version}\n`);
console.log(
  `${'operation'.padEnd(widest)}  ${'ns/op'.padStart(9)}  ${'ops/sec'.padStart(12)}  share`,
);
console.log('-'.repeat(widest + 36));
for (const { label, ns } of results) {
  const share =
    baseline && ns <= baseline ? `${((ns / baseline) * 100).toFixed(0)}%` : '';
  console.log(
    `${label.padEnd(widest)}  ${ns.toFixed(1).padStart(9)}  ${Math.round(
      1e9 / ns,
    )
      .toLocaleString()
      .padStart(12)}  ${share}`,
  );
}
console.log(
  '\nShare is of one `Logger.info` into a sink that discards, which is the\n' +
    'floor a transport is measured against.\n' +
    '\nThe formatters run with colour off, because this is not a terminal. That\n' +
    'is also the production path: `prettyFormat` falls back to plain JSON when\n' +
    'nothing can render the escapes, so what it costs here is what it costs\n' +
    'in a container.\n',
);
