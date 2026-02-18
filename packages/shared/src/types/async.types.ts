/** Generic type for any async function. */
export type AsyncFn<T = unknown> = (
  ...args: never[]
) => Promise<T>;
