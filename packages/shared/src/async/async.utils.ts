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
 * Sleeps for the given number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms));
