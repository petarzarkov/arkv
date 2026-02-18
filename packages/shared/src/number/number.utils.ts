/**
 * Clamps a number between a minimum and maximum value.
 */
export const clamp = (
  value: number,
  min: number,
  max: number,
): number => {
  if (min > max)
    throw new RangeError(
      'min must be less than or equal to max',
    );
  return Math.min(Math.max(value, min), max);
};

/**
 * Generates a random integer between min (inclusive) and max (inclusive).
 */
export const randomInt = (
  min: number,
  max: number,
): number => {
  if (!Number.isInteger(min) || !Number.isInteger(max))
    throw new TypeError('min and max must be integers');
  if (min > max)
    throw new RangeError(
      'min must be less than or equal to max',
    );
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
