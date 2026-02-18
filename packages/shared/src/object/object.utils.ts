/**
 * Deep clones a JSON-serializable value.
 */
export const deepClone = <T>(value: T): T =>
  structuredClone(value);

/**
 * Picks specified keys from an object.
 */
export const pick = <
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  obj: T,
  keys: K[],
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
};

/**
 * Omits specified keys from an object.
 */
export const omit = <
  T extends Record<string, unknown>,
  K extends keyof T,
>(
  obj: T,
  keys: K[],
): Omit<T, K> => {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
};

/**
 * Checks if a value is a plain object (not an array, Error, or null).
 */
export const isPlainObject = (
  obj: unknown,
): obj is Record<string, unknown> =>
  typeof obj === 'object' &&
  obj !== null &&
  !Array.isArray(obj) &&
  !(obj instanceof Error);
