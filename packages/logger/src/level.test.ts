import { describe, expect, it } from 'bun:test';
import { Logger } from './logger.js';
import { MemoryTransport } from './testing.js';
import { LogLevel } from './types.js';

const messages = (sink: MemoryTransport): unknown[] =>
  sink.entries.map((entry) => entry.message);

describe('setLevel', () => {
  it('turns debug on against a logger that was already built', () => {
    const sink = new MemoryTransport();
    const logger = new Logger({ level: LogLevel.INFO, transports: [sink] });

    logger.debug('before');
    logger.setLevel(LogLevel.DEBUG);
    logger.debug('after');

    expect(messages(sink)).toEqual(['after']);
    expect(logger.logLevel).toBe(LogLevel.DEBUG);
  });

  it('reaches the children, which is the point of turning it on', () => {
    const sink = new MemoryTransport();
    const root = new Logger({ level: LogLevel.INFO, transports: [sink] });
    const child = root.child({ module: 'db' });
    const grandchild = child.child({ table: 'orders' });

    root.setLevel(LogLevel.DEBUG);
    child.debug('child line');
    grandchild.debug('grandchild line');

    expect(messages(sink)).toEqual(['child line', 'grandchild line']);
  });

  it('reaches a child made before the change and one made after', () => {
    const sink = new MemoryTransport();
    const root = new Logger({ level: LogLevel.INFO, transports: [sink] });
    const before = root.child({ when: 'before' });

    root.setLevel(LogLevel.DEBUG);
    const after = root.child({ when: 'after' });

    before.debug('a');
    after.debug('b');
    expect(messages(sink)).toEqual(['a', 'b']);
  });

  it('raises the floor as well as lowering it', () => {
    const sink = new MemoryTransport();
    const logger = new Logger({ level: LogLevel.DEBUG, transports: [sink] });

    logger.setLevel(LogLevel.ERROR);
    logger.warn('dropped');
    logger.error('kept');

    expect(messages(sink)).toEqual(['kept']);
  });

  it('leaves a transport that named its own level where it was', () => {
    const quiet = new MemoryTransport({ level: LogLevel.ERROR });
    const following = new MemoryTransport();
    const logger = new Logger({
      level: LogLevel.INFO,
      transports: [quiet, following],
    });

    logger.setLevel(LogLevel.DEBUG);
    logger.debug('verbose detail');

    // The one with an explicit level is unmoved; the one inheriting follows.
    expect(messages(quiet)).toEqual([]);
    expect(messages(following)).toEqual(['verbose detail']);
  });

  it('still refuses everything when there are no transports', () => {
    const logger = new Logger({ transports: [] });

    logger.setLevel(LogLevel.VERBOSE);

    expect(() => {
      logger.fatal('nowhere to go');
    }).not.toThrow();
  });
});
