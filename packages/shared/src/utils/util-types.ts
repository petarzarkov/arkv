/** Generic type for any async function. */
export type AsyncFn<T = unknown> = (
  ...args: never[]
) => Promise<T>;

/** Expand an object type for better IDE hover previews. */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/** A function that transforms a string (e.g., applies color/style). */
export type StringTransformFn = (text: string) => string;
