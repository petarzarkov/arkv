import { describe, expect, it, spyOn } from 'bun:test';
import { ContextStore } from './context.js';
import { captureGlobalErrors } from './errors.js';
import { Logger } from './logger.js';
import { MemoryTransport, parseLogEntry } from './testing.js';
import { ConsoleTransport } from './transport.js';
import { type LogEntry, LogLevel, type Transport } from './types.js';

/**
 * `LogEntry.error` is typed as the `Error` the caller passed in, but what lands
 * in an entry is the serialized `{ name, message, stack }`. Reading fields
 * through a plain record keeps the assertions honest without a cast per line.
 */
function raw(entry: LogEntry | undefined): Record<string, unknown> {
  return (entry ?? {}) as Record<string, unknown>;
}

function errorOf(entry: LogEntry | undefined): Record<string, unknown> {
  return (raw(entry).error ?? {}) as Record<string, unknown>;
}

describe('info / log', () => {
  it('emits level "info", not NestJS\'s "log"', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).info('hello');

    expect(memory.last?.level).toBe('info');
    expect(memory.last?.message).toBe('hello');
  });

  it('routes the deprecated log alias through info', () => {
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] });
    const spy = spyOn(logger, 'info');

    logger.log('hello', { a: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(memory.last?.level).toBe('info');
    expect(memory.last?.a).toBe(1);
  });

  // The bare-Error overload used to take one argument, so `warn(err, {…})` was
  // a type error and the caller had to drop either the error or the fields.
  it('accepts an Error plus extra fields on every level', () => {
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] });
    const err = new Error('boom');

    logger.warn(err, { attempt: 3 });
    expect(memory.last?.attempt).toBe(3);
    expect(errorOf(memory.last).message).toBe('boom');

    logger.error(err, { attempt: 4 });
    expect(memory.last?.attempt).toBe(4);

    logger.info({ action: 'x' }, { attempt: 5 });
    expect(memory.last?.attempt).toBe(5);
    expect(memory.last?.action).toBe('x');
  });
});

describe('reserved entry keys', () => {
  it('keeps the entry level when a caller supplies one', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).debug('msg', { level: 'x' });

    expect(memory.last?.level).toBe('debug');
    expect(memory.last?.reservedFieldConflicts).toEqual({ level: 'x' });
  });

  it('protects timestamp, pid, message and appId too', () => {
    const memory = new MemoryTransport();
    const logger = new Logger({
      name: 'app',
      version: '1.0.0',
      env: 'test',
      transports: [memory],
    });

    logger.info('real message', {
      timestamp: 'nope',
      pid: -1,
      message: 'hijacked',
      appId: 'other',
    });

    expect(memory.last?.message).toBe('real message');
    expect(memory.last?.appId).toBe('app-1.0.0-test');
    expect(memory.last?.pid).toBe(process.pid);
    expect(memory.last?.timestamp).not.toBe('nope');
    expect(memory.last?.reservedFieldConflicts).toEqual({
      timestamp: 'nope',
      pid: -1,
      message: 'hijacked',
      appId: 'other',
    });
  });

  it('does not report a conflict when there is none', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).info('msg', { orderId: 1 });

    expect(memory.last?.reservedFieldConflicts).toBeUndefined();
  });

  it('leaves a caller error field alone when no Error was extracted', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).debug('msg', { error: 'a string' });

    expect(raw(memory.last).error).toBe('a string');
    expect(memory.last?.reservedFieldConflicts).toBeUndefined();
  });

  it('does not double-report the error it serialized', () => {
    const memory = new MemoryTransport();
    const err = new Error('boom');
    new Logger({ transports: [memory] }).error({ error: err, code: 1 });

    expect(errorOf(memory.last).message).toBe('boom');
    expect(memory.last?.reservedFieldConflicts).toBeUndefined();
  });

  it('protects reserved keys coming from async context', () => {
    const store = new ContextStore();
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] }, store);

    store.runWithContext({ message: 'from-context' }, () => {
      logger.info('real');
    });

    expect(memory.last?.message).toBe('real');
    expect(memory.last?.reservedFieldConflicts).toEqual({
      message: 'from-context',
    });
  });
});

describe('null and undefined fields', () => {
  it('preserves null so "absent" is distinguishable from "never logged"', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).info('msg', {
      deletedAt: null,
      parentId: null,
    });

    expect(memory.last).toHaveProperty('deletedAt', null);
    expect(memory.last).toHaveProperty('parentId', null);
  });

  it('still drops undefined, which JSON cannot represent', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).info('msg', { missing: undefined });

    expect(memory.last).not.toHaveProperty('missing');
  });

  it('preserves null inside nested objects and arrays', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] }).info('msg', {
      user: { name: 'a', deletedAt: null },
    });

    expect(memory.last?.user).toEqual({ name: 'a', deletedAt: null });
  });
});

describe('transports', () => {
  it('defaults to a console transport', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {
      // silence
    });
    try {
      new Logger({ isDevelopment: false }).info('to stdout');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const entry = parseLogEntry(logSpy.mock.calls[0]?.[0] as string);
      expect(entry.message).toBe('to stdout');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('writes nothing to stdout or stderr when transports are supplied', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {
      // silence
    });
    const errSpy = spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
    try {
      const memory = new MemoryTransport();
      const logger = new Logger({ transports: [memory] });
      logger.info('quiet');
      logger.error('also quiet');

      expect(logSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
      expect(memory.entries).toHaveLength(2);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('gives each transport an independent level', () => {
    const chatty = new MemoryTransport({ level: LogLevel.DEBUG });
    const quiet = new MemoryTransport({ level: LogLevel.ERROR });
    const logger = new Logger({
      level: LogLevel.INFO,
      transports: [chatty, quiet],
    });

    logger.debug('d');
    logger.info('i');
    logger.error('e');

    expect(chatty.entries.map((entry) => entry.level)).toEqual([
      'debug',
      'info',
      'error',
    ]);
    expect(quiet.entries.map((entry) => entry.level)).toEqual(['error']);
  });

  it('sends warn and above to stderr', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {
      // silence
    });
    const errSpy = spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
    try {
      const logger = new Logger({
        transports: [new ConsoleTransport({ pretty: false })],
      });
      logger.info('out');
      logger.warn('err');

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  // A full disk or an EACCES must degrade, not surface in the request path that
  // happened to log a line.
  it('isolates a throwing transport from the caller', () => {
    const failures: Error[] = [];
    const exploding: Transport = {
      write() {
        throw new Error('disk full');
      },
    };
    const memory = new MemoryTransport();
    const logger = new Logger({
      transports: [exploding, memory],
      onTransportError: (error) => failures.push(error),
    });

    expect(() => logger.info('still fine')).not.toThrow();
    expect(failures.map((error) => error.message)).toEqual(['disk full']);
    // The healthy transport still receives the entry.
    expect(memory.last?.message).toBe('still fine');
  });

  it('isolates a throwing flush and close', () => {
    const failures: Error[] = [];
    const exploding: Transport = {
      write() {
        // accepted
      },
      flush() {
        throw new Error('flush failed');
      },
      close() {
        throw new Error('close failed');
      },
    };
    const logger = new Logger({
      transports: [exploding],
      onTransportError: (error) => failures.push(error),
    });

    expect(() => logger.flush()).not.toThrow();
    expect(() => logger.close()).not.toThrow();
    expect(failures).toHaveLength(2);
  });

  it('forwards flush and close to every transport', () => {
    const calls: string[] = [];
    const recorder: Transport = {
      write() {
        // accepted
      },
      flush: () => calls.push('flush'),
      close: () => calls.push('close'),
    };

    const logger = new Logger({ transports: [recorder] });
    logger.flush();
    logger.close();

    expect(calls).toEqual(['flush', 'flush', 'close']);
  });

  it('logs nothing when the transport list is empty', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {
      // silence
    });
    try {
      new Logger({ transports: [] }).fatal('nowhere');
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('child loggers', () => {
  it('merges bindings into every entry', () => {
    const memory = new MemoryTransport();
    const root = new Logger({ transports: [memory] });
    const child = root.child({ component: 'db' });

    child.info('query');

    expect(memory.last?.component).toBe('db');
  });

  it('lets per-call fields win over bindings', () => {
    const memory = new MemoryTransport();
    const child = new Logger({ transports: [memory] }).child({
      component: 'db',
    });

    child.info('query', { component: 'cache' });

    expect(memory.last?.component).toBe('cache');
  });

  it('shares the parent transports and leaves the parent unbound', () => {
    const memory = new MemoryTransport();
    const root = new Logger({ transports: [memory] });
    const child = root.child({ component: 'db' });

    child.info('a');
    root.info('b');

    expect(memory.entries[0]?.component).toBe('db');
    expect(memory.entries[1]?.component).toBeUndefined();
    expect(root.transports[0]).toBe(memory);
  });

  it('nests bindings across generations', () => {
    const memory = new MemoryTransport();
    new Logger({ transports: [memory] })
      .child({ component: 'db' })
      .child({ table: 'users' })
      .info('query');

    expect(memory.last?.component).toBe('db');
    expect(memory.last?.table).toBe('users');
  });
});

describe('parseLogEntry', () => {
  it('parses colored development output', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {
      // silence
    });
    try {
      // Forced on because colour is now gated on isColorSupported() and a test
      // process is not a TTY. This is about parsing coloured output, so it needs
      // some.
      process.env['FORCE_COLOR'] = '1';
      new Logger({ isDevelopment: true }).info('colored', { a: 1 });
      const raw = logSpy.mock.calls[0]?.[0] as string;

      // eslint-disable-next-line no-control-regex
      expect(raw).toMatch(/\[[0-9;]*m/);
      expect(parseLogEntry(raw).message).toBe('colored');
      expect(parseLogEntry(raw).a).toBe(1);
    } finally {
      delete process.env['FORCE_COLOR'];
      logSpy.mockRestore();
    }
  });
});

describe('captureGlobalErrors', () => {
  it('logs an unhandled rejection and can be removed again', () => {
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] });
    const before = process.listenerCount('unhandledRejection');

    const stop = captureGlobalErrors(logger, { exitOnUncaught: false });
    expect(process.listenerCount('unhandledRejection')).toBe(before + 1);

    process.emit('unhandledRejection', new Error('nope'), Promise.resolve());

    expect(memory.last?.level).toBe('error');
    expect(memory.last?.message).toBe('Unhandled rejection');
    expect(errorOf(memory.last).message).toBe('nope');

    stop();
    expect(process.listenerCount('unhandledRejection')).toBe(before);
  });

  it('logs an uncaught exception at fatal without exiting when asked', () => {
    const memory = new MemoryTransport();
    const logger = new Logger({ transports: [memory] });
    const stop = captureGlobalErrors(logger, { exitOnUncaught: false });

    try {
      process.emit('uncaughtException', new Error('kaboom'));

      expect(memory.last?.level).toBe('fatal');
      expect(errorOf(memory.last).message).toBe('kaboom');
    } finally {
      stop();
    }
  });
});
