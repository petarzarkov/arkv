import { describe, expect, it } from 'bun:test';
import { Writable } from 'node:stream';
import { StreamTransport } from './stream.js';
import { LogLevel, type LogEntry } from './types.js';

/**
 * A stream that accepts one chunk and then holds its callback, so `write()`
 * returns `false` and stays that way until the test releases it. That is what a
 * socket to a collector that stopped reading looks like.
 */
class BlockingStream extends Writable {
  readonly written: string[] = [];
  #release: (() => void) | undefined;

  constructor() {
    super({ highWaterMark: 1 });
  }

  override _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: () => void,
  ): void {
    this.written.push(String(chunk));
    this.#release = callback;
  }

  get blocked(): boolean {
    return this.#release !== undefined;
  }

  release(): void {
    const release = this.#release;
    this.#release = undefined;
    release?.();
  }
}

const entry = (message: string): LogEntry => ({ message });
const tick = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('StreamTransport backpressure', () => {
  it('stops writing once the stream says it is full', async () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream);

    transport.write(entry('one'), LogLevel.INFO);
    await tick();
    expect(stream.blocked).toBe(true);

    // Everything after the refusal is held here rather than in the stream.
    for (let at = 0; at < 50; at += 1) {
      transport.write(entry(`held ${at}`), LogLevel.INFO);
    }

    expect(stream.written).toHaveLength(1);
    expect(transport.queuedBytes).toBeGreaterThan(0);
    transport.close();
  });

  it('sends what it held once the stream drains', async () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream);

    transport.write(entry('first'), LogLevel.INFO);
    await tick();
    transport.write(entry('second'), LogLevel.INFO);
    transport.write(entry('third'), LogLevel.INFO);
    expect(stream.written).toHaveLength(1);

    stream.release();
    await tick();

    const all = stream.written.join('');
    expect(all).toContain('second');
    expect(all).toContain('third');
    expect(transport.queuedBytes).toBe(0);
    transport.close();
  });

  it('bounds what it holds, and counts what it discarded', async () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream, { maxBufferBytes: 512 });

    transport.write(entry('opening'), LogLevel.INFO);
    await tick();
    for (let at = 0; at < 500; at += 1) {
      transport.write(entry(`flood ${at}`), LogLevel.INFO);
    }

    // The reservoir is capped rather than growing to hold all 500.
    expect(transport.queuedBytes).toBeLessThanOrEqual(512);
    expect(transport.droppedCount).toBeGreaterThan(0);
    transport.close();
  });

  it('says in-band that it dropped, rather than dropping silently', async () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream, { maxBufferBytes: 256 });

    transport.write(entry('opening'), LogLevel.INFO);
    await tick();
    for (let at = 0; at < 200; at += 1) {
      transport.write(entry(`flood ${at}`), LogLevel.INFO);
    }
    stream.release();
    await tick();

    const all = stream.written.join('');
    expect(all).toContain('droppedEntries');
    transport.close();
  });

  it('reports a stream error instead of letting it reach the process', async () => {
    const stream = new BlockingStream();
    const failures: Error[] = [];
    const transport = new StreamTransport(stream, {
      onError: (error) => failures.push(error),
    });

    transport.write(entry('one'), LogLevel.INFO);
    // Unhandled, this is an uncaught 'error' event and the process goes down.
    stream.emit('error', new Error('socket hung up'));
    await tick();

    expect(failures.map((error) => error.message)).toEqual(['socket hung up']);
    transport.close();
  });

  it('stops queueing for a stream that has errored', async () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream, { onError: () => undefined });

    transport.write(entry('one'), LogLevel.INFO);
    await tick();
    stream.emit('error', new Error('gone'));

    for (let at = 0; at < 20; at += 1) {
      transport.write(entry(`after ${at}`), LogLevel.INFO);
    }

    expect(transport.queuedBytes).toBe(0);
    expect(transport.droppedCount).toBe(20);
    transport.close();
  });

  it('leaves the stream unended, because it belongs to the caller', () => {
    const stream = new BlockingStream();
    const transport = new StreamTransport(stream);

    transport.write(entry('one'), LogLevel.INFO);
    transport.close();

    expect(stream.writableEnded).toBe(false);
    expect(stream.listenerCount('drain')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
  });
});
