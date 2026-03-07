import type { NormalizedUnit } from './units.js';

function monthDiff(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
  float: boolean,
): number {
  const dur = from.until(to, {
    largestUnit: 'months',
  });
  const whole = dur.months;
  if (!float) return whole;
  const anchor = from.add({ months: whole });
  const remaining =
    to.epochMilliseconds - anchor.epochMilliseconds;
  const nextMs =
    anchor.add({ months: 1 }).epochMilliseconds -
    anchor.epochMilliseconds;
  return whole + remaining / nextMs;
}

function dayDiff(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
  float: boolean,
): number {
  const dur = from.until(to, { largestUnit: 'days' });
  const total =
    dur.days +
    dur.hours / 24 +
    dur.minutes / 1440 +
    dur.seconds / 86_400 +
    dur.milliseconds / 86_400_000;
  return float ? total : Math.trunc(total);
}

function msDiff(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
  unit: NormalizedUnit,
  float: boolean,
): number {
  const ms = to.epochMilliseconds - from.epochMilliseconds;
  const divisors: Record<string, number> = {
    hour: 3_600_000,
    minute: 60_000,
    second: 1_000,
    millisecond: 1,
  };
  const result = ms / (divisors[unit] ?? 1);
  return float ? result : Math.trunc(result);
}

export function diffHelper(
  from: Temporal.ZonedDateTime,
  to: Temporal.ZonedDateTime,
  unit: NormalizedUnit,
  float: boolean,
): number {
  switch (unit) {
    case 'year': {
      const months = monthDiff(from, to, float);
      return float ? months / 12 : Math.trunc(months / 12);
    }
    case 'quarter': {
      const months = monthDiff(from, to, float);
      return float ? months / 3 : Math.trunc(months / 3);
    }
    case 'month':
      return monthDiff(from, to, float);
    case 'week': {
      const days = dayDiff(from, to, true);
      const result = days / 7;
      return float ? result : Math.trunc(result);
    }
    case 'day':
    case 'date':
      return dayDiff(from, to, float);
    default:
      return msDiff(from, to, unit, float);
  }
}
