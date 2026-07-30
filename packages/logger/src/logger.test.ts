import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { ContextStore } from './context.js';
import { Logger } from './logger.js';
import { defaultTestConfig, parseLogOutput } from './test-utils.js';
import { LogLevel } from './types.js';

describe('Logger', () => {
  let logger: Logger;
  let contextStore: ContextStore;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    contextStore = new ContextStore();
    spyOn(contextStore, 'getContext').mockReturnValue({
      requestId: 'test-request-id',
      userId: 'test-user-id',
      event: '/test',
    });
    logger = new Logger(defaultTestConfig, contextStore);
    // eslint-disable-next-line no-empty-function
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    // warn/error/fatal write to stderr; forward to the same spy so existing
    // assertions on console.log capture all output regardless of channel.
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => consoleLogSpy(...args),
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('basic logging', () => {
    it('should log info messages with nested objects', () => {
      const nestedObject = {
        some: { nested: 'value' },
      };

      logger.log('Test', nestedObject);

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.message).toBe('Test');
      expect(logData.some).toEqual({
        nested: 'value',
      });
    });

    it('should log debug messages', () => {
      logger.debug('Debug message');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('debug');
      expect(logData.message).toBe('Debug message');
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('warn');
      expect(logData.message).toBe('Warning message');
    });

    it('should log verbose messages', () => {
      const verboseLogger = new Logger(
        {
          ...defaultTestConfig,
          level: LogLevel.VERBOSE,
        },
        contextStore,
      );

      verboseLogger.verbose('Verbose message');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('verbose');
      expect(logData.message).toBe('Verbose message');
    });
  });

  describe('error logging', () => {
    it('should log error messages with Error objects', () => {
      const error = new Error('Test error message');

      logger.error('Error occurred', error);

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Error occurred');
      expect(logData.error.message).toBe('Test error message');
      expect(logData.error.stack).toBeDefined();
    });

    it('should log fatal messages with Error objects', () => {
      const error = new Error('Fatal error');

      logger.fatal('Fatal error occurred', error);

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('fatal');
      expect(logData.message).toBe('Fatal error occurred');
      expect(logData.error.message).toBe('Fatal error');
    });

    it('should handle error objects in different positions', () => {
      const error = new Error('Position test');
      const extraData = { userId: '123' };

      logger.error('Error with extra data', extraData, error);

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe('Position test');
      expect(logData.userId).toBe('123');
    });

    it('should handle error objects with err property', () => {
      const error = new Error('Nested error');
      const errorWrapper = { err: error };

      logger.error('Nested error', errorWrapper);

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe('Nested error');
    });

    it('should handle { error: string } shorthand at error level', () => {
      const error = 'Request failed with status 500';
      logger.error('Some error', { error });

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Some error');
      expect(logData.error.message).toBe('Request failed with status 500');
      expect(logData.error.name).toBe('Error');
      expect(logData.error.stack).toBeDefined();
    });

    it('should handle { error: string } with additional properties at error level', () => {
      logger.error('Some error', {
        error: 'Request failed',
        statusCode: 500,
      });

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Some error');
      expect(logData.error.message).toBe('Request failed');
      expect(logData.statusCode).toBe(500);
    });

    it('should handle string error messages', () => {
      logger.error('String error', 'This is a string error');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe('This is a string error');
    });
  });

  describe('context and metadata', () => {
    it('should include context information', () => {
      logger.log('Test with context');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.requestId).toBe('test-request-id');
      expect(logData.userId).toBe('test-user-id');
      expect(logData.event).toBe('/test');
    });

    it('should include app metadata', () => {
      logger.log('Test app metadata');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.appId).toBe('test-app-1.0.0-local');
      expect(logData.timestamp).toBeDefined();
    });
  });

  describe('log level filtering', () => {
    it('should not log when level is below configured level', () => {
      const filteredLogger = new Logger(
        {
          ...defaultTestConfig,
          level: LogLevel.ERROR,
        },
        contextStore,
      );

      filteredLogger.debug('This should not be logged');
      filteredLogger.log('This should not be logged');

      expect(console.log).not.toHaveBeenCalled();

      filteredLogger.error('This should be logged');
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('should filter out specified events', () => {
      spyOn(contextStore, 'getContext').mockReturnValue({
        requestId: 'test-request-id',
        userId: 'test-user-id',
        event: '/health',
      });

      logger.log('Health check');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should log non-filtered events', () => {
      spyOn(contextStore, 'getContext').mockReturnValue({
        requestId: 'test-request-id',
        userId: 'test-user-id',
        event: '/api/users',
      });

      logger.log('User request');

      expect(console.log).toHaveBeenCalled();
    });
  });

  // `isPlainObject` used to return true for anything object-shaped that was not
  // an array or an Error. A Map, a Set or a class instance therefore took the
  // structured-object path and was spread into the entry, which copies none of
  // a Map's entries: the value disappeared from the log without a warning.
  describe('non-plain objects as the message', () => {
    it('should keep a plain object on the structured path', () => {
      logger.log({ action: 'login', success: true });

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.message).toBe('Object logged');
      expect(logData.action).toBe('login');
      expect(logData.success).toBe(true);
      expect(logData.invalidMessageWarning).toBeUndefined();
    });

    it('should keep a null-prototype object on the structured path', () => {
      const bare = Object.create(null) as Record<string, unknown>;
      bare.action = 'login';

      logger.log(bare);

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.message).toBe('Object logged');
      expect(logData.action).toBe('login');
      expect(logData.invalidMessageWarning).toBeUndefined();
    });

    it('should report a Map message instead of losing its entries', () => {
      // @ts-expect-error - a Map is not a Record; asserting the runtime path
      logger.log(new Map([['cacheKey', 'cacheValue']]));

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.invalidMessageWarning).toBe(
        'Logger called with non-string message parameter',
      );
      expect(logData.originalMessageType).toBe('object');
      expect(logData.originalMessage).toEqual({
        '[Map]': [['cacheKey', 'cacheValue']],
      });
    });

    it('should report a Set message instead of losing its members', () => {
      // @ts-expect-error - a Set is not a Record; asserting the runtime path
      logger.log(new Set(['only']));

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.invalidMessageWarning).toBe(
        'Logger called with non-string message parameter',
      );
      expect(logData.originalMessage).toEqual({ '[Set]': ['only'] });
    });

    it('should not merge a class instance message over reserved fields', () => {
      class Payload {
        userId = 'hijacked';
        action = 'login';
      }

      // @ts-expect-error - a class instance is not a Record
      logger.log(new Payload());

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.invalidMessageWarning).toBe(
        'Logger called with non-string message parameter',
      );
      expect(logData.originalMessage).toEqual({
        userId: 'hijacked',
        action: 'login',
      });
      expect(logData.userId).toBe('test-user-id');
    });

    it('should still stringify a non-object message', () => {
      // @ts-expect-error - a number is not a valid message
      logger.error(42);

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.message).toBe('[OBJECT]: 42');
      expect(logData.originalMessageType).toBe('number');
      expect(logData.originalMessage).toBe('42');
    });
  });

  describe('non-plain objects as optional params', () => {
    it('should still merge a plain object param as extra fields', () => {
      logger.log('Test', { orderId: 'o-1' });

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.orderId).toBe('o-1');
      expect(logData.params).toBeUndefined();
    });

    it('should keep a Map param instead of dropping it', () => {
      logger.log('Cache state', new Map([['hits', 1]]));

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.message).toBe('Cache state');
      expect(logData.params).toEqual([{ '[Map]': [['hits', 1]] }]);
    });

    it('should nest a class instance param rather than merging it', () => {
      class Entity {
        userId = 'hijacked';
        id = 7;
      }

      logger.log('Created', new Entity());

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.params).toEqual([{ userId: 'hijacked', id: 7 }]);
      expect(logData.userId).toBe('test-user-id');
    });

    it('should keep a Date param as an ISO string', () => {
      logger.log('At', new Date('2024-01-02T03:04:05.000Z'));

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.params).toEqual(['2024-01-02T03:04:05.000Z']);
    });

    it('should keep an array param instead of dropping it', () => {
      logger.log('Items', ['first']);

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.params).toEqual([['first']]);
    });

    it('should still find an error nested in a non-plain param', () => {
      class Result {
        cause = new Error('deep failure');
      }

      logger.error('Request failed', new Result());

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.error.message).toBe('deep failure');
      expect(logData.params).toBeDefined();
    });

    it('should collect several non-plain params in order', () => {
      const bigLogger = new Logger(
        { ...defaultTestConfig, maxArrayLength: 10 },
        contextStore,
      );

      bigLogger.log(
        'Two',
        new Set(['a']),
        new Date('2024-01-02T00:00:00.000Z'),
      );

      const logData = parseLogOutput(consoleLogSpy.mock.calls[0][0] as string);

      expect(logData.params).toEqual([
        { '[Set]': ['a'] },
        '2024-01-02T00:00:00.000Z',
      ]);
    });
  });

  describe('development vs production formatting', () => {
    it('should use colored JSON in development', () => {
      const devLogger = new Logger(
        {
          ...defaultTestConfig,
          isDevelopment: true,
        },
        contextStore,
      );

      devLogger.log('Development test');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      // eslint-disable-next-line no-control-regex
      expect(logCall).toMatch(/\u001b\[[0-9;]*m/);
    });

    it('should use plain JSON in production', () => {
      const prodLogger = new Logger(
        {
          ...defaultTestConfig,
          isDevelopment: false,
        },
        contextStore,
      );

      prodLogger.log('Production test');

      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      expect(logCall).toMatch(/^\{.*\}$/);
    });
  });
});
