import { describe, expect, it } from 'bun:test';
import { LOG_LEVELS, type LoggerConfig, LogLevel } from './types.js';

describe('LogLevel', () => {
  // These strings are the wire format: they are written to the `level` field of
  // every log entry. `INFO`/`'info'` replaced NestJS's `LOG`/`'log'` so the
  // level name matches the `info()` method that emits it; nothing else moved.
  it('exposes exactly the six levels', () => {
    expect({ ...LogLevel }).toEqual({
      VERBOSE: 'verbose',
      DEBUG: 'debug',
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
      FATAL: 'fatal',
    });
  });

  it('has no LOG member left', () => {
    expect(LogLevel).not.toHaveProperty('LOG');
    expect(LOG_LEVELS).not.toContain('log');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LogLevel)).toBe(true);
    expect(() => {
      (LogLevel as unknown as Record<string, string>).ERROR = 'oops';
    }).toThrow();
    expect(LogLevel.ERROR).toBe('error');
  });

  it('lists LOG_LEVELS in ascending severity order', () => {
    expect(LOG_LEVELS).toEqual([
      'verbose',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
    expect(LOG_LEVELS).toEqual(Object.values(LogLevel));
  });

  it('works in both value and type position', () => {
    const level: LogLevel = LogLevel.WARN;
    const config: LoggerConfig = { level };

    expect(config.level).toBe('warn');
  });

  // A union is looser than an enum: a bare literal is now assignable. Anything
  // outside the six values still is not.
  it('accepts a bare literal but not an unknown level', () => {
    const level: LogLevel = 'error';
    expect(LOG_LEVELS).toContain(level);

    // @ts-expect-error - 'trace' is not a log level
    const unknownLevel: LogLevel = 'trace';
    expect(LOG_LEVELS).not.toContain(unknownLevel);
  });
});
