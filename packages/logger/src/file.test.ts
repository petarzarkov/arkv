import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from 'bun:test';
import { FileTransport, periodKey } from './file.js';
import { FileTransport as FileTransportFromEntry } from './index.js';
import { Logger } from './logger.js';
import { type LogEntry, LogLevel } from './types.js';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arkv-logger-'));
});

afterEach(() => {
  chmodSync(dir, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

function readEntries(path: string): LogEntry[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LogEntry);
}

function messages(path: string): string[] {
  return readEntries(path).map((entry) => String(entry.message));
}

describe('FileTransport', () => {
  // It used to live behind a `@arkv/logger/file` subpath, which existed only to
  // keep `node:fs` out of a browser module graph. The package is Node-only, so
  // the subpath is gone and one import is enough.
  it('is exported from the main entry', () => {
    expect(FileTransportFromEntry).toBe(FileTransport);
  });

  it('writes through on every entry by default', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path });

    transport.write({ level: 'info', message: 'one' }, LogLevel.INFO);

    expect(transport.pendingBytes).toBe(0);
    expect(readEntries(path)).toHaveLength(1);
    transport.close();
  });

  it('creates the directory it was pointed at', () => {
    const path = join(dir, 'nested', 'deeper', 'app.log');
    const transport = new FileTransport({ path });
    transport.write({ level: 'info', message: 'one' }, LogLevel.INFO);
    transport.close();

    expect(existsSync(path)).toBe(true);
  });

  it('appends to an existing file rather than truncating it', () => {
    const path = join(dir, 'app.log');
    writeFileSync(path, '{"message":"earlier"}\n');

    const transport = new FileTransport({ path });
    transport.write({ level: 'info', message: 'later' }, LogLevel.INFO);
    transport.close();

    expect(messages(path)).toEqual(['earlier', 'later']);
  });

  it('turns stdout off when it is the only transport', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path });
    const logger = new Logger({
      isDevelopment: false,
      transports: [transport],
    });

    logger.info('to file only');
    logger.close();

    expect(messages(path)).toEqual(['to file only']);
  });

  it('writes plain JSON even when the console is colored', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path });
    new Logger({ isDevelopment: true, transports: [transport] }).info('plain');
    transport.close();

    // eslint-disable-next-line no-control-regex
    expect(readFileSync(path, 'utf8')).not.toMatch(/\[[0-9;]*m/);
  });

  it('honours its own level independently of the console', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path, level: LogLevel.WARN });
    const logger = new Logger({
      level: LogLevel.DEBUG,
      transports: [transport],
    });

    logger.debug('noise');
    logger.warn('signal');
    logger.close();

    expect(messages(path)).toEqual(['signal']);
  });
});

describe('FileTransport rotation', () => {
  it('rotates at the size boundary without losing an entry', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path, maxSize: 300, maxFiles: 10 });

    for (let i = 0; i < 20; i += 1) {
      transport.write(
        { level: 'info', message: `entry-${i}`, filler: 'x'.repeat(40) },
        LogLevel.INFO,
      );
    }
    transport.close();

    expect(existsSync(`${path}.1`)).toBe(true);

    const seen: string[] = [];
    for (let i = 10; i >= 1; i -= 1) {
      const rotated = `${path}.${i}`;
      if (existsSync(rotated)) {
        seen.push(...messages(rotated));
      }
    }
    seen.push(...messages(path));

    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => `entry-${i}`));
  });

  it('keeps at most maxFiles rotated files', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path, maxSize: 100, maxFiles: 2 });

    for (let i = 0; i < 30; i += 1) {
      transport.write(
        { level: 'info', message: `entry-${i}`, filler: 'y'.repeat(40) },
        LogLevel.INFO,
      );
    }
    transport.close();

    expect(existsSync(`${path}.1`)).toBe(true);
    expect(existsSync(`${path}.2`)).toBe(true);
    expect(existsSync(`${path}.3`)).toBe(false);
  });

  it('rotates when the UTC hour changes', () => {
    const path = join(dir, 'app.log');
    setSystemTime(new Date('2024-05-01T10:30:00.000Z'));
    const transport = new FileTransport({ path, interval: 'hourly' });
    transport.write({ level: 'info', message: 'before' }, LogLevel.INFO);

    setSystemTime(new Date('2024-05-01T11:00:01.000Z'));
    transport.write({ level: 'info', message: 'after' }, LogLevel.INFO);
    transport.close();
    setSystemTime();

    expect(messages(`${path}.1`)).toEqual(['before']);
    expect(messages(path)).toEqual(['after']);
  });

  it('does not rotate within the same period', () => {
    const path = join(dir, 'app.log');
    setSystemTime(new Date('2024-05-01T10:00:00.000Z'));
    const transport = new FileTransport({ path, interval: 'daily' });
    transport.write({ level: 'info', message: 'a' }, LogLevel.INFO);

    setSystemTime(new Date('2024-05-01T23:59:59.000Z'));
    transport.write({ level: 'info', message: 'b' }, LogLevel.INFO);
    transport.close();
    setSystemTime();

    expect(existsSync(`${path}.1`)).toBe(false);
    expect(messages(path)).toEqual(['a', 'b']);
  });
});

describe('FileTransport buffering and flushing', () => {
  it('holds entries until the buffer threshold is reached', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      bufferBytes: 4096,
      flushIntervalMs: 0,
      flushOnExit: false,
    });

    transport.write({ level: 'info', message: 'buffered' }, LogLevel.INFO);

    expect(transport.pendingBytes).toBeGreaterThan(0);
    expect(readFileSync(path, 'utf8')).toBe('');

    transport.flush();

    expect(transport.pendingBytes).toBe(0);
    expect(messages(path)).toEqual(['buffered']);
    transport.close();
  });

  // Backpressure: the buffer is bounded by bufferBytes, so a burst blocks in a
  // writeSync at the boundary instead of growing an unbounded queue. Nothing is
  // dropped.
  it('never lets the buffer grow past bufferBytes', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      bufferBytes: 512,
      flushIntervalMs: 0,
      flushOnExit: false,
    });

    let peak = 0;
    for (let i = 0; i < 200; i += 1) {
      transport.write(
        { level: 'info', message: `entry-${i}`, filler: 'z'.repeat(30) },
        LogLevel.INFO,
      );
      peak = Math.max(peak, transport.pendingBytes);
    }
    transport.close();

    expect(peak).toBeLessThan(512 + 200);
    expect(readEntries(path)).toHaveLength(200);
    expect(transport.droppedCount).toBe(0);
  });

  it('flushes and closes through the logger', () => {
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      bufferBytes: 4096,
      flushIntervalMs: 0,
      flushOnExit: false,
    });
    const logger = new Logger({ transports: [transport] });

    logger.info('one');
    expect(readFileSync(path, 'utf8')).toBe('');

    logger.flush();
    expect(readEntries(path)).toHaveLength(1);

    logger.close();
    logger.info('after close');
    expect(readEntries(path)).toHaveLength(1);
  });

  // process.on('exit') cannot await, which is the whole reason the transport
  // writes synchronously. Without the exit hook this file stays empty.
  it('flushes a buffered entry when the process exits', () => {
    const path = join(dir, 'app.log');
    const script = join(dir, 'exit-fixture.ts');
    writeFileSync(
      script,
      [
        `import { FileTransport } from ${JSON.stringify(join(SRC_DIR, 'file.ts'))};`,
        `const t = new FileTransport({ path: ${JSON.stringify(path)}, bufferBytes: 65536, flushIntervalMs: 60000 });`,
        `t.write({ level: 'info', message: 'unflushed' }, 'info');`,
        `if (t.pendingBytes === 0) { throw new Error('fixture flushed too early'); }`,
        '',
      ].join('\n'),
    );

    execFileSync(process.execPath, [script], { stdio: 'pipe' });

    expect(messages(path)).toEqual(['unflushed']);
  });
});

describe('FileTransport failure handling', () => {
  it('degrades instead of throwing when the path cannot be opened', () => {
    const failures: Error[] = [];
    // A directory cannot be opened for appending.
    const transport = new FileTransport({
      path: dir,
      onError: (error) => failures.push(error),
    });
    const logger = new Logger({ transports: [transport] });

    expect(() => logger.info('never lands')).not.toThrow();
    expect(transport.errorCount).toBeGreaterThan(0);
    expect(transport.droppedCount).toBe(1);
    expect(failures).not.toHaveLength(0);
  });

  it('survives a write failure, counts the loss and announces it later', () => {
    const path = join(dir, 'app.log');
    const failures: Error[] = [];
    // maxSize 1 makes every write after the first attempt a rotation.
    const transport = new FileTransport({
      path,
      maxSize: 1,
      onError: (error) => failures.push(error),
    });
    const logger = new Logger({ transports: [transport] });

    logger.info('first');

    // A read-only directory makes the rename inside rotation fail with EACCES.
    chmodSync(dir, 0o500);
    expect(() => logger.info('lost')).not.toThrow();
    expect(transport.droppedCount).toBe(1);
    expect(transport.errorCount).toBe(1);
    expect(failures).toHaveLength(1);

    chmodSync(dir, 0o700);
    logger.info('recovered');
    logger.close();

    const all = [...messages(`${path}.1`), ...messages(path)];
    expect(all).toContain('first');
    expect(all).toContain('recovered');
    expect(all).toContain('file transport dropped 1 log entries');
  });
});

describe('periodKey', () => {
  // 2026-08-29T23:30:00Z. In any zone east of UTC this is already the 30th
  // locally, which is the whole difference the `utc` option controls.
  const at = new Date(Date.UTC(2026, 7, 29, 23, 30));

  it('buckets by the UTC day and hour', () => {
    expect(periodKey('daily', true, at)).toBe('2026-08-29');
    expect(periodKey('hourly', true, at)).toBe('2026-08-29T23');
  });

  it('buckets by the host clock when told not to follow UTC', () => {
    const local = periodKey('daily', false, at);
    const expected = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

    expect(local).toBe(expected);
    expect(periodKey('hourly', false, at)).toBe(
      `${expected}T${String(at.getHours()).padStart(2, '0')}`,
    );
  });

  it('is empty with no interval, so nothing rotates on time', () => {
    expect(periodKey(undefined, true, at)).toBe('');
  });
});

describe('date-stamped rotation', () => {
  it('names a rotated file for the period it holds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkv-datenaming-'));
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      naming: 'date',
      maxSize: 1,
    });

    transport.write({ message: 'first' }, LogLevel.INFO);
    transport.write({ message: 'second' }, LogLevel.INFO);
    transport.close();

    const rotated = readdirSync(dir).filter((name) => name !== 'app.log');
    expect(rotated).toHaveLength(1);
    // `app.log.2026-08-29`, not `app.log.1`.
    expect(rotated[0]).toMatch(/^app\.log\.\d{4}-\d{2}-\d{2}$/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('suffixes a second rotation inside the same period', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkv-datenaming-'));
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path, naming: 'date', maxSize: 1 });

    for (let at = 0; at < 4; at += 1) {
      transport.write({ message: `entry ${at}` }, LogLevel.INFO);
    }
    transport.close();

    const rotated = readdirSync(dir)
      .filter((name) => name !== 'app.log')
      .sort();
    expect(rotated.length).toBeGreaterThan(1);
    expect(rotated.some((name) => /\.\d{4}-\d{2}-\d{2}\.\d+$/.test(name))).toBe(
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps only maxFiles of them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkv-datenaming-'));
    const path = join(dir, 'app.log');
    const transport = new FileTransport({
      path,
      naming: 'date',
      maxSize: 1,
      maxFiles: 2,
    });

    for (let at = 0; at < 8; at += 1) {
      transport.write({ message: `entry ${at}` }, LogLevel.INFO);
    }
    transport.close();

    const rotated = readdirSync(dir).filter((name) => name !== 'app.log');
    expect(rotated).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('still shifts a numbered chain under the default naming', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkv-seqnaming-'));
    const path = join(dir, 'app.log');
    const transport = new FileTransport({ path, maxSize: 1, maxFiles: 3 });

    for (let at = 0; at < 3; at += 1) {
      transport.write({ message: `entry ${at}` }, LogLevel.INFO);
    }
    transport.close();

    expect(existsSync(`${path}.1`)).toBe(true);
    expect(existsSync(`${path}.2`)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
