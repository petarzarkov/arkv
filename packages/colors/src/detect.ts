/**
 * Detects whether the current environment supports colored output.
 *
 * Checks (in order):
 * 1. NO_COLOR env var (https://no-color.org/)
 * 2. FORCE_COLOR env var
 * 3. Whether stdout is a TTY
 */
export const isColorSupported = (): boolean => {
  if (typeof process !== 'undefined' && process.env) {
    if ('NO_COLOR' in process.env) return false;
    if ('FORCE_COLOR' in process.env) return true;
  }

  if (
    typeof process !== 'undefined' &&
    process.stdout &&
    typeof process.stdout.isTTY === 'boolean'
  ) {
    return process.stdout.isTTY;
  }

  return false;
};

/**
 * Wraps a color function to return plain text
 * when colors are not supported.
 */
export const createConditionalColor = (
  colorFn: (text: string) => string,
): ((text: string) => string) => {
  return (text: string) =>
    isColorSupported() ? colorFn(text) : text;
};
