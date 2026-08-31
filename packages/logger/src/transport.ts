import { jsonFormat, prettyFormat } from './format.js';
import {
  type LogEntry,
  type LogFormatter,
  LogLevel,
  type Transport,
  type TransportStats,
} from './types.js';

export interface ConsoleTransportOptions {
  level?: LogLevel;
  /** Defaults to colored JSON when `pretty`, plain JSON otherwise. */
  format?: LogFormatter;
  /** Colored output. Defaults to `process.env.NODE_ENV !== 'production'`. */
  pretty?: boolean;
  /**
   * Coalesce entries at `info` and below into one write per timer tick instead of
   * calling `console.log` once each. Default `false`.
   *
   * **No throughput win was measurable for this, and it is off by default partly
   * for that reason.** Measured in `@dunx/http`'s request path on Bun 1.4.0,
   * round-robin over five rounds: 10267 ns unbatched against 11106 ns batched
   * with stdout on /dev/null, and 22.9 us against 23.8 us with stdout in a pipe
   * nobody drains. Batching was slower in both.
   *
   * Why: a write to /dev/null costs about 100 ns, so there is almost nothing to
   * save, and against a blocked consumer the limit is the bytes written rather
   * than the number of calls. What batching removes is syscall count, so it can
   * only pay where that is the bottleneck - which neither of those is.
   *
   * Reach for it only with a measurement of your own sink.
   *
   * Off by default because it changes when output appears, not what appears. A
   * `logger.info()` no longer reaches stdout before the next statement runs, so
   * anything asserting on `console.log` straight after a log call sees nothing
   * until the tick. `warn` and above are never buffered and flush whatever is
   * queued behind them, so an error still arrives in order and immediately.
   */
  batch?: boolean;
  /**
   * Flush from `process.on('exit')`. Default `true` when batching.
   *
   * The window a buffered line can be lost in is one timer tick, and this closes
   * the ordinary end of it. A process killed with `SIGKILL`, or one that crashes
   * the runtime itself, still loses what was queued: that is the trade batching
   * makes, and `flush()` is public for the paths that cannot accept it.
   */
  flushOnExit?: boolean;
}

function isErrorLevel(level: LogLevel): boolean {
  return (
    level === LogLevel.WARN ||
    level === LogLevel.ERROR ||
    level === LogLevel.FATAL
  );
}

/**
 * Writes to stdout, and to stderr for warn/error/fatal so the two are separable
 * by a log shipper, `2>` redirection or CI annotations.
 */
export class ConsoleTransport implements Transport {
  readonly level?: LogLevel;
  readonly #format: LogFormatter;
  readonly #batch: boolean;
  #pending = '';
  #queued = 0;
  #timer?: ReturnType<typeof setTimeout>;
  #exitHook?: () => void;

  constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
    const pretty = options.pretty ?? process.env.NODE_ENV !== 'production';
    this.#format = options.format ?? (pretty ? prettyFormat : jsonFormat);
    this.#batch = options.batch ?? false;

    if (this.#batch && (options.flushOnExit ?? true)) {
      this.#exitHook = () => {
        this.flush();
      };
      process.on('exit', this.#exitHook);
    }
  }

  stats(): TransportStats {
    return {
      name: 'ConsoleTransport',
      dropped: 0,
      queued: this.#queued,
      errors: 0,
    };
  }

  write(entry: LogEntry, level: LogLevel): void {
    const output = this.#format(entry, level);

    if (isErrorLevel(level)) {
      // Ahead of the write, so a queued `info` cannot appear after the `error`
      // that was logged later than it.
      this.flush();
      console.error(output);
      return;
    }

    if (!this.#batch) {
      console.log(output);
      return;
    }

    this.#pending =
      this.#pending === '' ? output : `${this.#pending}\n${output}`;
    this.#queued += 1;
    if (this.#timer !== undefined) return;
    const timer = setTimeout(() => {
      this.#timer = undefined;
      this.flush();
    }, 0);
    // A flush timer must not be the reason a process stays alive. `unref` is
    // Node's, and this transport also has to run on the web, where the timer
    // handle is a number and there is nothing to unref.
    (timer as unknown as { unref?: () => void }).unref?.();
    this.#timer = timer;
  }

  /** Writes whatever is queued. Idempotent, and a no-op when not batching. */
  flush(): void {
    if (this.#pending === '') return;
    const batch = this.#pending;
    this.#pending = '';
    this.#queued = 0;
    console.log(batch);
  }

  /** Flushes, stops the timer and releases the exit hook. */
  close(): void {
    this.flush();
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (this.#exitHook) {
      process.off('exit', this.#exitHook);
      this.#exitHook = undefined;
    }
  }
}
