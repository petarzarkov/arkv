import type { Writable } from 'node:stream';
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
  /** Called on a write failure. Without it the first is reported on `console.error`. */
  onError?: (error: Error) => void;
}

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
 * **The stream is the caller's.** `close()` flushes and releases this transport's
 * timer and exit hook; it does not end the stream, because the caller may still be
 * using it and `process.stdout` must not be ended at all.
 */
export class StreamTransport implements Transport {
  readonly level?: LogLevel;
  readonly #stream: Writable;
  readonly #format: LogFormatter;
  readonly #bufferBytes: number;
  readonly #onError?: (error: Error) => void;
  #buffer: string[] = [];
  #pending = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #exitHook: (() => void) | undefined;
  #reported = false;

  constructor(stream: Writable, options: StreamTransportOptions = {}) {
    this.#stream = stream;
    this.level = options.level;
    this.#format = options.format ?? jsonFormat;
    this.#bufferBytes = Math.max(0, options.bufferBytes ?? 0);
    this.#onError = options.onError;

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

  /** Bytes waiting in memory. Always `0` unless `bufferBytes` was set. */
  get pendingBytes(): number {
    return this.#pending;
  }

  write(entry: LogEntry, level: LogLevel): void {
    const line = `${this.#format(entry, level)}\n`;
    if (this.#bufferBytes === 0) {
      this.#push(line);
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
    this.#push(lines.join(''));
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
  }

  #push(chunk: string): void {
    try {
      this.#stream.write(chunk);
    } catch (error) {
      this.#report(error);
    }
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
