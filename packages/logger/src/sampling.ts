import {
  LOG_LEVELS,
  LogLevel,
  type LogEntry,
  type Transport,
  type TransportStats,
} from './types.js';

export interface SamplingOptions {
  /**
   * Fraction of eligible entries kept, `0` to `1`. Default `1`, which keeps
   * everything and leaves only the rate limit doing work.
   */
  rate?: number;
  /**
   * Levels at or above this are never sampled and never limited. Default `warn`.
   *
   * Sampling an error is how an incident becomes invisible, so the useful policy
   * is always "thin the routine traffic, keep everything that went wrong".
   */
  always?: LogLevel;
  /** At most this many eligible entries per window. `0`, the default, disables it. */
  maxPerInterval?: number;
  /** The window. Default `1000`. */
  intervalMs?: number;
  /**
   * Groups the limit, so one hot loop cannot spend the whole budget and mute
   * everything else. Defaults to the entry's `event` then `context`, then one
   * shared bucket.
   */
  key?: (entry: LogEntry) => string;
  /** Distinct keys tracked per window. Default `1000`. */
  maxKeys?: number;
}

const levelIndex = (level: LogLevel): number => LOG_LEVELS.indexOf(level);

const defaultKey = (entry: LogEntry): string => {
  const event = entry.event ?? entry.context;
  return typeof event === 'string' ? event : '';
};

/**
 * Thins what reaches another transport, by fraction and by rate.
 *
 * This is the ten lines every consumer was told to write, written once. It is a
 * decorator and not a `LoggerConfig` field on purpose: any default policy is wrong
 * for someone, so nothing samples unless it is wrapped, and the wrapping says
 * exactly what is being thinned.
 *
 * **A drop is announced, not silent.** When a window closes having discarded
 * anything, one entry naming the count goes to the wrapped transport, so a gap in
 * the logs is always accompanied by the reason for it. Silently dropping is the
 * failure mode that kept this out of the package for so long.
 *
 * `Math.random` is the sampler. `@arkv/rng` is the house answer for randomness that
 * matters, and it carries a WASM artifact; loading one to decide whether to keep a
 * debug line would cost more than the decision is worth.
 */
export class SamplingTransport implements Transport {
  readonly level?: LogLevel;
  readonly #inner: Transport;
  readonly #rate: number;
  readonly #alwaysIdx: number;
  readonly #maxPerInterval: number;
  readonly #intervalMs: number;
  readonly #key: (entry: LogEntry) => string;
  readonly #maxKeys: number;
  #counts = new Map<string, number>();
  #windowStartedAt = Date.now();
  #windowDrops = 0;
  #droppedTotal = 0;

  constructor(inner: Transport, options: SamplingOptions = {}) {
    this.#inner = inner;
    this.level = inner.level;
    this.#rate = Math.min(1, Math.max(0, options.rate ?? 1));
    this.#alwaysIdx = levelIndex(options.always ?? LogLevel.WARN);
    this.#maxPerInterval = Math.max(0, options.maxPerInterval ?? 0);
    this.#intervalMs = Math.max(1, options.intervalMs ?? 1000);
    this.#key = options.key ?? defaultKey;
    this.#maxKeys = Math.max(1, options.maxKeys ?? 1000);
  }

  /** Entries this decorator discarded. What the inner transport lost is its own. */
  get droppedCount(): number {
    return this.#droppedTotal;
  }

  stats(): TransportStats {
    const inner = this.#inner.stats?.();
    return {
      name: `SamplingTransport(${inner?.name ?? this.#inner.constructor.name})`,
      dropped: this.#droppedTotal + (inner?.dropped ?? 0),
      queued: inner?.queued ?? 0,
      errors: inner?.errors ?? 0,
    };
  }

  write(entry: LogEntry, level: LogLevel): void {
    this.#roll();

    if (levelIndex(level) >= this.#alwaysIdx) {
      this.#inner.write(entry, level);
      return;
    }
    if (this.#rate < 1 && Math.random() >= this.#rate) {
      this.#discard();
      return;
    }
    if (this.#maxPerInterval > 0 && this.#overBudget(entry)) {
      this.#discard();
      return;
    }
    this.#inner.write(entry, level);
  }

  flush(): void {
    this.#inner.flush?.();
  }

  close(): void {
    this.#announce();
    this.#inner.flush?.();
    this.#inner.close?.();
  }

  async flushAsync(): Promise<void> {
    if (this.#inner.flushAsync) {
      await this.#inner.flushAsync();
      return;
    }
    this.#inner.flush?.();
  }

  async closeAsync(): Promise<void> {
    this.#announce();
    if (this.#inner.closeAsync) {
      await this.#inner.closeAsync();
      return;
    }
    await this.flushAsync();
    this.#inner.close?.();
  }

  #overBudget(entry: LogEntry): boolean {
    const key = this.#key(entry);
    const seen = this.#counts.get(key);
    if (seen === undefined) {
      // A key function returning something unbounded would otherwise grow this
      // map for the life of the window.
      if (this.#counts.size >= this.#maxKeys) {
        return false;
      }
      this.#counts.set(key, 1);
      return false;
    }
    if (seen >= this.#maxPerInterval) {
      return true;
    }
    this.#counts.set(key, seen + 1);
    return false;
  }

  #discard(): void {
    this.#droppedTotal += 1;
    this.#windowDrops += 1;
  }

  #roll(): void {
    if (Date.now() - this.#windowStartedAt < this.#intervalMs) {
      return;
    }
    this.#announce();
    this.#counts = new Map();
    this.#windowStartedAt = Date.now();
  }

  /** One line naming the gap, so a thinned log never looks merely quiet. */
  #announce(): void {
    if (this.#windowDrops === 0) {
      return;
    }
    const dropped = this.#windowDrops;
    this.#windowDrops = 0;
    this.#inner.write(
      {
        level: LogLevel.WARN,
        timestamp: new Date().toISOString(),
        message: `sampling discarded ${dropped} log entries`,
        droppedEntries: dropped,
      },
      LogLevel.WARN,
    );
  }
}
