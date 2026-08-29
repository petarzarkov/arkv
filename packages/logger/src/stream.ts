import type { Writable } from 'node:stream';
import { safeStringify } from '@arkv/shared';
import { jsonFormat } from './format.js';
import {
  type LogEntry,
  type LogFormatter,
  type LogLevel,
  type Transport,
} from './types.js';

export interface StreamTransportOptions {
  level?: LogLevel;
  /** Defaults to plain JSON: a stream is a machine sink, not a terminal. */
  format?: LogFormatter;
  /**
   * Batch writes until this many bytes are pending. `0` (the default) writes
   * through on every entry, which cannot lose anything but pays a syscall per
   * line. Same meaning, same default and same flush triggers as
   * `FileTransportOptions.bufferBytes`.
   */
  bufferBytes?: number;
  /**
   * Flush a partial buffer this often, so a quiet service still reaches the
   * stream. Default `1000`. Only used when `bufferBytes > 0`.
   */
  flushIntervalMs?: number;
  /** Flush from `process.on('exit')`. Default `true` when buffering. */
  flushOnExit?: boolean;
  /**
   * How much to hold in memory while the stream is refusing writes. Default one
   * mebibyte. Entries past it are discarded and counted on `droppedCount`.
   */
  maxBufferBytes?: number;
  /** Called on a write failure. Without it the first is reported on `console.error`. */
  onError?: (error: Error) => void;
}

interface Held {
  readonly text: string;
  readonly lines: number;
  readonly bytes: number;
}

const DEFAULT_MAX_BUFFER_BYTES = 1_048_576;

/**
 * Writes entries to any `Writable`: a socket, a pipe to a collector, an open file
 * handle, or `process.stdout`.
 *
 * This is also the batched-console transport. `process.stdout` is a `Writable`, so
 * `new StreamTransport(process.stdout, { bufferBytes: 65536 })` is one write per
 * 64 KiB instead of one per line, and a separate `BufferedConsoleTransport` would
 * be this class with a different argument.
 *
 * **Batching buys syscalls, not throughput.** Measured on Bun 1.3.14 and Node
 * v24.18.0, batching 100 entries per turn cuts `write(2)` from 1.000 per entry to
 * 0.010, worth 5.4x on the write path alone. End to end through `Logger` it is
 * 1.00x, because the write is 4 to 9 percent of a log call and entry assembly plus
 * sanitization is 73 to 93 percent. Turn it on for the syscall economy and to bound
 * what a full pipe does, not expecting faster logging.
 *
 * **Backpressure is observed.** `Writable.write` returning `false` means the sink
 * is behind, and the data is already sitting in the stream's own buffer. Writing
 * anyway is how a service logging to a pipe that stopped being read grows that
 * buffer without bound and is killed for it. This stops on the first refusal, holds
 * at most `maxBufferBytes` of its own, discards past that with a count, and resumes
 * on `drain`.
 *
 * **The stream is the caller's.** `close()` flushes and releases this transport's
 * timer, listeners and exit hook; it does not end the stream, because the caller
 * may still be using it and `process.stdout` must not be ended at all.
 */
export class StreamTransport implements Transport {
  readonly level?: LogLevel;
  readonly #stream: Writable;
  readonly #format: LogFormatter;
  readonly #bufferBytes: number;
  readonly #maxBufferBytes: number;
  readonly #onError?: (error: Error) => void;
  #buffer: string[] = [];
  #pending = 0;
  #held: Held[] = [];
  #heldBytes = 0;
  #writable = true;
  #broken = false;
  #droppedTotal = 0;
  #unannouncedDrops = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #exitHook: (() => void) | undefined;
  #reported = false;
  readonly #onDrain: () => void;
  readonly #onStreamError: (error: Error) => void;

  constructor(stream: Writable, options: StreamTransportOptions = {}) {
    this.#stream = stream;
    this.level = options.level;
    this.#format = options.format ?? jsonFormat;
    this.#bufferBytes = Math.max(0, options.bufferBytes ?? 0);
    this.#maxBufferBytes = Math.max(
      0,
      options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
    );
    this.#onError = options.onError;

    this.#onDrain = (): void => {
      this.#writable = true;
      this.#releaseHeld();
    };
    /**
     * A `Writable` with no `error` listener throws the event, which takes the
     * process down. A logger must not be the reason a service dies, so this
     * listens, reports through the same path as a failed write, and stops
     * queueing for a stream that will not accept anything again.
     */
    this.#onStreamError = (error: Error): void => {
      this.#broken = true;
      this.#drop(this.#held.reduce((total, held) => total + held.lines, 0));
      this.#held = [];
      this.#heldBytes = 0;
      this.#report(error);
    };
    stream.on('drain', this.#onDrain);
    stream.on('error', this.#onStreamError);

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

  /** Bytes waiting to be batched. Always `0` unless `bufferBytes` was set. */
  get pendingBytes(): number {
    return this.#pending;
  }

  /** Bytes held because the stream is refusing writes. */
  get queuedBytes(): number {
    return this.#heldBytes;
  }

  /** Entries discarded because the hold reached `maxBufferBytes`, or the stream broke. */
  get droppedCount(): number {
    return this.#droppedTotal;
  }

  write(entry: LogEntry, level: LogLevel): void {
    const line = `${this.#format(entry, level)}\n`;
    if (this.#bufferBytes === 0) {
      this.#push(line, 1);
      return;
    }

    this.#buffer.push(line);
    this.#pending += Buffer.byteLength(line);
    if (this.#pending >= this.#bufferBytes) {
      this.flush();
    }
  }

  flush(): void {
    if (this.#buffer.length === 0) return;
    const lines = this.#buffer;
    this.#buffer = [];
    this.#pending = 0;
    this.#push(lines.join(''), lines.length);
  }

  close(): void {
    this.flush();
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    if (this.#exitHook) {
      process.off('exit', this.#exitHook);
      this.#exitHook = undefined;
    }
    this.#stream.off('drain', this.#onDrain);
    this.#stream.off('error', this.#onStreamError);
  }

  #push(chunk: string, lines: number): void {
    if (this.#broken) {
      this.#drop(lines);
      return;
    }
    if (!this.#writable) {
      this.#hold(chunk, lines);
      return;
    }
    this.#writeNow(chunk, lines);
  }

  #writeNow(chunk: string, lines: number): void {
    const announced = this.#unannouncedDrops;
    const payload = announced > 0 ? this.#dropNotice(announced) + chunk : chunk;
    try {
      const accepted = this.#stream.write(payload);
      this.#unannouncedDrops -= announced;
      if (!accepted) {
        // Already buffered by the stream; anything further is held here, where
        // there is a bound, rather than there, where there is not.
        this.#writable = false;
      }
    } catch (error) {
      this.#drop(lines);
      this.#report(error);
    }
  }

  #hold(chunk: string, lines: number): void {
    const bytes = Buffer.byteLength(chunk);
    if (this.#heldBytes + bytes > this.#maxBufferBytes) {
      // Discarding the newest rather than evicting the oldest, which is what
      // `FileTransport` does when a write fails: holding a growing backlog
      // against a sink that is not draining is how a logger takes down the
      // service it was meant to observe.
      this.#drop(lines);
      return;
    }
    this.#held.push({ text: chunk, lines, bytes });
    this.#heldBytes += bytes;
  }

  /** Everything held goes out as one write, since it is all bound for one place. */
  #releaseHeld(): void {
    if (this.#held.length === 0) return;
    const held = this.#held;
    this.#held = [];
    this.#heldBytes = 0;
    const lines = held.reduce((total, each) => total + each.lines, 0);
    this.#writeNow(held.map((each) => each.text).join(''), lines);
  }

  #dropNotice(count: number): string {
    return `${safeStringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message: `stream transport dropped ${count} log entries`,
      droppedEntries: count,
    })}\n`;
  }

  #drop(count: number): void {
    this.#droppedTotal += count;
    this.#unannouncedDrops += count;
  }

  /**
   * A failing sink must not surface as an exception in the code path that happened
   * to log a line, so this reports and returns. Without a handler the first failure
   * is reported once and the rest suppressed, which is what `Logger` does for a
   * throwing transport.
   */
  #report(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (this.#onError) {
      this.#onError(err);
      return;
    }
    if (this.#reported) return;
    this.#reported = true;
    console.error(
      `[@arkv/logger] StreamTransport write failed and was ignored: ${err.message}. Further failures are suppressed.`,
    );
  }
}
