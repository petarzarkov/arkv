import { afterEach, describe, expect, it } from 'bun:test';
import { prettyFormat } from './format';
import type { LogEntry } from './types';

/** An ANSI SGR sequence: ESC, then `[`, then parameters, then `m`. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`);
const strip = (line: string): string =>
  line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

const entry = { level: 'info', message: 'hello' } as unknown as LogEntry;

const saved = { ...process.env };
afterEach(() => {
  delete process.env['NO_COLOR'];
  delete process.env['FORCE_COLOR'];
  Object.assign(process.env, saved);
});

describe('prettyFormat', () => {
  /*
   * The formatter called into @arkv/colors unconditionally, so a non-terminal
   * stdout got ANSI escapes written into the JSON and the output stopped being
   * parseable. Neither NO_COLOR nor FORCE_COLOR=0 suppressed them, because
   * nothing on the path asked whether colour was supported.
   */
  it('emits no escapes when colour is not supported', () => {
    process.env['NO_COLOR'] = '1';
    const line = prettyFormat(entry, 'info');
    expect(line).not.toMatch(ANSI);
    expect(JSON.parse(line)).toEqual({ level: 'info', message: 'hello' });
  });

  it('still colours when colour is forced on', () => {
    process.env['FORCE_COLOR'] = '1';
    expect(prettyFormat(entry, 'info')).toMatch(ANSI);
  });

  it('stays parseable once stripped, either way', () => {
    for (const [key, value] of [
      ['NO_COLOR', '1'],
      ['FORCE_COLOR', '1'],
    ] as const) {
      delete process.env['NO_COLOR'];
      delete process.env['FORCE_COLOR'];
      process.env[key] = value;
      expect(JSON.parse(strip(prettyFormat(entry, 'info')))).toEqual({
        level: 'info',
        message: 'hello',
      });
    }
  });
});
