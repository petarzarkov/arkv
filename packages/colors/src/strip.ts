// Regex matching ANSI escape sequences (pre-compiled)
const ANSI_REGEX =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape sequences
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strips all ANSI escape codes from a string.
 */
export const strip = (text: string): string =>
  text.replace(ANSI_REGEX, '');

/**
 * Returns the visible length of a string (excluding ANSI codes).
 * Useful for alignment and padding in terminal output.
 */
export const visibleLength = (text: string): number =>
  strip(text).length;
