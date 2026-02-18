// ANSI color codes for terminal output
export const ANSICodes = Object.freeze({
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Bright background colors
  bgBrightRed: '\x1b[101m',
  bgBrightGreen: '\x1b[102m',
  bgBrightYellow: '\x1b[103m',
  bgBrightBlue: '\x1b[104m',
  bgBrightMagenta: '\x1b[105m',
  bgBrightCyan: '\x1b[106m',
  bgBrightWhite: '\x1b[107m',
});

// Pre-computed open/close pairs for proper composition.
// Uses specific close codes instead of universal reset,
// so closing one style doesn't kill others.
export const ANSIPairs = Object.freeze({
  // Styles
  bold: { open: '\x1b[1m', close: '\x1b[22m' },
  dim: { open: '\x1b[2m', close: '\x1b[22m' },
  italic: {
    open: '\x1b[3m',
    close: '\x1b[23m',
  },
  underline: {
    open: '\x1b[4m',
    close: '\x1b[24m',
  },
  blink: { open: '\x1b[5m', close: '\x1b[25m' },
  reverse: {
    open: '\x1b[7m',
    close: '\x1b[27m',
  },
  hidden: { open: '\x1b[8m', close: '\x1b[28m' },
  strikethrough: {
    open: '\x1b[9m',
    close: '\x1b[29m',
  },

  // Foreground
  black: {
    open: '\x1b[30m',
    close: '\x1b[39m',
  },
  red: { open: '\x1b[31m', close: '\x1b[39m' },
  green: {
    open: '\x1b[32m',
    close: '\x1b[39m',
  },
  yellow: {
    open: '\x1b[33m',
    close: '\x1b[39m',
  },
  blue: { open: '\x1b[34m', close: '\x1b[39m' },
  magenta: {
    open: '\x1b[35m',
    close: '\x1b[39m',
  },
  cyan: { open: '\x1b[36m', close: '\x1b[39m' },
  white: {
    open: '\x1b[37m',
    close: '\x1b[39m',
  },

  // Background
  bgBlack: {
    open: '\x1b[40m',
    close: '\x1b[49m',
  },
  bgRed: {
    open: '\x1b[41m',
    close: '\x1b[49m',
  },
  bgGreen: {
    open: '\x1b[42m',
    close: '\x1b[49m',
  },
  bgYellow: {
    open: '\x1b[43m',
    close: '\x1b[49m',
  },
  bgBlue: {
    open: '\x1b[44m',
    close: '\x1b[49m',
  },
  bgMagenta: {
    open: '\x1b[45m',
    close: '\x1b[49m',
  },
  bgCyan: {
    open: '\x1b[46m',
    close: '\x1b[49m',
  },
  bgWhite: {
    open: '\x1b[47m',
    close: '\x1b[49m',
  },

  // Bright foreground
  brightRed: {
    open: '\x1b[91m',
    close: '\x1b[39m',
  },
  brightGreen: {
    open: '\x1b[92m',
    close: '\x1b[39m',
  },
  brightYellow: {
    open: '\x1b[93m',
    close: '\x1b[39m',
  },
  brightBlue: {
    open: '\x1b[94m',
    close: '\x1b[39m',
  },
  brightMagenta: {
    open: '\x1b[95m',
    close: '\x1b[39m',
  },
  brightCyan: {
    open: '\x1b[96m',
    close: '\x1b[39m',
  },
  brightWhite: {
    open: '\x1b[97m',
    close: '\x1b[39m',
  },

  // Bright background
  bgBrightRed: {
    open: '\x1b[101m',
    close: '\x1b[49m',
  },
  bgBrightGreen: {
    open: '\x1b[102m',
    close: '\x1b[49m',
  },
  bgBrightYellow: {
    open: '\x1b[103m',
    close: '\x1b[49m',
  },
  bgBrightBlue: {
    open: '\x1b[104m',
    close: '\x1b[49m',
  },
  bgBrightMagenta: {
    open: '\x1b[105m',
    close: '\x1b[49m',
  },
  bgBrightCyan: {
    open: '\x1b[106m',
    close: '\x1b[49m',
  },
  bgBrightWhite: {
    open: '\x1b[107m',
    close: '\x1b[49m',
  },
});
