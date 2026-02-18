import type { ColorFn } from './types.js';

/**
 * Composes multiple color/style functions into one.
 * Applies from left to right (outermost to innermost).
 *
 * @example
 * const boldRed = compose(bold, red);
 * console.log(boldRed('error'));
 */
export const compose = (...fns: ColorFn[]): ColorFn => {
  if (fns.length === 0) return (text: string) => text;
  if (fns.length === 1) return fns[0];
  return (text: string) => {
    let result = text;
    for (let i = fns.length - 1; i >= 0; i--) {
      result = fns[i](result);
    }
    return result;
  };
};
