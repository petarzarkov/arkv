/**
 * Whether `FORCE_COLOR` asks for colour, by value rather than by presence.
 *
 * `0`, `false` and an empty value all mean off - the convention chalk and
 * supports-color follow, and the reason `FORCE_COLOR=0` is how people turn colour
 * off in CI. Testing for presence made that the one value guaranteed to turn it
 * on.
 */
const forcedOn = (value: string): boolean =>
  value !== '0' && value.toLowerCase() !== 'false' && value.trim() !== '';

/**
 * Detects whether the current environment supports colored output.
 *
 * Checks (in order):
 * 1. NO_COLOR env var (https://no-color.org/) - any value disables
 * 2. FORCE_COLOR env var - by value, so `FORCE_COLOR=0` disables
 * 3. Whether stdout is a TTY
 */
export const isColorSupported = (): boolean => {
  if (typeof process !== 'undefined' && process.env) {
    if ('NO_COLOR' in process.env) return false;
    const forced = process.env['FORCE_COLOR'];
    if (forced !== undefined) return forcedOn(forced);
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
  return (text: string) => (isColorSupported() ? colorFn(text) : text);
};
