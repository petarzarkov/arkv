export function toStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

export function toStrNullable(value: unknown): string | null {
  if (value == null) return null;
  return toStr(value);
}
