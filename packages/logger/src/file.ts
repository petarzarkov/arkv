import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { safeStringify } from '@arkv/shared';
import { jsonFormat } from './format.js';
import type {
  LogEntry,
  LogFormatter,
  LogLevel,
  Transport,
  TransportStats,
} from './types.js';

export type RotationInterval = 'hourly' | 'daily';

export interface FileTransportOptions {
  path: string;
  level?: LogLevel;
  /** Defaults to plain JSON; a colored file is noise to a log shipper. */
  format?: LogFormatter;
  /** Rotate once the active file reaches this many bytes. `0` disables. */
  maxSize?: number;
  /** Rotate when the hour or day changes. */
  interval?: RotationInterval;
  /**
   * Whether `interval` follows UTC. Default `true`, which is what it has always
   * done. `false` follows the host's local time, so a daily file for a team in
   * UTC+10 rolls at their midnight rather than at ten in the morning.
   */
  utc?: boolean;
  /** Rotated files to keep. The oldest is deleted. Default `5`. */
  maxFiles?: number;
  /**
   * How a rotated file is named.
   *
   * `sequence`, the default, shifts `app.log.1` to `app.log.2` and so on, which is
   * what `logrotate` produces and what this has always done. `date` names it for
   * the period it holds instead, `app.log.2026-08-29`, which is what a shipper
   * globbing by day expects and what stops a file's name changing after it was
   * written. A second rotation inside one period gets a `.1` suffix.
   */
  naming?: 'sequence' | 'date';
  /**
   * Batch writes until this many bytes are pending. `0` (the default) writes
   * through on every entry, which cannot lose anything but pays a syscall per
   * line.
   */
  bufferBytes?: number;
  /**
   * Flush a partial buffer this often, so a quiet service still reaches disk.
   * Default `1000`. Only used when `bufferBytes > 0`.
   */
  flushIntervalMs?: number;
  /** Flush from `process.on('exit')`. Default `true` when buffering. */
  flushOnExit?: boolean;
  /**
   * Called on every write, rotate or open failure. Without it the first failure
   * is reported on `console.error` and the rest are suppressed.
   */
  onError?: (error: Error) => void;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * The bucket a moment falls in. Exported for its own test, which is what lets the
 * local branch be checked without moving the host's clock. Not re-exported from
 * the package index.
 */
export function periodKey(
  interval: RotationInterval | undefined,
  utc: boolean,
  now: Date = new Date(),
): string {
  if (!interval) {
    return '';
  }
  if (utc) {
    const iso = now.toISOString();
    return interval === 'hourly' ? iso.slice(0, 13) : iso.slice(0, 10);
  }
  const at = now;
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return interval === 'hourly' ? `${day}T${pad(at.getHours())}` : day;
}

/**
 * Appends entries to a file, with size- and time-based rotation.
 *
 * **One process per file.** Writes go through `writeSync` on an `O_APPEND` fd,
 * which POSIX only guarantees to be atomic below `PIPE_BUF` (4096 bytes). A
 * batched flush is routinely larger than that, so two processes appending to one
 * path will interleave and tear each other's lines; concurrent rotation is worse,
 * since both race the same rename chain and lose files. Under `cluster` or
 * `worker_threads`, give each process its own path or ship through the parent.
 *
 * **Rotated files are not compressed.** Doing it synchronously would stall the
 * event loop for as long as gzip takes on a file that may be hundreds of
 * megabytes, and doing it asynchronously would race the next rotation. `logrotate`
 * with `copytruncate` off, pointed at `path.*`, does it properly and is already on
 * the host.
 *
 * Writes are **synchronous** (`fs.writeSync` on an append-mode fd), batched
 * when `bufferBytes` is set. That is deliberate: `process.on('exit')` cannot
 * await, so a transport that flushes asynchronously cannot guarantee its buffer
 * reaches disk when the process ends — the one thing a file transport exists to
 * do. The cost is that a flush blocks the event loop for one `writeSync` of at
 * most `bufferBytes`.
 *
 * That is also the backpressure answer: this transport **blocks rather than
 * queues**. There is no unbounded in-memory queue to overflow, because the
 * buffer is flushed the moment it reaches `bufferBytes`. Entries are discarded
 * only when the write itself fails or an open failure disabled the transport;
 * discards are counted on `droppedCount` and announced in-band on the next
 * successful write.
 */
export class FileTransport implements Transport {
  readonly level?: LogLevel;
  readonly #path: string;
  readonly #format: LogFormatter;
  readonly #maxSize: number;
  readonly #maxFiles: number;
  readonly #interval?: RotationInterval;
  readonly #utc: boolean;
  readonly #naming: 'sequence' | 'date';
  readonly #bufferBytes: number;
  readonly #onError?: (error: Error) => void;
  #fd: number | null = null;
  #size = 0;
  #period: string;
  #previousPeriod = '';
  #openedAt = new Date();
  #buffer: string[] = [];
  #pending = 0;
  #droppedTotal = 0;
  #unannouncedDrops = 0;
  #errorCount = 0;
  #reportedError = false;
  #closed = false;
  #disabled = false;
  #flushing = false;
  #timer?: ReturnType<typeof setInterval>;
  #exitHook?: () => void;

  constructor(options: FileTransportOptions) {
    this.level = options.level;
    this.#path = options.path;
    this.#format = options.format ?? jsonFormat;
    this.#maxSize = options.maxSize ?? 0;
    this.#maxFiles = Math.max(1, options.maxFiles ?? 5);
    this.#interval = options.interval;
    this.#utc = options.utc ?? true;
    this.#naming = options.naming ?? 'sequence';
    this.#bufferBytes = Math.max(0, options.bufferBytes ?? 0);
    this.#onError = options.onError;
    this.#period = periodKey(this.#interval, this.#utc);
    this.#open();

    if (this.#bufferBytes > 0) {
      const every = options.flushIntervalMs ?? 1000;
      if (every > 0) {
        const timer = setInterval(() => {
          this.flush();
        }, every);
        // A flush timer must not be the reason a process stays alive.
        (timer as unknown as { unref?: () => void }).unref?.();
        this.#timer = timer;
      }
      if (options.flushOnExit ?? true) {
        this.#exitHook = () => {
          this.flush();
        };
        process.on('exit', this.#exitHook);
      }
    }
  }

  get filePath(): string {
    return this.#path;
  }

  /** Entries discarded because a write failed or the transport is disabled. */
  get droppedCount(): number {
    return this.#droppedTotal;
  }

  get errorCount(): number {
    return this.#errorCount;
  }

  /** Bytes waiting in memory. Always `0` unless `bufferBytes` was set. */
  get pendingBytes(): number {
    return this.#pending;
  }

  stats(): TransportStats {
    return {
      name: 'FileTransport',
      dropped: this.#droppedTotal,
      queued: this.#pending,
      errors: this.#errorCount,
    };
  }

  write(entry: LogEntry, level: LogLevel): void {
    if (this.#closed || this.#disabled) {
      this.#drop(1);
      return;
    }
    const line = `${this.#format(entry, level)}\n`;
    this.#buffer.push(line);
    this.#pending += Buffer.byteLength(line);
    if (this.#pending >= this.#bufferBytes) {
      this.flush();
    }
  }

  flush(): void {
    if (this.#flushing || this.#buffer.length === 0) {
      return;
    }
    this.#flushing = true;
    const lines = this.#buffer;
    this.#buffer = [];
    this.#pending = 0;
    const announced = this.#unannouncedDrops;
    const body = lines.join('');
    const payload = announced > 0 ? this.#dropNotice(announced) + body : body;
    try {
      this.#rotateIfNeeded();
      this.#writeAll(payload);
      this.#unannouncedDrops -= announced;
    } catch (error) {
      // The payload is discarded rather than retained: holding a growing
      // backlog against a disk that is not accepting writes is how a logger
      // takes down the service it was meant to observe.
      this.#drop(lines.length);
      this.#report(error);
    } finally {
      this.#flushing = false;
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.flush();
    this.#closed = true;
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    if (this.#exitHook) {
      process.off('exit', this.#exitHook);
      this.#exitHook = undefined;
    }
    if (this.#fd !== null) {
      try {
        closeSync(this.#fd);
      } catch (error) {
        this.#report(error);
      }
      this.#fd = null;
    }
  }

  #dropNotice(count: number): string {
    return `${safeStringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message: `file transport dropped ${count} log entries`,
      droppedEntries: count,
      path: this.#path,
    })}\n`;
  }

  #drop(count: number): void {
    this.#droppedTotal += count;
    this.#unannouncedDrops += count;
  }

  #open(): void {
    try {
      const dir = dirname(this.#path);
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.#fd = openSync(this.#path, 'a');
      this.#size = fstatSync(this.#fd).size;
      this.#openedAt = new Date();
    } catch (error) {
      this.#fd = null;
      // A path that cannot be opened will not start opening on its own, so the
      // transport stops trying instead of throwing a syscall per log line.
      this.#disabled = true;
      this.#report(error);
    }
  }

  #rotateIfNeeded(): void {
    if (this.#interval) {
      const now = periodKey(this.#interval, this.#utc);
      if (now !== this.#period) {
        this.#previousPeriod = this.#period;
        this.#period = now;
        this.#rotate('interval');
        return;
      }
    }
    // Checked before the write, so a file overshoots `maxSize` by at most one
    // batch.
    if (this.#maxSize > 0 && this.#size >= this.#maxSize) {
      this.#rotate('size');
    }
  }

  #rotate(reason: 'interval' | 'size'): void {
    if (this.#fd !== null) {
      closeSync(this.#fd);
      this.#fd = null;
    }
    if (this.#naming === 'date') {
      this.#rotateByDate(reason);
    } else {
      this.#rotateBySequence();
    }
    this.#open();
  }

  #rotateBySequence(): void {
    const oldest = `${this.#path}.${this.#maxFiles}`;
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }
    for (let i = this.#maxFiles - 1; i >= 1; i -= 1) {
      const from = `${this.#path}.${i}`;
      if (existsSync(from)) {
        renameSync(from, `${this.#path}.${i + 1}`);
      }
    }
    if (existsSync(this.#path)) {
      renameSync(this.#path, `${this.#path}.1`);
    }
  }

  /**
   * Named for the period it holds, so a rotated file's name never changes again.
   * That is the difference from the sequence scheme, where every rotation renames
   * every previous file and a shipper watching `app.log.1` sees new contents.
   */
  #rotateByDate(reason: 'interval' | 'size'): void {
    // Which bucket the file being closed actually holds. On an interval rollover
    // `#period` has already advanced, so it is the one before; on a size rotation
    // the file is still inside the current bucket. Reading `#previousPeriod` for
    // both labelled a size-rotated file with the previous hour, or with a daily
    // stamp under an hourly interval before the first rollover.
    const stamp =
      reason === 'interval'
        ? this.#previousPeriod ||
          periodKey(this.#interval ?? 'daily', this.#utc, this.#openedAt)
        : this.#period || periodKey('daily', this.#utc, this.#openedAt);
    let target = `${this.#path}.${stamp}`;
    for (let at = 1; existsSync(target); at += 1) {
      // A second rotation inside one period, which `maxSize` can cause.
      target = `${this.#path}.${stamp}.${at}`;
    }
    if (existsSync(this.#path)) {
      renameSync(this.#path, target);
    }
    this.#prune();
  }

  /** Keeps the newest `maxFiles` rotated files and deletes the rest. */
  #prune(): void {
    const directory = dirname(this.#path);
    const prefix = `${basename(this.#path)}.`;
    let rotated: string[];
    try {
      rotated = readdirSync(directory).filter((name) =>
        name.startsWith(prefix),
      );
    } catch {
      // The directory went away underneath us; the next write reports it.
      return;
    }
    /**
     * The stamp, and the repeat counter behind it.
     *
     * A plain lexical sort is chronological for the ISO stamp and wrong for the
     * counter: `.2026-08-29.10` sorts before `.2026-08-29.2`, so past nine
     * rotations in one period the newest files were the ones being deleted.
     */
    const rank = (name: string): [string, number] => {
      const rest = name.slice(prefix.length);
      const at = rest.lastIndexOf('.');
      if (at === -1) {
        return [rest, 0];
      }
      const repeat = Number(rest.slice(at + 1));
      return Number.isInteger(repeat) ? [rest.slice(0, at), repeat] : [rest, 0];
    };

    rotated.sort((left, right) => {
      const [leftStamp, leftRepeat] = rank(left);
      const [rightStamp, rightRepeat] = rank(right);
      if (leftStamp !== rightStamp) {
        return leftStamp < rightStamp ? -1 : 1;
      }
      return leftRepeat - rightRepeat;
    });

    for (const name of rotated.slice(
      0,
      Math.max(0, rotated.length - this.#maxFiles),
    )) {
      try {
        unlinkSync(join(directory, name));
      } catch {
        // Someone else's to delete, or already gone.
      }
    }
  }

  #writeAll(data: string): void {
    if (this.#fd === null) {
      throw new Error(`log file ${this.#path} is not open`);
    }
    const buf = Buffer.from(data, 'utf8');
    let offset = 0;
    while (offset < buf.length) {
      offset += writeSync(this.#fd, buf, offset, buf.length - offset);
    }
    this.#size += buf.length;
  }

  #report(error: unknown): void {
    this.#errorCount += 1;
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.#onError) {
      try {
        this.#onError(err);
      } catch {
        // A failing error handler is the end of the line.
      }
      return;
    }
    if (this.#reportedError) {
      return;
    }
    this.#reportedError = true;
    console.error(
      `[@arkv/logger] file transport ${this.#path}: ${err.message}. Entries will be dropped; further errors from this transport are suppressed.`,
    );
  }
}
