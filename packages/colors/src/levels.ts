import {
  bgGreenBlack,
  bgRedWhite,
  blue,
  gray,
  red,
  white,
  yellow,
} from './color.js';
import type { ColorFn, ColorLogLevels } from './types.js';

/** Maps log levels to their corresponding color functions. */
export const levelColorMap: Record<
  ColorLogLevels | string,
  ColorFn
> = {
  fatal: bgRedWhite,
  error: red,
  warn: yellow,
  log: bgGreenBlack,
  info: bgGreenBlack,
  debug: blue,
  verbose: gray,
};

/** Returns the color function for a given log level. */
export const getLevelColorFn = (
  level: ColorLogLevels | string,
): ColorFn => {
  return levelColorMap[level] || white;
};

/**
 * Returns a color function based on the type of a value string.
 * Booleans and numbers: yellow, null: gray, everything else: white.
 */
export const getValueColor = (value: string): ColorFn => {
  if (
    value === 'true' ||
    value === 'false' ||
    !Number.isNaN(Number(value))
  ) {
    return yellow;
  }
  if (value === 'null') {
    return gray;
  }
  return white;
};
