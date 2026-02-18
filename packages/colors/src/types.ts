/** A function that applies a color or style to text. */
export type ColorFn = (text: string) => string;

/** Supported log levels for color mapping. */
export type ColorLogLevels =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'log'
  | 'info'
  | 'debug'
  | 'verbose';
