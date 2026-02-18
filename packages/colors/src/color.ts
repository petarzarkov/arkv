import { ANSIPairs } from './ansi.js';
import type { ColorFn } from './types.js';

/**
 * Creates a color/style function from open and close sequences.
 * Uses string concatenation for maximum performance.
 */
export const createColor = (
  open: string,
  close: string,
): ColorFn => {
  return (text: string) => open + text + close;
};

/**
 * Creates a color function from multiple open/close pairs.
 * Pre-computes the combined open and close strings at creation time.
 */
export const createComposedColor = (
  ...pairs: ReadonlyArray<{
    readonly open: string;
    readonly close: string;
  }>
): ColorFn => {
  const open = pairs.map(p => p.open).join('');
  const close = pairs
    .slice()
    .reverse()
    .map(p => p.close)
    .join('');
  return (text: string) => open + text + close;
};

// Foreground colors
export const black = createColor(
  ANSIPairs.black.open,
  ANSIPairs.black.close,
);
export const red = createColor(
  ANSIPairs.red.open,
  ANSIPairs.red.close,
);
export const green = createColor(
  ANSIPairs.green.open,
  ANSIPairs.green.close,
);
export const yellow = createColor(
  ANSIPairs.yellow.open,
  ANSIPairs.yellow.close,
);
export const blue = createColor(
  ANSIPairs.blue.open,
  ANSIPairs.blue.close,
);
export const magenta = createColor(
  ANSIPairs.magenta.open,
  ANSIPairs.magenta.close,
);
export const cyan = createColor(
  ANSIPairs.cyan.open,
  ANSIPairs.cyan.close,
);
export const white = createColor(
  ANSIPairs.white.open,
  ANSIPairs.white.close,
);

// Bright foreground
export const brightRed = createColor(
  ANSIPairs.brightRed.open,
  ANSIPairs.brightRed.close,
);
export const brightGreen = createColor(
  ANSIPairs.brightGreen.open,
  ANSIPairs.brightGreen.close,
);
export const brightYellow = createColor(
  ANSIPairs.brightYellow.open,
  ANSIPairs.brightYellow.close,
);
export const brightBlue = createColor(
  ANSIPairs.brightBlue.open,
  ANSIPairs.brightBlue.close,
);
export const brightMagenta = createColor(
  ANSIPairs.brightMagenta.open,
  ANSIPairs.brightMagenta.close,
);
export const brightCyan = createColor(
  ANSIPairs.brightCyan.open,
  ANSIPairs.brightCyan.close,
);
export const brightWhite = createColor(
  ANSIPairs.brightWhite.open,
  ANSIPairs.brightWhite.close,
);

// Background colors
export const bgBlack = createColor(
  ANSIPairs.bgBlack.open,
  ANSIPairs.bgBlack.close,
);
export const bgRed = createColor(
  ANSIPairs.bgRed.open,
  ANSIPairs.bgRed.close,
);
export const bgGreen = createColor(
  ANSIPairs.bgGreen.open,
  ANSIPairs.bgGreen.close,
);
export const bgYellow = createColor(
  ANSIPairs.bgYellow.open,
  ANSIPairs.bgYellow.close,
);
export const bgBlue = createColor(
  ANSIPairs.bgBlue.open,
  ANSIPairs.bgBlue.close,
);
export const bgMagenta = createColor(
  ANSIPairs.bgMagenta.open,
  ANSIPairs.bgMagenta.close,
);
export const bgCyan = createColor(
  ANSIPairs.bgCyan.open,
  ANSIPairs.bgCyan.close,
);
export const bgWhite = createColor(
  ANSIPairs.bgWhite.open,
  ANSIPairs.bgWhite.close,
);

// Bright backgrounds
export const bgBrightRed = createColor(
  ANSIPairs.bgBrightRed.open,
  ANSIPairs.bgBrightRed.close,
);
export const bgBrightGreen = createColor(
  ANSIPairs.bgBrightGreen.open,
  ANSIPairs.bgBrightGreen.close,
);
export const bgBrightYellow = createColor(
  ANSIPairs.bgBrightYellow.open,
  ANSIPairs.bgBrightYellow.close,
);
export const bgBrightBlue = createColor(
  ANSIPairs.bgBrightBlue.open,
  ANSIPairs.bgBrightBlue.close,
);
export const bgBrightMagenta = createColor(
  ANSIPairs.bgBrightMagenta.open,
  ANSIPairs.bgBrightMagenta.close,
);
export const bgBrightCyan = createColor(
  ANSIPairs.bgBrightCyan.open,
  ANSIPairs.bgBrightCyan.close,
);
export const bgBrightWhite = createColor(
  ANSIPairs.bgBrightWhite.open,
  ANSIPairs.bgBrightWhite.close,
);

// Pre-composed combos
export const bgGreenBlack = createComposedColor(
  ANSIPairs.bgGreen,
  ANSIPairs.black,
);
export const bgRedWhite = createComposedColor(
  ANSIPairs.bgRed,
  ANSIPairs.white,
);

// Alias: gray uses dim styling
export const gray = createColor(
  ANSIPairs.dim.open,
  ANSIPairs.dim.close,
);
