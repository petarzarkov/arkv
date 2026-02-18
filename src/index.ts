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

/**
 * Deep clones a JSON-serializable value.
 */
export const deepClone = <T>(value: T): T =>
  structuredClone(value);

/**
 * Groups an array of items by a key returned from the callback.
 */
export const groupBy = <T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> => {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
};

/**
 * Returns a new array with only unique elements, using an optional key function.
 */
export const unique = <T>(
  items: T[],
  keyFn?: (item: T) => unknown,
): T[] => {
  if (!keyFn) return [...new Set(items)];
  const seen = new Set<unknown>();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Chunks an array into smaller arrays of the given size.
 */
export const chunk = <T>(
  items: T[],
  size: number,
): T[][] => {
  if (size < 1)
    throw new RangeError('size must be at least 1');
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

/**
 * Retries an async function up to `retries` times with a delay between attempts.
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 100,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries)
        await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
};

/**
 * Creates a debounced version of a function.
 */
export const debounce = <
  T extends (...args: unknown[]) => void,
>(
  fn: T,
  delayMs: number,
): ((...args: Parameters<T>) => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
};

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
 * Sleeps for the given number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms));
