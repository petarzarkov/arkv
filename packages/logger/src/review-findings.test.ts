import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { FileTransport } from './file.js';
import { Logger } from './logger.js';
import { StreamTransport } from './stream.js';
import { SyslogTransport } from './syslog.js';
import { MemoryTransport } from './testing.js';
import { LogLevel, type LogEntry } from './types.js';

const dirs: string[] = [];
const workspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'arkv-review-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('a field literally named __proto__', () => {
  it('is logged as a field and does not become the entry prototype', () => {
    const sink = new MemoryTransport();
    const logger = new Logger({ transports: [sink] });

    // What `logger.info('req', JSON.parse(body))` reaches with a hostile body.
    logger.info(
      'request',
      JSON.parse('{"__proto__":{"polluted":true},"ok":1}'),
    );

    const entry = sink.last as LogEntry;
    expect(entry.ok).toBe(1);
    // Logged, not merely "not exploited": a field named `__proto__` is a field.
    expect(Object.hasOwn(entry, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(entry, '__proto__')?.value).toEqual({
      polluted: true,
    });
    expect(JSON.stringify(entry)).toContain('__proto__');
    // And the prototype of nothing has moved.
    expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
    expect(
      (Object.prototype as unknown as { polluted?: unknown }).polluted,
    ).toBeUndefined();
  });

  it('leaves the prototype alone when it arrives through a binding', () => {
    const sink = new MemoryTransport();
    const logger = new Logger({
      bindings: JSON.parse('{"__proto__":{"polluted":true},"service":"api"}'),
      transports: [sink],
    });

    logger.info('booted');

    const entry = sink.last as LogEntry;
    expect(entry.service).toBe('api');
    expect(Object.hasOwn(entry, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(entry)).toBe(Object.prototype);
    expect(
      (Object.prototype as unknown as { polluted?: unknown }).polluted,
    ).toBeUndefined();
  });
});

describe('StreamTransport close', () => {
  class Blocked extends Writable {
    readonly received: string[] = [];
    constructor() {
      super({ highWaterMark: 1 });
    }
    override _write(chunk: Buffer | string, _e: string, _cb: () => void): void {
      // Never calls back, so the stream stays full after the first chunk.
      this.received.push(String(chunk));
    }
  }

  it('hands what it was holding to the stream instead of abandoning it', async () => {
    const stream = new Blocked();
    const transport = new StreamTransport(stream);

    transport.write({ message: 'one' }, LogLevel.INFO);
    await new Promise((resolve) => setImmediate(resolve));
    for (let at = 0; at < 5; at += 1) {
      transport.write({ message: `held ${at}` }, LogLevel.INFO);
    }
    expect(transport.queuedBytes).toBeGreaterThan(0);

    transport.close();

    // `close()` used to remove the `drain` listener with entries still held, so
    // they reached neither the stream nor the drop count. A refusal means
    // "buffered, slow down", not "rejected", so handing them over is the answer.
    // They land in the stream's own buffer, since its first write is outstanding.
    expect(transport.queuedBytes).toBe(0);
    expect(transport.droppedCount).toBe(0);
    expect(stream.writableLength).toBeGreaterThan(0);
  });

  it('counts them instead when the stream cannot take them', async () => {
    const stream = new Blocked();
    const transport = new StreamTransport(stream, { onError: () => undefined });

    transport.write({ message: 'one' }, LogLevel.INFO);
    await new Promise((resolve) => setImmediate(resolve));
    for (let at = 0; at < 5; at += 1) {
      transport.write({ message: `held ${at}` }, LogLevel.INFO);
    }
    stream.destroy();
    transport.close();

    expect(transport.queuedBytes).toBe(0);
    expect(transport.stats().dropped).toBe(5);
  });
});

describe('SyslogTransport', () => {
  it('counts an oversized message as dropped rather than losing it quietly', async () => {
    const transport = new SyslogTransport({
      port: 1,
      flushIntervalMs: 0,
      maxMessageBytes: 480,
    });

    transport.write({ message: 'x'.repeat(4000) }, LogLevel.INFO);
    await transport.flushAsync();

    // Refusing to send it is still losing it, and `stats()` has to say so.
    expect(transport.droppedCount).toBe(1);
    expect(transport.stats().dropped).toBe(1);
    transport.close();
  });

  it('keeps an epoch timestamp rather than relabelling with the ship time', () => {
    const transport = new SyslogTransport({ flushIntervalMs: 0 });
    const at = Date.UTC(2026, 7, 29, 6, 50, 27);

    const line = transport.format(
      { message: 'x', timestamp: at },
      LogLevel.INFO,
    );

    expect(line).toContain('2026-08-29T06:50:27.000Z');
    transport.close();
  });

  it('measures the TCP frame, not just the line inside it', async () => {
    const entry = { message: 'x'.repeat(600) };
    const sizing = new SyslogTransport({ flushIntervalMs: 0 });
    const line = sizing.format(entry, LogLevel.INFO);
    sizing.close();

    // Exactly the line, so only the octet-count prefix can push it over. Above
    // 480 too, which is the floor the constructor clamps `maxMessageBytes` to.
    const limit = Buffer.byteLength(line);
    expect(limit).toBeGreaterThan(480);
    expect(Buffer.byteLength(`${limit} ${line}`)).toBeGreaterThan(limit);

    const transport = new SyslogTransport({
      protocol: 'tcp',
      host: '192.0.2.1',
      port: 514,
      flushIntervalMs: 0,
      maxRetries: 0,
      retryBaseMs: 1,
      connectTimeoutMs: 100,
      maxMessageBytes: limit,
      onError: () => undefined,
    });

    transport.write(entry, LogLevel.INFO);
    await transport.flushAsync();

    // Filtered out before sending, so it never tried to connect at all.
    expect(transport.errorCount).toBe(0);
    transport.close();
  }, 15_000);

  it('gives up on a connect that never answers', async () => {
    const failures: Error[] = [];
    const transport = new SyslogTransport({
      protocol: 'tcp',
      // Reserved and unroutable, so the connect hangs rather than being refused.
      host: '192.0.2.1',
      port: 514,
      flushIntervalMs: 0,
      maxRetries: 0,
      retryBaseMs: 1,
      connectTimeoutMs: 120,
      onError: (error) => failures.push(error),
    });

    transport.write({ message: 'into the void' }, LogLevel.INFO);
    const started = Date.now();
    await transport.flushAsync();

    // Without a deadline this waits on the OS, which is minutes.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(failures[0]?.message).toContain('timed out');
    expect(transport.droppedCount).toBe(1);
    transport.close();
  }, 15_000);
});

describe('date-stamped pruning', () => {
  it('keeps the newest by repeat counter, not by string order', () => {
    const dir = workspace();
    const path = join(dir, 'app.log');
    // Ten rotations of one period: `.10` must outrank `.2`, which a lexical
    // sort gets backwards.
    for (const suffix of ['', '.1', '.2', '.3', '.9', '.10', '.11']) {
      writeFileSync(`${path}.2026-08-29${suffix}`, 'x');
    }

    const transport = new FileTransport({
      path,
      naming: 'date',
      maxSize: 1,
      maxFiles: 3,
    });
    transport.write({ message: 'forces a rotation' }, LogLevel.INFO);
    transport.write({ message: 'and another' }, LogLevel.INFO);
    transport.close();

    const kept = readdirSync(dir)
      .filter((name) => name !== 'app.log')
      .sort();
    expect(kept).toHaveLength(3);
    // The highest counters survive; `.1` and `.2` are the ones that went.
    expect(kept.some((name) => name.endsWith('.11'))).toBe(true);
    expect(kept.some((name) => name.endsWith('.10'))).toBe(true);
    expect(kept.some((name) => name.endsWith('.1'))).toBe(false);
  });

  it('labels a size rotation with the period the file is in, not the one before', () => {
    const dir = workspace();
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      naming: 'date',
      interval: 'hourly',
      maxSize: 1,
    });

    transport.write({ message: 'first' }, LogLevel.INFO);
    transport.write({ message: 'second' }, LogLevel.INFO);
    transport.close();

    const rotated = readdirSync(dir).filter((name) => name !== 'app.log');
    // Hourly, so the stamp carries an hour. Before the fix this fell back to a
    // daily stamp because no interval rollover had happened yet.
    expect(rotated[0]).toMatch(/^app\.log\.\d{4}-\d{2}-\d{2}T\d{2}/);
  });
});
