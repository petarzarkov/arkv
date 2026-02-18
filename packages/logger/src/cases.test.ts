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

describe('Logger - cases', () => {
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

  describe('user scenarios', () => {
    it('should handle logger.info with nested objects', () => {
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

    it('should handle logger.error with Error objects', () => {
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

    it('should handle logger.error called with object (Case 2: Normal object)', () => {
      const objectMessage = {
        error: 'Something went wrong',
        code: 500,
      };

      logger.error(objectMessage);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Object logged');
      expect(logData.error).toBe('Something went wrong');
      expect(logData.code).toBe(500);
      expect(logData.invalidMessageWarning).toBeUndefined();
    });

    it('should handle logger.error called with empty object (Case 2: Normal object)', () => {
      const emptyObject = {};

      logger.error(emptyObject);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Object logged');
      expect(logData.invalidMessageWarning).toBeUndefined();
    });

    it('should handle logger.error called with null or undefined', () => {
      // @ts-expect-error - Intentionally calling with wrong type to test runtime handling
      logger.error(null);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('[null]');
      expect(logData.invalidMessageWarning).toBe(
        'Logger called with non-string message parameter',
      );
      expect(logData.invalidMessageCallstack).toBeDefined();
      expect(logData.originalMessageType).toBe('object');
      expect(logData.originalMessage).toBe('null');
    });
  });

  describe('All 9 logging cases', () => {
    it('Case 1: log(String)', () => {
      logger.log('Simple string message');

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('log');
      expect(logData.message).toBe('Simple string message');
      expect(logData.error).toBeUndefined();
    });

    it('Case 2: log(NormalObject)', () => {
      const testObject = {
        userId: '123',
        action: 'login',
        success: true,
      };

      logger.log(testObject);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('log');
      expect(logData.message).toBe('Object logged');
      expect(logData.userId).toBe('123');
      expect(logData.action).toBe('login');
      expect(logData.success).toBe(true);
      expect(logData.error).toBeUndefined();
    });

    it('Case 3: log(ErrorInstance)', () => {
      const error = new Error('Test error');

      logger.error(error);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Test error');
      expect(logData.error.message).toBe('Test error');
      expect(logData.error.stack).toBeDefined();
    });

    it('Case 4: log(NormalObject with nested errorInstance)', () => {
      const objectWithError = {
        operation: 'database-query',
        metadata: {
          nested: {
            error: new Error('Connection timeout'),
          },
        },
      };

      logger.error(objectWithError);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Connection timeout');
      expect(logData.error.message).toBe(
        'Connection timeout',
      );
      expect(logData.operation).toBe('database-query');
      expect(logData.metadata).toEqual({
        nested: {
          error: expect.any(Object),
        },
      });
    });

    it('Case 5: warn/error/fatal(OnlyString)', () => {
      logger.warn('Warning message');
      logger.error('Error message');
      logger.fatal('Fatal message');

      const calls = consoleLogSpy.mock.calls;

      const warnData = parseLogOutput(
        calls[0][0] as string,
      );
      expect(warnData.level).toBe('warn');
      expect(warnData.message).toBe('Warning message');

      const errorData = parseLogOutput(
        calls[1][0] as string,
      );
      expect(errorData.level).toBe('error');
      expect(errorData.message).toBe('Error message');

      const fatalData = parseLogOutput(
        calls[2][0] as string,
      );
      expect(fatalData.level).toBe('fatal');
      expect(fatalData.message).toBe('Fatal message');
    });

    it('Case 6: log(String, ErrorInstance)', () => {
      const error = new Error('Database connection failed');

      logger.error('Operation failed', error);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Operation failed');
      expect(logData.error.message).toBe(
        'Database connection failed',
      );
      expect(logData.error.stack).toBeDefined();
    });

    it('Case 7: log(String, { err: ErrorInstance })', () => {
      const error = new Error('API rate limit exceeded');

      logger.error('API call failed', {
        err: error,
        retryAfter: 30,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('API call failed');
      expect(logData.error.message).toBe(
        'API rate limit exceeded',
      );
      expect(logData.retryAfter).toBe(30);
    });

    it('Case 8: log(String, { error: ErrorInstance })', () => {
      const error = new Error('Validation failed');

      logger.error('Request invalid', {
        error: error,
        field: 'email',
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe('Request invalid');
      expect(logData.error.message).toBe(
        'Validation failed',
      );
      expect(logData.field).toBe('email');
    });

    it('Case 9: log(String, AnyNestedErrorInstance)', () => {
      const nestedError = new Error('File not found');
      const complexObject = {
        operation: 'file-upload',
        metadata: {
          size: 1024,
          nested: {
            deeply: {
              hiddenError: nestedError,
            },
          },
        },
      };

      logger.error(
        'Complex operation failed',
        complexObject,
      );

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.level).toBe('error');
      expect(logData.message).toBe(
        'Complex operation failed',
      );
      expect(logData.error.message).toBe('File not found');
      expect(logData.operation).toBe('file-upload');
      expect(logData.metadata.size).toBe(1024);
    });
  });
});
