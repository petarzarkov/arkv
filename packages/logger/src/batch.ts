import { safeStringify } from '@arkv/shared';
import type { LogEntry, LogLevel, Transport, TransportStats } from './types.js';

export interface BatchedEntry {
  readonly entry: LogEntry;
  readonly level: LogLevel;
}

export interface BatchTransportOptions {
  level?: LogLevel;
  /** Send once this many entries are waiting. Default `100`. */
  batchSize?: number;
  /** Send a partial batch this often. Default `1000`. `0` disables the timer. */
  flushIntervalMs?: number;
  /**
   * Hold at most this many entries. Past it the newest are discarded and counted,
   * which is what every other transport here does when its sink will not take
   * them. Default `10_000`.
   */
  maxQueueSize?: number;
  /** Attempts per batch before it is discarded. Default `3`. */
  maxRetries?: number;
  /** First backoff step, doubling per attempt. Default `250`. */
  retryBaseMs?: number;
  /** Called on every send failure. Without it the first is reported on `console.error`. */
  onError?: (error: Error) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // A backoff must not be the reason a process stays alive.
    (timer as unknown as { unref?: () => void }).unref?.();
  });

/**
 * What every sink reachable only over a network needs, in one place: a bounded
 * queue, batching by size and by time, one send in flight at a time, retry with
 * backoff, and an accounting of what was lost.
 *
 * A subclass supplies {@link BatchTransport.deliver} and nothing else. Writing
 * that per vendor is how four transports come to have four different buffering
 * stories and three of them a bug.
 *
 * **One send in flight.** Batches leave in order, and a collector that is
 * struggling is not hit with parallel retries of the backlog it already cannot
 * keep up with.
 *
 * **`flush()` cannot honour its name here.** It starts a send and returns,
 * because there is no way to await inside `process.on('exit')`. A shutdown that
 * needs the batch to have actually left the process awaits
 * `Logger#closeAsync()`, which reaches {@link BatchTransport.closeAsync}.
 */
export abstract class BatchTransport implements Transport {
  readonly level?: LogLevel;
  readonly #batchSize: number;
  readonly #maxQueueSize: number;
  readonly #maxRetries: number;
  readonly #retryBaseMs: number;
  readonly #onError?: (error: Error) => void;
  #queue: BatchedEntry[] = [];
  #sending: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #droppedTotal = 0;
  #unannouncedDrops = 0;
  #errorCount = 0;
  #closed = false;
  #reported = false;

  constructor(options: BatchTransportOptions = {}) {
    this.level = options.level;
    this.#batchSize = Math.max(1, options.batchSize ?? 100);
    this.#maxQueueSize = Math.max(1, options.maxQueueSize ?? 10_000);
    this.#maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.#retryBaseMs = Math.max(0, options.retryBaseMs ?? 250);
    this.#onError = options.onError;

    const every = options.flushIntervalMs ?? 1000;
    if (every > 0) {
      const timer = setInterval(() => {
        this.#pump();
      }, every);
      (timer as unknown as { unref?: () => void }).unref?.();
      this.#timer = timer;
    }
  }

  /** Send one batch. Rejecting asks for a retry; the base decides whether to. */
  protected abstract deliver(batch: readonly BatchedEntry[]): Promise<void>;

  /**
   * Whether a failed send is worth repeating. The default says yes to everything;
   * a subclass that can tell a rejected payload from an unreachable collector
   * should say no to the first, since it will be rejected again.
   */
  protected retryable(_error: unknown): boolean {
    return true;
  }

  /**
   * How long to wait before the next attempt. Exponential from `retryBaseMs` by
   * default; a subclass whose sink says how long to wait, as an HTTP collector
   * does with `Retry-After`, overrides this to honour it.
   */
  protected retryDelay(_error: unknown, attempt: number): number {
    return this.#retryBaseMs * 2 ** attempt;
  }

  /** Entries the sink has not accepted yet. */
  get queuedCount(): number {
    return this.#queue.length;
  }

  get droppedCount(): number {
    return this.#droppedTotal;
  }

  get errorCount(): number {
    return this.#errorCount;
  }

  stats(): TransportStats {
    return {
      name: this.constructor.name,
      dropped: this.#droppedTotal,
      queued: this.#queue.length,
      errors: this.#errorCount,
    };
  }

  write(entry: LogEntry, level: LogLevel): void {
    if (this.#closed) {
      this.#drop(1);
      return;
    }
    if (this.#queue.length >= this.#maxQueueSize) {
      this.#drop(1);
      return;
    }
    this.#queue.push({ entry, level });
    if (this.#queue.length >= this.#batchSize) {
      this.#pump();
    }
  }

  /** Starts a send. Returns without waiting for it; see the class note. */
  flush(): void {
    this.#pump();
  }

  async flushAsync(): Promise<void> {
    await this.#drain();
  }

  /**
   * Stops the timer and discards what was queued, because there is no way to
   * send it synchronously. The discard is counted, so `stats()` says so rather
   * than the entries simply not arriving. Prefer `closeAsync`.
   */
  close(): void {
    this.#stopTimer();
    this.#closed = true;
    if (this.#queue.length > 0) {
      this.#drop(this.#queue.length);
      this.#queue = [];
    }
  }

  async closeAsync(): Promise<void> {
    this.#stopTimer();
    await this.#drain();
    this.#closed = true;
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  /** Fire and forget. `#drain` swallows everything, so this cannot reject. */
  #pump(): void {
    void this.#drain();
  }

  #drain(): Promise<void> {
    if (this.#sending) {
      return this.#sending;
    }
    const running = this.#run().finally(() => {
      this.#sending = undefined;
    });
    this.#sending = running;
    return running;
  }

  async #run(): Promise<void> {
    while (this.#queue.length > 0) {
      const batch = this.#queue.splice(0, this.#batchSize);
      await this.#send(batch);
    }
  }

  async #send(batch: BatchedEntry[]): Promise<void> {
    const announced = this.#unannouncedDrops;
    const payload =
      announced > 0 ? [this.#dropNotice(announced), ...batch] : batch;

    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.deliver(payload);
        this.#unannouncedDrops -= announced;
        return;
      } catch (error) {
        this.#errorCount += 1;
        if (attempt >= this.#maxRetries || !this.retryable(error)) {
          // Discarded rather than requeued: holding a growing backlog against a
          // collector that is not accepting it is how a logger takes down the
          // service it was meant to observe.
          this.#drop(batch.length);
          this.#report(error);
          return;
        }
        await sleep(this.retryDelay(error, attempt));
      }
    }
  }

  #dropNotice(count: number): BatchedEntry {
    return {
      level: 'warn' as LogLevel,
      entry: {
        level: 'warn',
        timestamp: new Date().toISOString(),
        message: `${this.constructor.name} dropped ${count} log entries`,
        droppedEntries: count,
      },
    };
  }

  #drop(count: number): void {
    this.#droppedTotal += count;
    this.#unannouncedDrops += count;
  }

  #report(error: unknown): void {
    const err =
      error instanceof Error ? error : new Error(safeStringify(error));
    if (this.#onError) {
      try {
        this.#onError(err);
      } catch {
        // A failing error handler is the end of the line.
      }
      return;
    }
    if (this.#reported) return;
    this.#reported = true;
    console.error(
      `[@arkv/logger] ${this.constructor.name} send failed and was ignored: ${err.message}. Further failures are suppressed.`,
    );
  }
}
