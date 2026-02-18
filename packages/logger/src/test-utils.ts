import { strip } from '@arkv/colors';
import type { LoggerConfig } from './types.js';
import { LogLevel } from './types.js';

export function parseLogOutput(logCall: string) {
  const cleanLog = strip(logCall);
  return JSON.parse(cleanLog);
}

export const defaultTestConfig: LoggerConfig = {
  name: 'test-app',
  version: '1.0.0',
  env: 'local',
  isDevelopment: true,
  level: LogLevel.DEBUG,
  maskFields: [
    'password',
    'token',
    'apiKey',
    'apiSecret',
    'apiPass',
  ],
  filterEvents: ['/health'],
  maxArrayLength: 1,
};
