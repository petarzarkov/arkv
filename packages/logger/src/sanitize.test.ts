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

describe('Logger - sanitization', () => {
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

  describe('data sanitization', () => {
    it('should mask sensitive fields', () => {
      const sensitiveData = {
        password: 'secret123',
        token: 'jwt-token',
        normalField: 'visible',
      };

      logger.log('Sensitive data test', sensitiveData);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.password).toBe('[MASKED]');
      expect(logData.token).toBe('[MASKED]');
      expect(logData.normalField).toBe('visible');
    });

    it('should mask nested sensitive fields', () => {
      const nestedSensitiveData = {
        user: {
          password: 'secret123',
          profile: {
            token: 'jwt-token',
          },
        },
        public: 'visible',
      };

      logger.log(
        'Nested sensitive data',
        nestedSensitiveData,
      );

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.user.password).toBe('[MASKED]');
      expect(logData.user.profile.token).toBe('[MASKED]');
      expect(logData.public).toBe('visible');
    });

    it('should mask sensitive fields in arrays', () => {
      const responseBody = [
        {
          id: 'c0d92e74-1328-4f3c-9c2e-28e989bcfb08',
          entityId: null,
          apiKey: '2ea996bc-1a44-41aa-8d61-411e4f26d3c0',
          apiSecret: 'EFE4CCC813C3A909C320BEA2082B8DC2',
          apiPass: 'Supercoolpass123!',
          provider: 'okx',
        },
      ];

      logger.log('Sent Response', {
        responseBody,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.responseBody).toHaveLength(1);
      expect(logData.responseBody[0].id).toBe(
        'c0d92e74-1328-4f3c-9c2e-28e989bcfb08',
      );
      expect(logData.responseBody[0].provider).toBe('okx');
      expect(logData.responseBody[0].apiKey).toBe(
        '[MASKED]',
      );
      expect(logData.responseBody[0].apiSecret).toBe(
        '[MASKED]',
      );
      expect(logData.responseBody[0].apiPass).toBe(
        '[MASKED]',
      );
    });

    it('should mask sensitive fields in nested arrays', () => {
      const testLogger = new Logger(
        {
          ...defaultTestConfig,
          maxArrayLength: 5,
        },
        contextStore,
      );

      const complexData = {
        users: [
          {
            id: 1,
            name: 'John',
            credentials: {
              password: 'secret123',
              apiKey: 'key123',
            },
          },
          {
            id: 2,
            name: 'Jane',
            auth: {
              token: 'jwt-token',
              secret: 'secret456',
            },
          },
        ],
        metadata: {
          apiSecret: 'global-secret',
        },
      };

      testLogger.log('Complex nested data', complexData);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.users).toHaveLength(2);
      expect(logData.users[0].name).toBe('John');
      expect(logData.users[0].credentials.password).toBe(
        '[MASKED]',
      );
      expect(logData.users[0].credentials.apiKey).toBe(
        '[MASKED]',
      );
      expect(logData.users[1].name).toBe('Jane');
      expect(logData.users[1].auth.token).toBe('[MASKED]');
      expect(logData.users[1].auth.secret).toBe('[MASKED]');
      expect(logData.metadata.apiSecret).toBe('[MASKED]');
    });
  });

  describe('JSON-safe sanitization', () => {
    it('should properly serialize Error objects nested in extra data', () => {
      const nestedData = {
        operation: 'db-query',
        details: {
          query: 'SELECT * FROM users',
          dbError: new Error('Connection refused'),
        },
      };

      logger.log('Database operation failed', nestedData);

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.details.dbError).toBeDefined();
      expect(logData.details.dbError.message).toBe(
        'Connection refused',
      );
      expect(logData.details.dbError.name).toBe('Error');
    });

    it('should handle functions safely', () => {
      function testFunction() {
        return 'test';
      }
      const namedFunction = function namedFunc() {
        return 'named';
      };
      const arrowFunction = () => 'arrow';

      logger.log('Function test', {
        regular: testFunction,
        named: namedFunction,
        arrow: arrowFunction,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.regular).toBe(
        '[Function: testFunction]',
      );
      expect(logData.named).toBe('[Function: namedFunc]');
      expect(logData.arrow).toBe(
        '[Function: arrowFunction]',
      );
    });

    it('should handle BigInt values safely', () => {
      const bigIntValue = BigInt(123456789012345);

      logger.log('BigInt test', {
        value: bigIntValue,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.value).toBe(
        '[BigInt: 123456789012345]',
      );
    });

    it('should handle Symbol values safely', () => {
      const symbolValue = Symbol('test');
      const symbolWithDesc = Symbol.for('globalSymbol');

      logger.log('Symbol test', {
        basic: symbolValue,
        global: symbolWithDesc,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.basic).toMatch(
        /\[Symbol: Symbol\(test\)\]/,
      );
      expect(logData.global).toMatch(
        /\[Symbol: Symbol\(globalSymbol\)\]/,
      );
    });

    it('should handle Date objects safely', () => {
      const testDate = new Date('2023-01-01T00:00:00.000Z');

      logger.log('Date test', {
        date: testDate,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.date).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should handle RegExp objects safely', () => {
      const regex = /test.*pattern/gi;

      logger.log('RegExp test', {
        pattern: regex,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.pattern).toBe(
        '[RegExp: /test.*pattern/gi]',
      );
    });

    it('should handle mixed problematic types in arrays', () => {
      const testFunction = function testFunc() {
        return 'test';
      };
      const mixedArray = [
        'string',
        123,
        testFunction,
        BigInt(456),
        Symbol('arraySymbol'),
        new Date('2023-01-01'),
        /pattern/i,
      ];

      logger.log('Mixed array test', {
        mixed: mixedArray,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.mixed[0]).toBe('string');
      expect(logData.mixed[1]).toBe(
        '[TRUNCATED: 6 more items]',
      );
    });

    it('should handle objects with non-serializable properties', () => {
      const problematicObject = {
        normal: 'string',
        func: () => 'test',
        nested: {
          bigint: BigInt(789),
          symbol: Symbol('nested'),
          date: new Date('2023-06-15T12:00:00.000Z'),
        },
      };

      logger.log(
        'Problematic object test',
        problematicObject,
      );

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.normal).toBe('string');
      expect(logData.func).toBe('[Function: func]');
      expect(logData.nested.bigint).toBe('[BigInt: 789]');
      expect(logData.nested.symbol).toMatch(
        /\[Symbol: Symbol\(nested\)\]/,
      );
      expect(logData.nested.date).toBe(
        '2023-06-15T12:00:00.000Z',
      );
    });

    it('should truncate arrays based on maxArrayLength configuration', () => {
      const testLogger = new Logger(
        {
          ...defaultTestConfig,
          maxArrayLength: 3,
        },
        contextStore,
      );

      const longArray = [
        'item1',
        'item2',
        'item3',
        'item4',
        'item5',
      ];

      testLogger.log('Array truncation test', {
        array: longArray,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.array).toHaveLength(4);
      expect(logData.array[0]).toBe('item1');
      expect(logData.array[1]).toBe('item2');
      expect(logData.array[2]).toBe('item3');
      expect(logData.array[3]).toBe(
        '[TRUNCATED: 2 more items]',
      );
    });

    it('should not truncate arrays when length is within maxArrayLength', () => {
      const testLogger = new Logger(
        {
          ...defaultTestConfig,
          maxArrayLength: 5,
        },
        contextStore,
      );

      const shortArray = ['item1', 'item2', 'item3'];

      testLogger.log('Short array test', {
        array: shortArray,
      });

      const logCall = consoleLogSpy.mock
        .calls[0][0] as string;
      const logData = parseLogOutput(logCall);

      expect(logData.array).toHaveLength(3);
      expect(logData.array[0]).toBe('item1');
      expect(logData.array[1]).toBe('item2');
      expect(logData.array[2]).toBe('item3');
    });
  });
});
