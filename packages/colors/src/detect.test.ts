import { afterEach, describe, expect, it } from 'bun:test';
import { isColorSupported } from './detect';

const saved = { ...process.env };

afterEach(() => {
  for (const key of ['NO_COLOR', 'FORCE_COLOR']) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('isColorSupported', () => {
  it('honours NO_COLOR', () => {
    process.env['NO_COLOR'] = '1';
    expect(isColorSupported()).toBe(false);
  });

  /*
   * FORCE_COLOR was tested for presence rather than value, so the conventional
   * way to turn colour off turned it on. `0`, `false` and empty all mean off:
   * https://force-color.org and the same convention chalk and supports-color use.
   */
  it('treats FORCE_COLOR=0 as off, not as on', () => {
    process.env['FORCE_COLOR'] = '0';
    expect(isColorSupported()).toBe(false);
  });

  it('treats FORCE_COLOR=false and an empty value as off', () => {
    for (const value of ['false', '']) {
      process.env['FORCE_COLOR'] = value;
      expect(isColorSupported()).toBe(false);
    }
  });

  it('treats any other FORCE_COLOR value as on', () => {
    for (const value of ['1', '2', '3', 'true', 'yes']) {
      process.env['FORCE_COLOR'] = value;
      expect(isColorSupported()).toBe(true);
    }
  });

  it('lets NO_COLOR win over FORCE_COLOR', () => {
    process.env['NO_COLOR'] = '1';
    process.env['FORCE_COLOR'] = '1';
    expect(isColorSupported()).toBe(false);
  });
});
