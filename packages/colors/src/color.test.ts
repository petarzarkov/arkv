import { describe, expect, it } from 'bun:test';
import {
  ANSIPairs,
  bgGreenBlack,
  bgRedWhite,
  black,
  blue,
  bold,
  brightBlue,
  brightCyan,
  brightGreen,
  brightMagenta,
  brightRed,
  brightWhite,
  brightYellow,
  compose,
  createColor,
  createComposedColor,
  createConditionalColor,
  cyan,
  dim,
  getLevelColorFn,
  getValueColor,
  gray,
  green,
  hidden,
  inverse,
  isColorSupported,
  italic,
  magenta,
  red,
  strikethrough,
  strip,
  underline,
  visibleLength,
  white,
  yellow,
} from './index.js';

describe('createColor', () => {
  it('wraps text with open and close sequences', () => {
    const fn = createColor('\x1b[31m', '\x1b[39m');
    expect(fn('hello')).toBe('\x1b[31mhello\x1b[39m');
  });

  it('handles empty string', () => {
    const fn = createColor('\x1b[31m', '\x1b[39m');
    expect(fn('')).toBe('\x1b[31m\x1b[39m');
  });
});

describe('createComposedColor', () => {
  it('combines multiple pairs', () => {
    const fn = createComposedColor(
      ANSIPairs.bgGreen,
      ANSIPairs.black,
    );
    const result = fn('test');
    expect(result).toContain('\x1b[42m');
    expect(result).toContain('\x1b[30m');
    expect(result).toContain('test');
  });

  it('closes in reverse order', () => {
    const fn = createComposedColor(
      ANSIPairs.bgRed,
      ANSIPairs.white,
    );
    const result = fn('x');
    // open: bgRed + white, close: white-close + bgRed-close
    expect(result).toBe(
      '\x1b[41m\x1b[37mx\x1b[39m\x1b[49m',
    );
  });
});

describe('foreground colors', () => {
  it('red', () => {
    expect(red('t')).toBe('\x1b[31mt\x1b[39m');
  });

  it('green', () => {
    expect(green('t')).toBe('\x1b[32mt\x1b[39m');
  });

  it('yellow', () => {
    expect(yellow('t')).toBe('\x1b[33mt\x1b[39m');
  });

  it('blue', () => {
    expect(blue('t')).toBe('\x1b[34mt\x1b[39m');
  });

  it('magenta', () => {
    expect(magenta('t')).toBe('\x1b[35mt\x1b[39m');
  });

  it('cyan', () => {
    expect(cyan('t')).toBe('\x1b[36mt\x1b[39m');
  });

  it('white', () => {
    expect(white('t')).toBe('\x1b[37mt\x1b[39m');
  });

  it('black', () => {
    expect(black('t')).toBe('\x1b[30mt\x1b[39m');
  });
});

describe('bright foreground colors', () => {
  it('brightRed', () => {
    expect(brightRed('t')).toBe('\x1b[91mt\x1b[39m');
  });

  it('brightGreen', () => {
    expect(brightGreen('t')).toBe('\x1b[92mt\x1b[39m');
  });

  it('brightYellow', () => {
    expect(brightYellow('t')).toBe('\x1b[93mt\x1b[39m');
  });

  it('brightBlue', () => {
    expect(brightBlue('t')).toBe('\x1b[94mt\x1b[39m');
  });

  it('brightMagenta', () => {
    expect(brightMagenta('t')).toBe('\x1b[95mt\x1b[39m');
  });

  it('brightCyan', () => {
    expect(brightCyan('t')).toBe('\x1b[96mt\x1b[39m');
  });

  it('brightWhite', () => {
    expect(brightWhite('t')).toBe('\x1b[97mt\x1b[39m');
  });
});

describe('gray alias', () => {
  it('uses dim styling', () => {
    expect(gray('t')).toBe('\x1b[2mt\x1b[22m');
  });
});

describe('composed colors', () => {
  it('bgGreenBlack', () => {
    const result = bgGreenBlack('t');
    expect(result).toBe(
      '\x1b[42m\x1b[30mt\x1b[39m\x1b[49m',
    );
  });

  it('bgRedWhite', () => {
    const result = bgRedWhite('t');
    expect(result).toBe(
      '\x1b[41m\x1b[37mt\x1b[39m\x1b[49m',
    );
  });
});

describe('styles', () => {
  it('bold', () => {
    expect(bold('t')).toBe('\x1b[1mt\x1b[22m');
  });

  it('dim', () => {
    expect(dim('t')).toBe('\x1b[2mt\x1b[22m');
  });

  it('italic', () => {
    expect(italic('t')).toBe('\x1b[3mt\x1b[23m');
  });

  it('underline', () => {
    expect(underline('t')).toBe('\x1b[4mt\x1b[24m');
  });

  it('strikethrough', () => {
    expect(strikethrough('t')).toBe('\x1b[9mt\x1b[29m');
  });

  it('inverse', () => {
    expect(inverse('t')).toBe('\x1b[7mt\x1b[27m');
  });

  it('hidden', () => {
    expect(hidden('t')).toBe('\x1b[8mt\x1b[28m');
  });
});

describe('compose', () => {
  it('composes multiple functions', () => {
    const boldRed = compose(bold, red);
    expect(boldRed('t')).toBe(bold(red('t')));
  });

  it('returns identity for empty args', () => {
    const identity = compose();
    expect(identity('t')).toBe('t');
  });

  it('returns the function for single arg', () => {
    const fn = compose(red);
    expect(fn('t')).toBe(red('t'));
  });

  it('applies left to right (outermost first)', () => {
    const result = compose(bold, italic, red)('t');
    expect(result).toBe(bold(italic(red('t'))));
  });
});

describe('strip', () => {
  it('removes ANSI codes from styled text', () => {
    expect(strip(red('hello'))).toBe('hello');
  });

  it('handles plain text', () => {
    expect(strip('plain')).toBe('plain');
  });

  it('handles empty string', () => {
    expect(strip('')).toBe('');
  });

  it('removes nested ANSI codes', () => {
    expect(strip(bold(red('nested')))).toBe('nested');
  });

  it('removes composed ANSI codes', () => {
    expect(strip(bgGreenBlack('test'))).toBe('test');
  });
});

describe('visibleLength', () => {
  it('returns length excluding ANSI codes', () => {
    expect(visibleLength(red('hello'))).toBe(5);
  });

  it('returns length for plain text', () => {
    expect(visibleLength('plain')).toBe(5);
  });

  it('handles empty string', () => {
    expect(visibleLength('')).toBe(0);
  });
});

describe('isColorSupported', () => {
  it('returns a boolean', () => {
    expect(typeof isColorSupported()).toBe('boolean');
  });
});

describe('createConditionalColor', () => {
  it('returns a function', () => {
    const fn = createConditionalColor(red);
    expect(typeof fn).toBe('function');
  });

  it('returns a string when called', () => {
    const fn = createConditionalColor(red);
    expect(typeof fn('test')).toBe('string');
  });
});

describe('getValueColor', () => {
  it('returns yellow for boolean strings', () => {
    expect(getValueColor('true')).toBe(yellow);
    expect(getValueColor('false')).toBe(yellow);
  });

  it('returns yellow for numeric strings', () => {
    expect(getValueColor('42')).toBe(yellow);
    expect(getValueColor('3.14')).toBe(yellow);
  });

  it('returns gray for null', () => {
    expect(getValueColor('null')).toBe(gray);
  });

  it('returns white for other strings', () => {
    expect(getValueColor('hello')).toBe(white);
  });
});

describe('getLevelColorFn', () => {
  it('returns red for error', () => {
    expect(getLevelColorFn('error')).toBe(red);
  });

  it('returns yellow for warn', () => {
    expect(getLevelColorFn('warn')).toBe(yellow);
  });

  it('returns blue for debug', () => {
    expect(getLevelColorFn('debug')).toBe(blue);
  });

  it('returns bgRedWhite for fatal', () => {
    expect(getLevelColorFn('fatal')).toBe(bgRedWhite);
  });

  it('returns bgGreenBlack for info', () => {
    expect(getLevelColorFn('info')).toBe(bgGreenBlack);
  });

  it('returns gray for verbose', () => {
    expect(getLevelColorFn('verbose')).toBe(gray);
  });

  it('returns white for unknown level', () => {
    expect(getLevelColorFn('unknown')).toBe(white);
  });
});
