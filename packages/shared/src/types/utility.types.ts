/** Expand an object type for better IDE hover previews. */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
