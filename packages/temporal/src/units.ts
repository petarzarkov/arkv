export type NormalizedUnit =
  | 'year'
  | 'month'
  | 'quarter'
  | 'week'
  | 'day'
  | 'date'
  | 'hour'
  | 'minute'
  | 'second'
  | 'millisecond';

// Keys accepted by Temporal.DurationLike
export type DurationKey =
  | 'years'
  | 'months'
  | 'weeks'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'seconds'
  | 'milliseconds';

const UNIT_MAP: Record<string, NormalizedUnit> = {
  y: 'year',
  yr: 'year',
  year: 'year',
  years: 'year',
  M: 'month',
  month: 'month',
  months: 'month',
  Q: 'quarter',
  quarter: 'quarter',
  quarters: 'quarter',
  w: 'week',
  week: 'week',
  weeks: 'week',
  d: 'day',
  day: 'day',
  days: 'day',
  D: 'date',
  date: 'date',
  dates: 'date',
  h: 'hour',
  hour: 'hour',
  hours: 'hour',
  m: 'minute',
  min: 'minute',
  minute: 'minute',
  minutes: 'minute',
  s: 'second',
  sec: 'second',
  second: 'second',
  seconds: 'second',
  ms: 'millisecond',
  millisecond: 'millisecond',
  milliseconds: 'millisecond',
};

export function normalizeUnit(u: string): NormalizedUnit {
  return (
    UNIT_MAP[u] ??
    UNIT_MAP[u.toLowerCase()] ??
    'millisecond'
  );
}

export const DURATION_KEY: Record<
  NormalizedUnit,
  DurationKey | null
> = {
  year: 'years',
  month: 'months',
  quarter: null,
  week: 'weeks',
  day: 'days',
  date: 'days',
  hour: 'hours',
  minute: 'minutes',
  second: 'seconds',
  millisecond: 'milliseconds',
};
