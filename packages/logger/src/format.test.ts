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

const ESC = String.fromCharCode(27);
const ANSI_G = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const stripAll = (line: string): string => line.replace(ANSI_G, '');

/**
 * The colorizer used to be a regex over the serialized JSON,
 * `/(".*?":\s*)(.*?)(?=,|\n|$)/g`, and a regex cannot tokenize JSON. Both of these
 * were visible in a real app's first two lines of output.
 */
describe('formatColoredJson, tokenized rather than pattern-matched', () => {
  const colored = (entry: Record<string, unknown>, level = 'info'): string => {
    process.env['FORCE_COLOR'] = '1';
    return prettyFormat(entry as unknown as LogEntry, level as never);
  };

  it('leaves the byte stream identical once the escapes are stripped', () => {
    const entry = {
      level: 'warn',
      message: 'unset, using the development constant. Sessions are forgeable.',
      nested: { stack: 'a\nb', list: [1, 'two', true, null] },
      quoted: 'he said "hi", then left',
      appId: 'app-0.1.0',
    };
    process.env['NO_COLOR'] = '1';
    const plain = prettyFormat(entry as unknown as LogEntry, 'warn');
    delete process.env['NO_COLOR'];
    expect(stripAll(colored(entry, 'warn'))).toBe(plain);
  });

  /*
   * `(?=,|\n|$)` has no `}` in its lookahead, so the last value's color span ran
   * to end of line and the closing brace came out colored with it.
   */
  it('does not swallow the closing brace into the last value', () => {
    const line = colored({ level: 'info', appId: 'dunx' });
    // The brace inside the value's span is the defect: `"dunx"}` then a close.
    expect(line).not.toContain(`"dunx"}${ESC}`);
    // It is its own token now, so it is preceded by a close and wrapped itself.
    expect(line).toMatch(new RegExp(`${ESC}\\[[0-9;]+m\\}${ESC}\\[[0-9;]+m$`));
  });

  /*
   * A comma inside a string ended the value early. The remainder was emitted bare
   * - which is why it took the terminal's stderr color - and the `","nextKey":`
   * that followed was matched as if it were a key.
   */
  it('colors a value containing a comma as one span', () => {
    const message = 'unset, using the default';
    const line = colored({ message, appId: 'app' });
    // The whole string, quotes included, inside one green span.
    expect(line).toContain(`${ESC}[32m"${message}"${ESC}[39m`);
    // And `appId` is still recognised as a key rather than absorbed.
    expect(line).toContain(`${ESC}[36m"appId"${ESC}[39m`);
  });

  it('colors punctuation rather than leaving it to inherit the terminal', () => {
    const line = colored({ level: 'warn', a: 1 }, 'warn');
    // Every structural character is wrapped, the leading brace included: Bun wraps
    // `console.error` output in red, and a bare `{` kept that red.
    for (const char of ['{', ',', ':', '}']) {
      expect(line).toMatch(
        new RegExp(`${ESC}\\[[0-9;]+m\\${char}${ESC}\\[[0-9;]+m`),
      );
    }
    // Nothing before the first escape: the leading brace is wrapped, not bare.
    expect(line.indexOf(ESC)).toBe(0);
  });

  it('keeps a nested key from leaking its color to the level above', () => {
    const line = colored({ error: { stack: 'x' }, message: 'after' });
    // `message` is green even though the object before it ended on `stack`, which
    // is gray - the key frame is popped with the brace.
    expect(line).toContain(`${ESC}[32m"after"${ESC}[39m`);
  });

  it('is still parseable with a string that looks like JSON inside it', () => {
    const entry = {
      message: '{"level":"fake","message":"nested"}',
      appId: 'a',
    };
    expect(JSON.parse(stripAll(colored(entry)))).toEqual(entry);
  });
});
