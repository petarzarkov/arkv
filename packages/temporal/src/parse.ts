import type { ConfigType } from './types.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /Z|[+-]\d{2}:\d{2}/;
const HAS_ANNOTATION = /\[/;

function parseString(
  s: string,
  tz: string,
): Temporal.ZonedDateTime | null {
  try {
    if (HAS_ANNOTATION.test(s)) {
      return Temporal.ZonedDateTime.from(s);
    }
    if (HAS_OFFSET.test(s)) {
      return Temporal.Instant.from(s).toZonedDateTimeISO(
        tz,
      );
    }
    if (DATE_ONLY.test(s)) {
      return Temporal.PlainDate.from(s).toZonedDateTime(tz);
    }
    return Temporal.PlainDateTime.from(s).toZonedDateTime(
      tz,
    );
  } catch {
    return null;
  }
}

function isTDayjsLike(
  d: unknown,
): d is { $zdt: Temporal.ZonedDateTime | null } {
  return d !== null && typeof d === 'object' && '$zdt' in d;
}

export function parseInput(
  date: ConfigType,
  tz: string,
): Temporal.ZonedDateTime | null {
  if (date === null) return null;
  if (date === undefined) {
    return Temporal.Now.zonedDateTimeISO(tz);
  }
  if (isTDayjsLike(date)) {
    return date.$zdt;
  }
  if (typeof date === 'number') {
    return Temporal.Instant.fromEpochMilliseconds(
      date,
    ).toZonedDateTimeISO(tz);
  }
  if (date instanceof Date) {
    return Temporal.Instant.fromEpochMilliseconds(
      date.getTime(),
    ).toZonedDateTimeISO(tz);
  }
  if (typeof date === 'string') {
    return parseString(date, tz);
  }
  return null;
}
