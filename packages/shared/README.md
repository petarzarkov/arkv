# @arkv/shared

Zero-dependency shared utilities and types for `@arkv` packages.

## Install

```bash
bun add @arkv/shared
# or
npm install @arkv/shared
```

## Utilities

### Array

```typescript
import { groupBy, unique, chunk } from '@arkv/shared';

groupBy(
  [{ type: 'fruit', name: 'apple' }, { type: 'veg', name: 'carrot' }],
  i => i.type,
);
// { fruit: [{ type: 'fruit', name: 'apple' }], veg: [{ type: 'veg', name: 'carrot' }] }

unique([1, 2, 2, 3]); // [1, 2, 3]
unique(items, i => i.id); // deduplicate by key

chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
```

### Object

```typescript
import { pick, omit, deepClone, isPlainObject } from '@arkv/shared';

pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b']);       // { a: 1, c: 3 }

const cloned = deepClone({ nested: { value: 1 } });

isPlainObject({});          // true
isPlainObject([]);           // false
isPlainObject(new Error()); // false
```

### Number

```typescript
import { clamp, randomInt } from '@arkv/shared';

clamp(15, 0, 10);  // 10
clamp(-5, 0, 10);  // 0

randomInt(1, 100);  // random integer between 1 and 100 (inclusive)
```

### Async

```typescript
import { retry, debounce, sleep } from '@arkv/shared';

// Retry up to 3 times with 100ms delay between attempts
const data = await retry(() => fetchData(), 3, 100);

// Debounce a function by 300ms
const debouncedSave = debounce(save, 300);

await sleep(1000); // wait 1 second
```

### String

```typescript
import { safeStringify } from '@arkv/shared';

// Handles circular references without throwing
const obj: any = { a: 1 };
obj.self = obj;
safeStringify(obj); // '{"a":1,"self":"[Circular]"}'
```

### URL

```typescript
import { UrlHelper } from '@arkv/shared';

const url = new UrlHelper();

url.buildUrl({
  base: 'https://api.example.com/{version}',
  path: '/users/{id}',
  pathParams: { version: 'v1', id: 123 },
  queryParams: { fields: 'name', active: true },
});
// https://api.example.com/v1/users/123?fields=name&active=true

url.interpolate('/api/{version}/users/{id}', { version: 'v1', id: 42 });
// '/api/v1/users/42'
```

## Types

```typescript
import type {
  AsyncFn,
  Prettify,
  StringTransformFn,
  ParamsType,
} from '@arkv/shared';
```

| Type | Description |
|------|-------------|
| `AsyncFn<T>` | Generic async function type |
| `Prettify<T>` | Expands object types for better IDE hover previews |
| `StringTransformFn` | Function that transforms a string (e.g., applies color/style) |
| `ParamsType` | `Record<string, string \| number \| boolean \| undefined>` |

## API Reference

### Array utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `groupBy` | `(items: T[], keyFn: (item: T) => string) => Record<string, T[]>` | Groups array items by key |
| `unique` | `(items: T[], keyFn?: (item: T) => unknown) => T[]` | Removes duplicates, with optional key function |
| `chunk` | `(items: T[], size: number) => T[][]` | Splits array into chunks of given size |

### Object utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `pick` | `(obj: T, keys: K[]) => Pick<T, K>` | Picks specified keys from object |
| `omit` | `(obj: T, keys: K[]) => Omit<T, K>` | Omits specified keys from object |
| `deepClone` | `(value: T) => T` | Deep clones via `structuredClone` |
| `isPlainObject` | `(obj: unknown) => obj is Record<string, unknown>` | Checks if value is a plain object |

### Number utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `clamp` | `(value: number, min: number, max: number) => number` | Clamps number between min and max |
| `randomInt` | `(min: number, max: number) => number` | Random integer between min and max (inclusive) |

### Async utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `retry` | `(fn: () => Promise<T>, retries?: number, delayMs?: number) => Promise<T>` | Retries async function with delay |
| `debounce` | `(fn: T, delayMs: number) => (...args) => void` | Creates debounced function |
| `sleep` | `(ms: number) => Promise<void>` | Promise-based delay |

### String utilities

| Function | Signature | Description |
|----------|-----------|-------------|
| `safeStringify` | `(obj: unknown) => string` | JSON.stringify with circular reference handling |

### URL utilities

| Class | Method | Description |
|-------|--------|-------------|
| `UrlHelper` | `buildUrl(config)` | Builds a URL with path/query/path params |
| `UrlHelper` | `interpolate(template, params?)` | Replaces `{key}` placeholders in a string |

## License

[MIT](../../LICENSE)
