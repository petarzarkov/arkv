/**
 * Safely stringifies a value to JSON.
 * Falls back to a circular-reference-safe replacer if native JSON.stringify throws.
 */
export const safeStringify = (obj: unknown): string => {
  try {
    return JSON.stringify(obj);
  } catch {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
  }
};
