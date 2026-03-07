import type { ILocale } from './locale.js';
import type { NormalizedUnit } from './units.js';

const ZERO_TIME = {
  hour: 0,
  minute: 0,
  second: 0,
  millisecond: 0,
  microsecond: 0,
  nanosecond: 0,
} as const;

const MAX_TIME = {
  hour: 23,
  minute: 59,
  second: 59,
  millisecond: 999,
  microsecond: 999,
  nanosecond: 999,
} as const;

function startWeek(
  zdt: Temporal.ZonedDateTime,
  weekStart: number,
): Temporal.ZonedDateTime {
  // dayOfWeek: 1=Mon...7=Sun → convert to 0=Sun..6=Sat
  const dow = zdt.dayOfWeek % 7;
  const diff = (dow - weekStart + 7) % 7;
  return zdt.subtract({ days: diff }).with(ZERO_TIME);
}

function endWeek(
  zdt: Temporal.ZonedDateTime,
  weekStart: number,
): Temporal.ZonedDateTime {
  const dow = zdt.dayOfWeek % 7;
  const diff = (dow - weekStart + 7) % 7;
  return zdt
    .subtract({ days: diff })
    .add({ days: 6 })
    .with(MAX_TIME);
}

export function startOfHelper(
  zdt: Temporal.ZonedDateTime,
  unit: NormalizedUnit,
  locale: ILocale,
): Temporal.ZonedDateTime {
  const weekStart = locale.weekStart ?? 0;
  switch (unit) {
    case 'year':
      return zdt.with({ month: 1, day: 1, ...ZERO_TIME });
    case 'month':
      return zdt.with({ day: 1, ...ZERO_TIME });
    case 'week':
      return startWeek(zdt, weekStart);
    case 'day':
    case 'date':
      return zdt.with(ZERO_TIME);
    case 'hour':
      return zdt.with({
        minute: 0,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      });
    case 'minute':
      return zdt.with({
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      });
    case 'second':
      return zdt.with({
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      });
    default:
      return zdt;
  }
}

export function endOfHelper(
  zdt: Temporal.ZonedDateTime,
  unit: NormalizedUnit,
  locale: ILocale,
): Temporal.ZonedDateTime {
  const weekStart = locale.weekStart ?? 0;
  switch (unit) {
    case 'year':
      return zdt.with({ month: 12, day: 31, ...MAX_TIME });
    case 'month':
      return zdt.with({
        day: zdt.daysInMonth,
        ...MAX_TIME,
      });
    case 'week':
      return endWeek(zdt, weekStart);
    case 'day':
    case 'date':
      return zdt.with(MAX_TIME);
    case 'hour':
      return zdt.with({
        minute: 59,
        second: 59,
        millisecond: 999,
        microsecond: 999,
        nanosecond: 999,
      });
    case 'minute':
      return zdt.with({
        second: 59,
        millisecond: 999,
        microsecond: 999,
        nanosecond: 999,
      });
    case 'second':
      return zdt.with({
        millisecond: 999,
        microsecond: 999,
        nanosecond: 999,
      });
    default:
      return zdt;
  }
}
