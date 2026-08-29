import { describe, expect, it } from 'bun:test';
import {
  BatchTransport,
  type BatchedEntry,
  type BatchTransportOptions,
} from './batch.js';
import { Logger } from './logger.js';
import { LogLevel, type LogEntry } from './types.js';

interface RecordingOptions extends BatchTransportOptions {
  /** Reject this many sends before the first one is allowed through. */
  failFirst?: number;
  /** Reject every send with this, which `retryable` will refuse to repeat. */
  fatal?: boolean;
}

class RecordingTransport extends BatchTransport {
  readonly batches: BatchedEntry[][] = [];
  attempts = 0;
  #failFirst: number;
  #fatal: boolean;

  constructor(options: RecordingOptions = {}) {
    super({ flushIntervalMs: 0, retryBaseMs: 1, ...options });
    this.#failFirst = options.failFirst ?? 0;
    this.#fatal = options.fatal ?? false;
  }

  protected override async deliver(
    batch: readonly BatchedEntry[],
  ): Promise<void> {
    this.attempts += 1;
    if (this.#fatal) {
      throw new Error('rejected');
    }
    if (this.#failFirst > 0) {
      this.#failFirst -= 1;
      throw new Error('collector unreachable');
    }
    await Promise.resolve();
    this.batches.push([...batch]);
  }

  protected override retryable(error: unknown): boolean {
    return (error as Error).message !== 'rejected';
  }

  get sent(): unknown[] {
    return this.batches.flat().map((each) => each.entry.message);
  }
}

const entry = (message: string): LogEntry => ({ message });

describe('BatchTransport', () => {
  it('holds entries until the batch is full', async () => {
    const transport = new RecordingTransport({ batchSize: 3 });

    transport.write(entry('one'), LogLevel.INFO);
    transport.write(entry('two'), LogLevel.INFO);
    expect(transport.queuedCount).toBe(2);
    expect(transport.batches).toHaveLength(0);

    transport.write(entry('three'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.sent).toEqual(['one', 'two', 'three']);
  });

  it('sends a partial batch when asked to drain', async () => {
    const transport = new RecordingTransport({ batchSize: 100 });

    transport.write(entry('lonely'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.sent).toEqual(['lonely']);
    expect(transport.queuedCount).toBe(0);
  });

  it('splits a backlog into batches of the size it was given', async () => {
    const transport = new RecordingTransport({ batchSize: 10 });

    for (let at = 0; at < 25; at += 1) {
      transport.write(entry(`e${at}`), LogLevel.INFO);
    }
    await transport.flushAsync();

    expect(transport.batches.map((batch) => batch.length)).toEqual([10, 10, 5]);
  });

  it('retries a failed send and keeps the entries', async () => {
    const transport = new RecordingTransport({ batchSize: 2, failFirst: 2 });

    transport.write(entry('a'), LogLevel.INFO);
    transport.write(entry('b'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.attempts).toBe(3);
    expect(transport.sent).toEqual(['a', 'b']);
    expect(transport.droppedCount).toBe(0);
  });

  it('gives up after the retry budget and counts the loss', async () => {
    const transport = new RecordingTransport({
      batchSize: 2,
      failFirst: 99,
      maxRetries: 2,
    });

    transport.write(entry('a'), LogLevel.INFO);
    transport.write(entry('b'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.attempts).toBe(3);
    expect(transport.droppedCount).toBe(2);
    expect(transport.errorCount).toBe(3);
  });

  it('does not retry a send the subclass calls unrepeatable', async () => {
    const transport = new RecordingTransport({ batchSize: 1, fatal: true });

    transport.write(entry('a'), LogLevel.INFO);
    await transport.flushAsync();

    expect(transport.attempts).toBe(1);
    expect(transport.droppedCount).toBe(1);
  });

  it('bounds the queue and discards the newest past it', async () => {
    const transport = new RecordingTransport({
      batchSize: 1000,
      maxQueueSize: 5,
    });

    for (let at = 0; at < 50; at += 1) {
      transport.write(entry(`e${at}`), LogLevel.INFO);
    }

    expect(transport.queuedCount).toBe(5);
    expect(transport.droppedCount).toBe(45);
    await transport.flushAsync();
    // The five that fit, behind the notice saying what did not.
    const kept = transport.batches
      .flat()
      .filter((each) => each.entry.droppedEntries === undefined)
      .map((each) => each.entry.message);
    expect(kept).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  it('announces a drop in the next batch rather than losing it silently', async () => {
    const transport = new RecordingTransport({
      batchSize: 1000,
      maxQueueSize: 2,
    });

    for (let at = 0; at < 10; at += 1) {
      transport.write(entry(`e${at}`), LogLevel.INFO);
    }
    await transport.flushAsync();

    const notices = transport.batches
      .flat()
      .filter((each) => each.entry.droppedEntries !== undefined);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.entry.droppedEntries).toBe(8);
  });

  it('keeps one send in flight, so batches leave in order', async () => {
    const transport = new RecordingTransport({ batchSize: 1 });

    for (let at = 0; at < 5; at += 1) {
      transport.write(entry(`e${at}`), LogLevel.INFO);
    }
    await transport.flushAsync();

    expect(transport.sent).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  it('drains on closeAsync and counts what a sync close throws away', async () => {
    const drained = new RecordingTransport({ batchSize: 1000 });
    drained.write(entry('kept'), LogLevel.INFO);
    await drained.closeAsync();
    expect(drained.sent).toEqual(['kept']);
    expect(drained.droppedCount).toBe(0);

    const abandoned = new RecordingTransport({ batchSize: 1000 });
    abandoned.write(entry('lost'), LogLevel.INFO);
    abandoned.close();
    expect(abandoned.sent).toEqual([]);
    expect(abandoned.droppedCount).toBe(1);
  });

  it('refuses writes once closed', () => {
    const transport = new RecordingTransport();
    transport.close();

    transport.write(entry('too late'), LogLevel.INFO);

    expect(transport.queuedCount).toBe(0);
    expect(transport.droppedCount).toBe(1);
  });

  it('reports what it is holding through the logger', async () => {
    const transport = new RecordingTransport({
      batchSize: 1000,
      maxQueueSize: 2,
    });
    const logger = new Logger({ transports: [transport] });

    for (let at = 0; at < 6; at += 1) {
      logger.info(`e${at}`);
    }

    expect(logger.stats()).toEqual([
      { name: 'RecordingTransport', dropped: 4, queued: 2, errors: 0 },
    ]);
    await logger.closeAsync();
  });

  it('is drained by Logger#flushAsync', async () => {
    const transport = new RecordingTransport({ batchSize: 1000 });
    const logger = new Logger({ transports: [transport] });

    logger.info('through the logger');
    expect(transport.sent).toEqual([]);

    await logger.flushAsync();
    expect(transport.sent).toEqual(['through the logger']);
  });

  it('does not let a rejecting transport reject the logger shutdown', async () => {
    const failures: Error[] = [];
    const transport = new RecordingTransport({
      batchSize: 1,
      failFirst: 99,
      maxRetries: 0,
      onError: (error) => failures.push(error),
    });
    const logger = new Logger({ transports: [transport] });

    logger.info('doomed');
    await logger.closeAsync();

    expect(failures).toHaveLength(1);
    expect(transport.droppedCount).toBe(1);
  });
});
