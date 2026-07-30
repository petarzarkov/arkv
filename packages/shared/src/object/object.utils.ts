/**
 * Deep clones a JSON-serializable value.
 */
export const deepClone = <T>(value: T): T => structuredClone(value);

/**
 * Picks specified keys from an object.
 */
export const pick = <T extends Record<string, unknown>, K extends keyof T>(
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
export const omit = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> => {
  const result = { ...obj };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
};

/**
 * Checks if a value is a plain object: an object literal, the result of
 * `JSON.parse`, or `Object.create(null)`.
 *
 * The prototype is what is tested, so an array, `Error`, `Map`, `Set`, `Date`,
 * typed array or class instance is not a plain object. Those are exactly the
 * values that lose their contents when spread or `Object.assign`ed into a
 * record, which is what callers of this predicate go on to do.
 */
export const isPlainObject = (obj: unknown): obj is Record<string, unknown> => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
};

/**
 * `Object.entries`, except a getter that throws yields a marker instead of
 * taking the caller down with it. Reading a property is the one step of walking
 * an unknown object that runs arbitrary user code.
 */
export const safeEntries = (
  obj: Record<string, unknown>,
): [string, unknown][] =>
  Object.keys(obj).map((key): [string, unknown] => {
    try {
      return [key, obj[key]];
    } catch {
      return [key, '[Getter: threw]'];
    }
  });
