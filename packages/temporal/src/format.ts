import { REGEX_FORMAT } from './constants.js';
import type { ILocale } from './locale.js';

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function offsetStr(ns: number, sep: string): string {
  const totalMin = Math.round(ns / 60_000_000_000);
  const sign = totalMin >= 0 ? '+' : '-';
  const absMin = Math.abs(totalMin);
  const h = pad(Math.floor(absMin / 60));
  const m = pad(absMin % 60);
  return sep ? `${sign}${h}:${m}` : `${sign}${h}${m}`;
}

// Temporal: 1=Mon...7=Sun → dayjs: 0=Sun...6=Sat
function toDayjsDay(dow: number): number {
  return dow % 7;
}

function matchToken(
  zdt: Temporal.ZonedDateTime,
  locale: ILocale,
  token: string,
): string | null {
  const {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    dayOfWeek,
    offsetNanoseconds,
  } = zdt;
  const djDay = toDayjsDay(dayOfWeek);
  switch (token) {
    case 'YYYY':
      return pad(year, 4);
    case 'YY':
      return String(year).slice(-2);
    case 'M':
      return String(month);
    case 'MM':
      return pad(month);
    case 'MMM':
      return locale.monthsShort[month - 1];
    case 'MMMM':
      return locale.months[month - 1];
    case 'D':
      return String(day);
    case 'DD':
      return pad(day);
    case 'd':
      return String(djDay);
    case 'dd':
      return locale.weekdaysMin[djDay];
    case 'ddd':
      return locale.weekdaysShort[djDay];
    case 'dddd':
      return locale.weekdays[djDay];
    case 'H':
      return String(hour);
    case 'HH':
      return pad(hour);
    case 'h':
      return String(hour % 12 || 12);
    case 'hh':
      return pad(hour % 12 || 12);
    case 'a':
      return hour < 12 ? 'am' : 'pm';
    case 'A':
      return hour < 12 ? 'AM' : 'PM';
    case 'm':
      return String(minute);
    case 'mm':
      return pad(minute);
    case 's':
      return String(second);
    case 'ss':
      return pad(second);
    case 'SSS':
      return pad(millisecond, 3);
    case 'Z':
      return offsetStr(offsetNanoseconds, ':');
    case 'ZZ':
      return offsetStr(offsetNanoseconds, '');
    default:
      return null;
  }
}

export function formatDate(
  zdt: Temporal.ZonedDateTime,
  template: string,
  locale: ILocale,
): string {
  return template.replace(
    REGEX_FORMAT,
    (match, escaped?: string) => {
      if (escaped != null) return escaped;
      return matchToken(zdt, locale, match) ?? match;
    },
  );
}
