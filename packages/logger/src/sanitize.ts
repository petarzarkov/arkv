import { isPlainObject } from '@arkv/shared';
import type { LogEntry } from './types.js';

interface SanitizeOptions {
  maskFields: string[];
  maxArrayLength: number;
}

export function sanitizeLogEntry(
  obj: LogEntry,
  options: SanitizeOptions,
  visited = new WeakSet(),
): LogEntry {
  if (visited.has(obj)) {
    return {
      '[Circular]': 'circular reference detected',
    };
  }
  visited.add(obj);

  const cleaned: LogEntry = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) {
      continue;
    }

    const shouldMask = options.maskFields.some(field =>
      key.toLowerCase().includes(field.toLowerCase()),
    );

    if (shouldMask) {
      cleaned[key] = '[MASKED]';
    } else {
      const safeValue = makeSafeForJson(value, options);
      if (safeValue !== undefined) {
        if (Array.isArray(safeValue)) {
          cleaned[key] = sanitizeArray(
            safeValue,
            options,
            visited,
          );
        } else if (isPlainObject(safeValue)) {
          cleaned[key] = sanitizeLogEntry(
            safeValue,
            options,
            visited,
          );
        } else {
          cleaned[key] = safeValue;
        }
      }
    }
  }
  return cleaned;
}

function sanitizeArray(
  array: unknown[],
  options: SanitizeOptions,
  visited: WeakSet<object>,
): unknown[] {
  return array.map(item => {
    if (isPlainObject(item)) {
      return sanitizeLogEntry(item, options, visited);
    }
    if (Array.isArray(item)) {
      return sanitizeArray(item, options, visited);
    }
    return makeSafeForJson(item, options);
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive error search
export function findNestedError(
  obj: Record<string, unknown>,
  visited = new WeakSet(),
): Error | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  if (visited.has(obj)) {
    return null;
  }
  visited.add(obj);

  for (const value of Object.values(obj)) {
    if (value instanceof Error) {
      return value;
    }
    if (isPlainObject(value)) {
      const nestedError = findNestedError(value, visited);
      if (nestedError) {
        return nestedError;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof Error) {
          return item;
        }
        if (isPlainObject(item)) {
          const nestedError = findNestedError(
            item,
            visited,
          );
          if (nestedError) {
            return nestedError;
          }
        }
      }
    }
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles many type serialization cases
function makeSafeForJson(
  value: unknown,
  options: SanitizeOptions,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const valueType = typeof value;

  if (valueType === 'function') {
    return `[Function: ${(value as { name?: string }).name || 'anonymous'}]`;
  }

  if (valueType === 'symbol') {
    return `[Symbol: ${value.toString()}]`;
  }

  if (valueType === 'bigint') {
    return `[BigInt: ${value.toString()}]`;
  }

  if (valueType !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return `[RegExp: ${value.toString()}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.replace(/\n(\s+)?/g, ','),
    };
  }

  if (
    typeof FormData !== 'undefined' &&
    value instanceof FormData
  ) {
    const entries: Record<string, unknown> = {};
    try {
      for (const [key, val] of value.entries()) {
        if (
          val &&
          typeof val === 'object' &&
          'name' in val &&
          'size' in val &&
          'type' in val
        ) {
          const file = val as {
            name: string;
            size: number;
            type: string;
          };
          entries[key] =
            `[File: ${file.name} (${file.size} bytes, ${file.type})]`;
        } else {
          entries[key] = val;
        }
      }
      return { '[FormData]': entries };
    } catch {
      return '[FormData: unable to read entries]';
    }
  }

  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    'size' in value &&
    'type' in value &&
    typeof (value as { arrayBuffer?: unknown })
      .arrayBuffer === 'function'
  ) {
    const file = value as {
      name: string;
      size: number;
      type: string;
    };
    return `[File: ${file.name} (${file.size} bytes, ${file.type})]`;
  }

  if (
    typeof Blob !== 'undefined' &&
    value instanceof Blob
  ) {
    return `[Blob: ${value.size} bytes, ${value.type}]`;
  }

  if (
    typeof ArrayBuffer !== 'undefined' &&
    value instanceof ArrayBuffer
  ) {
    return `[ArrayBuffer: ${value.byteLength} bytes]`;
  }

  if (Array.isArray(value)) {
    return sliceArray(value, options);
  }

  if (isPlainObject(value)) {
    return value;
  }

  try {
    JSON.stringify(value);
    return value;
  } catch {
    if (
      (value as { constructor?: { name?: string } })
        .constructor?.name
    ) {
      return `[${(value as { constructor: { name: string } }).constructor.name}: object not serializable]`;
    }
    return '[Object: not serializable]';
  }
}

function sliceArray<T>(
  array: T[],
  options: SanitizeOptions,
): unknown[] {
  if (array.length <= options.maxArrayLength) {
    return array.map(item =>
      makeSafeForJson(item, options),
    );
  }

  const slicedArray = array
    .slice(0, options.maxArrayLength)
    .map(item => makeSafeForJson(item, options));

  return [
    ...slicedArray,
    `[TRUNCATED: ${array.length - options.maxArrayLength} more items]`,
  ];
}
