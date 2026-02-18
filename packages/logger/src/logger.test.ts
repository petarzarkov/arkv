import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from 'bun:test';
import { ContextStore } from './context.js';
import { Logger } from './logger.js';
import {
  defaultTestConfig,
  parseLogOutput,
} from './test-utils.js';
import { LogLevel } from './types.js';

describe('Logger', () => {
  let logger: Logger;
  let contextStore: ContextStore;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    contextStore = new ContextStore();
    spyOn(contextStore, 'getContext').mockReturnValue({
      requestId: 'test-request-id',
      userId: 'test-user-id',
      event: '/test',
    });
    logger = new Logger(defaultTestConfig, contextStore);
    consoleLogSpy = spyOn(
      console,
      'log',
    ).mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('basic logging', () => {
    it('should log info messages with nested objects', () => {
      const nestedObject = {
        some: { nested: 'value' },
      };

      logger.log('Test', nestedObject);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.message).toBe('Test');
      expect(logData.some).toEqual({
        nested: 'value',
      });
    });

    it('should log debug messages', () => {
      logger.debug('Debug message');

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('debug');
      expect(logData.message).toBe('Debug message');
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
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

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('verbose');
      expect(logData.message).toBe('Verbose message');
    });
  });

  describe('error logging', () => {
    it('should log error messages with Error objects', () => {
      const error = new Error('Test error message');

      logger.error('Error occurred', error);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Error occurred');
      expect(logData.error.message).toBe(
        'Test error message',
      );
      expect(logData.error.stack).toBeDefined();
    });

    it('should log fatal messages with Error objects', () => {
      const error = new Error('Fatal error');

      logger.fatal('Fatal error occurred', error);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('fatal');
      expect(logData.message).toBe('Fatal error occurred');
      expect(logData.error.message).toBe('Fatal error');
    });

    it('should handle error objects in different positions', () => {
      const error = new Error('Position test');
      const extraData = { userId: '123' };

      logger.error(
        'Error with extra data',
        extraData,
        error,
      );

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe('Position test');
      expect(logData.userId).toBe('123');
    });

    it('should handle error objects with err property', () => {
      const error = new Error('Nested error');
      const errorWrapper = { err: error };

      logger.error('Nested error', errorWrapper);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe('Nested error');
    });

    it('should handle { error: string } shorthand at error level', () => {
      const error = 'Request failed with status 500';
      logger.error('Some error', { error });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Some error');
      expect(logData.error.message).toBe(
        'Request failed with status 500',
      );
      expect(logData.error.name).toBe('Error');
      expect(logData.error.stack).toBeDefined();
    });

    it('should handle { error: string } with additional properties at error level', () => {
      logger.error('Some error', {
        error: 'Request failed',
        statusCode: 500,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Some error');
      expect(logData.error.message).toBe('Request failed');
      expect(logData.statusCode).toBe(500);
    });

    it('should handle string error messages', () => {
      logger.error(
        'String error',
        'This is a string error',
      );

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.error.message).toBe(
        'This is a string error',
      );
    });
  });

  describe('context and metadata', () => {
    it('should include context information', () => {
      logger.log('Test with context');

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.requestId).toBe('test-request-id');
      expect(logData.userId).toBe('test-user-id');
      expect(logData.event).toBe('/test');
    });

    it('should include app metadata', () => {
      logger.log('Test app metadata');

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
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

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      // biome-ignore lint/suspicious/noControlCharactersInRegex: test code
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

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      expect(logCall).toMatch(/^\{.*\}$/);
    });
  });
});
