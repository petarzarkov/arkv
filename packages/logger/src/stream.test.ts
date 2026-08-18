import { describe, expect, it } from 'bun:test';
import { Writable } from 'node:stream';
import { Logger } from './logger.js';
import { StreamTransport } from './stream.js';
import { LogLevel } from './types.js';

const sink = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  return {
    chunks,
    stream,
    get writes() {
      return chunks.length;
    },
  };
};

const lines = (chunks: string[]): string[] =>
  chunks.join('').split('\n').filter(Boolean);

describe('StreamTransport', () => {
  it('writes one line per entry, unbuffered by default', () => {
    const { chunks, stream } = sink();
    const logger = new Logger(
      { level: LogLevel.INFO, transports: [new StreamTransport(stream)] },
      undefined,
    );

    logger.info('one');
    logger.info('two');

    // Unbuffered is one stream write per entry, which is what makes it lossless.
    expect(chunks.length).toBe(2);
    expect(lines(chunks).length).toBe(2);
    expect(JSON.parse(lines(chunks)[0] ?? '{}').message).toBe('one');
  });

  it('batches until the byte threshold, then writes once', () => {
    const { chunks, stream } = sink();
    const transport = new StreamTransport(stream, {
      bufferBytes: 4096,
      flushIntervalMs: 0,
      flushOnExit: false,
    });
    const logger = new Logger(
      { level: LogLevel.INFO, transports: [transport] },
      undefined,
    );

    logger.info('one');
    logger.info('two');

    expect(chunks.length).toBe(0);
    expect(transport.pendingBytes).toBeGreaterThan(0);

    transport.flush();

    // One write carrying both lines, which is the syscall the batching saves.
    expect(chunks.length).toBe(1);
    expect(lines(chunks).length).toBe(2);
    expect(transport.pendingBytes).toBe(0);
  });

  it('flushes on its own once the threshold is crossed', () => {
    const { chunks, stream } = sink();
    const transport = new StreamTransport(stream, {
      bufferBytes: 32,
      flushIntervalMs: 0,
      flushOnExit: false,
    });

    new Logger(
      { level: LogLevel.INFO, transports: [transport] },
      undefined,
    ).info('a message long enough to pass thirty two bytes on its own');

    expect(chunks.length).toBe(1);
    expect(transport.pendingBytes).toBe(0);
  });

  /*
   * `FileTransport` takes the same three options with the same defaults. Two
   * buffered transports that disagreed about when they flush would be the real
   * hazard of having two, so this pins the shape rather than sharing the code.
   */
  it('takes the same buffering options as FileTransport, with the same defaults', () => {
    const { chunks, stream } = sink();
    const written = new StreamTransport(stream);
    new Logger({ level: LogLevel.INFO, transports: [written] }, undefined).info(
      'x',
    );

    // bufferBytes defaults to 0, so nothing is pending and the line is out.
    expect(written.pendingBytes).toBe(0);
    expect(chunks.length).toBe(1);
  });

  it('flush is a no-op with nothing pending', () => {
    const { chunks, stream } = sink();
    const transport = new StreamTransport(stream, { bufferBytes: 4096 });

    transport.flush();
    transport.flush();

    expect(chunks.length).toBe(0);
  });

  it('close flushes and leaves the stream open for its owner', () => {
    const { chunks, stream } = sink();
    const transport = new StreamTransport(stream, {
      bufferBytes: 4096,
      flushOnExit: false,
    });
    new Logger(
      { level: LogLevel.INFO, transports: [transport] },
      undefined,
    ).info('pending');

    transport.close();

    expect(lines(chunks).length).toBe(1);
    // The caller owns the stream: `process.stdout` must not be ended at all.
    expect(stream.writableEnded).toBe(false);
  });

  it('reports a failing stream instead of throwing into the caller', () => {
    const failing = new Writable({
      write() {
        throw new Error('pipe gone');
      },
    });
    const seen: Error[] = [];
    const logger = new Logger(
      {
        level: LogLevel.INFO,
        transports: [
          new StreamTransport(failing, {
            onError: (error) => seen.push(error),
          }),
        ],
      },
      undefined,
    );

    expect(() => logger.info('into the void')).not.toThrow();
    expect(seen[0]?.message).toBe('pipe gone');
  });

  it('honours its own level, independent of the logger', () => {
    const { chunks, stream } = sink();
    const logger = new Logger(
      {
        level: LogLevel.DEBUG,
        transports: [new StreamTransport(stream, { level: LogLevel.ERROR })],
      },
      undefined,
    );

    logger.debug('quiet');
    logger.error('loud');

    expect(lines(chunks).length).toBe(1);
    expect(JSON.parse(lines(chunks)[0] ?? '{}').message).toBe('loud');
  });
});
