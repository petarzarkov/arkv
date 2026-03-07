/** biome-ignore-all lint/nursery/noExcessiveLinesPerFile: test */
import { describe, expect, it } from 'bun:test';
import tdayjs, { TDayjs } from './index.js';

describe('creation', () => {
  it('creates valid instance with no args', () => {
    expect(tdayjs().isValid()).toBe(true);
  });

  it('parses date string', () => {
    const d = tdayjs('2026-03-07');
    expect(d.isValid()).toBe(true);
    expect(d.year()).toBe(2026);
    expect(d.month()).toBe(2); // 0-indexed March
    expect(d.date()).toBe(7);
  });

  it('parses datetime string', () => {
    const d = tdayjs('2026-03-07T10:30:00');
    expect(d.isValid()).toBe(true);
    expect(d.hour()).toBe(10);
    expect(d.minute()).toBe(30);
    expect(d.second()).toBe(0);
  });

  it('parses unix ms timestamp', () => {
    const ms = 1741305600000;
    const d = tdayjs(ms);
    expect(d.isValid()).toBe(true);
    expect(d.valueOf()).toBe(ms);
  });

  it('parses Date object', () => {
    const now = new Date();
    const d = tdayjs(now);
    expect(d.isValid()).toBe(true);
    expect(d.valueOf()).toBe(now.getTime());
  });

  it('treats null as invalid', () => {
    expect(tdayjs(null).isValid()).toBe(false);
  });

  it('clones TDayjs instance', () => {
    const a = tdayjs('2026-03-07');
    const b = tdayjs(a);
    expect(b.year()).toBe(2026);
    expect(b).not.toBe(a);
  });

  it('creates from unix seconds', () => {
    const secs = 1741305600;
    const d = tdayjs.unix(secs);
    expect(d.unix()).toBe(secs);
  });

  it('supports method chaining immutably', () => {
    const base = tdayjs('2026-03-07T12:00:00');
    const chained = base
      .add(1, 'month')
      .subtract(2, 'days')
      .startOf('day');

    expect(base.format('YYYY-MM-DD')).toBe('2026-03-07'); // Base untouched
    expect(chained.format('YYYY-MM-DD')).toBe('2026-04-05');
  });

  it('treats undefined as now', () => {
    // dayjs(undefined) is equivalent to dayjs()
    const d1 = tdayjs();
    const d2 = tdayjs(undefined);
    expect(d1.valueOf()).toBeCloseTo(d2.valueOf(), -2); // Within ms
  });

  it('treats garbage strings as invalid', () => {
    expect(tdayjs('not-a-date').isValid()).toBe(false);
  });
});

describe('getters', () => {
  const d = tdayjs('2026-03-07T10:30:45');

  it('year()', () => expect(d.year()).toBe(2026));

  it('month() is 0-indexed', () => {
    // March = 2 (0-indexed)
    expect(d.month()).toBe(2);
  });

  it('date() is day of month', () => {
    expect(d.date()).toBe(7);
  });

  it('hour()', () => expect(d.hour()).toBe(10));
  it('minute()', () => expect(d.minute()).toBe(30));
  it('second()', () => expect(d.second()).toBe(45));

  it('day() is 0=Sun...6=Sat', () => {
    // 2026-03-07 is a Saturday = 6
    expect(d.day()).toBe(6);
  });

  it('daysInMonth() for March', () => {
    expect(d.daysInMonth()).toBe(31);
  });
});

describe('setters', () => {
  it('year(n) returns new instance', () => {
    const d = tdayjs('2026-03-07').year(2025);
    expect(d.year()).toBe(2025);
  });

  it('month(n) is 0-indexed', () => {
    // set to January (0)
    const d = tdayjs('2026-03-07').month(0);
    expect(d.month()).toBe(0);
  });

  it('month(11) sets December', () => {
    const d = tdayjs('2026-03-07').month(11);
    expect(d.month()).toBe(11);
  });

  it('date(n) sets day of month', () => {
    const d = tdayjs('2026-03-07').date(15);
    expect(d.date()).toBe(15);
  });

  it('set(unit, value) works', () => {
    const d = tdayjs('2026-03-07').set('year', 2030);
    expect(d.year()).toBe(2030);
  });

  it('get(unit) works', () => {
    const d = tdayjs('2026-03-07');
    expect(d.get('year')).toBe(2026);
    expect(d.get('month')).toBe(2);
  });
});

describe('setter overflow', () => {
  it('month(12) overflows to January of next year', () => {
    // 0-indexed 12 = 13th month = January next year
    const d = tdayjs('2026-12-15').month(12);
    expect(d.year()).toBe(2027);
    expect(d.month()).toBe(0); // January
  });

  it('month(-1) underflows to December of previous year', () => {
    const d = tdayjs('2026-01-15').month(-1);
    expect(d.year()).toBe(2025);
    expect(d.month()).toBe(11); // December
  });

  it('date(32) in March overflows to April', () => {
    // March has 31 days; add(32-7=25, 'day') → April 1
    const d = tdayjs('2026-03-07').date(32);
    expect(d.month()).toBe(3); // April
    expect(d.date()).toBe(1);
  });

  it('hour(25) overflows to next day', () => {
    const d = tdayjs('2026-03-07T12:00:00').hour(25);
    expect(d.date()).toBe(8);
    expect(d.hour()).toBe(1);
  });

  it('hour(-1) underflows to previous day', () => {
    const d = tdayjs('2026-03-07T00:00:00').hour(-1);
    expect(d.date()).toBe(6);
    expect(d.hour()).toBe(23);
  });

  it('minute(60) overflows to next hour', () => {
    const d = tdayjs('2026-03-07T10:30:00').minute(60);
    expect(d.hour()).toBe(11);
    expect(d.minute()).toBe(0);
  });

  it('second(70) overflows to next minute', () => {
    const d = tdayjs('2026-03-07T10:30:00').second(70);
    expect(d.minute()).toBe(31);
    expect(d.second()).toBe(10);
  });

  it('year setter overflows correctly across month boundary', () => {
    // Feb 29 leap year + 1 year → Feb 28 (non-leap)
    const d = tdayjs('2024-02-29').year(2025);
    expect(d.format('YYYY-MM-DD')).toBe('2025-02-28');
  });
});

describe('add / subtract', () => {
  it('add days', () => {
    const d = tdayjs('2026-03-07').add(1, 'day');
    expect(d.date()).toBe(8);
  });

  it('add months', () => {
    const d = tdayjs('2026-01-31').add(1, 'month');
    // Jan 31 + 1 month = Feb 28 (clamped)
    expect(d.month()).toBe(1); // February = 1
  });

  it('add years', () => {
    const d = tdayjs('2026-03-07').add(1, 'year');
    expect(d.year()).toBe(2027);
  });

  it('add weeks', () => {
    const d = tdayjs('2026-03-07').add(1, 'week');
    expect(d.date()).toBe(14);
  });

  it('subtract days', () => {
    const d = tdayjs('2026-03-07').subtract(1, 'day');
    expect(d.date()).toBe(6);
  });

  it('add quarters', () => {
    const d = tdayjs('2026-01-01').add(1, 'quarter');
    expect(d.month()).toBe(3); // April = 3
  });

  it('leap year math', () => {
    const d = tdayjs('2024-02-29').add(1, 'year');
    expect(d.format('YYYY-MM-DD')).toBe('2025-02-28');
  });

  it('date() setter overflows like dayjs (not clamp)', () => {
    // dayjs('2026-02-15').date(31) → Date.setDate(31) → March 3
    // add(31 - 15, 'day') = add(16) → March 3, 2026
    const d = tdayjs('2026-02-15').date(31);
    expect(d.month()).toBe(2); // March (0-indexed)
    expect(d.date()).toBe(3);
  });
});

describe('startOf / endOf', () => {
  const d = tdayjs('2026-03-15T10:30:45');

  it('startOf year', () => {
    const s = d.startOf('year');
    expect(s.month()).toBe(0);
    expect(s.date()).toBe(1);
    expect(s.hour()).toBe(0);
  });

  it('endOf year', () => {
    const e = d.endOf('year');
    expect(e.month()).toBe(11);
    expect(e.date()).toBe(31);
    expect(e.hour()).toBe(23);
  });

  it('startOf month', () => {
    const s = d.startOf('month');
    expect(s.date()).toBe(1);
    expect(s.hour()).toBe(0);
  });

  it('endOf month', () => {
    const e = d.endOf('month');
    expect(e.date()).toBe(31); // March has 31 days
    expect(e.hour()).toBe(23);
  });

  it('startOf day', () => {
    const s = d.startOf('day');
    expect(s.hour()).toBe(0);
    expect(s.minute()).toBe(0);
    expect(s.second()).toBe(0);
  });

  it('endOf day', () => {
    const e = d.endOf('day');
    expect(e.hour()).toBe(23);
    expect(e.minute()).toBe(59);
    expect(e.second()).toBe(59);
  });

  it('startOf week defaults to Sunday (en locale)', () => {
    // March 7, 2026 is a Saturday. Start of week (Sunday) is March 1.
    const d = tdayjs('2026-03-07').startOf('week');
    expect(d.day()).toBe(0); // Sunday
    expect(d.date()).toBe(1);
  });

  it('endOf week defaults to Saturday (en locale)', () => {
    // March 7, 2026 is a Saturday — it IS the end of the week.
    const d = tdayjs('2026-03-07').endOf('week');
    expect(d.day()).toBe(6); // Saturday
    expect(d.date()).toBe(7);
    expect(d.hour()).toBe(23);
  });

  it('startOf week with weekStart=1 snaps to Monday', () => {
    // March 7, 2026 is a Saturday.
    // With Mon-start week, previous Monday is March 2.
    const fr = {
      name: 'fr-test',
      months: [] as string[],
      monthsShort: [] as string[],
      weekdays: [] as string[],
      weekdaysShort: [] as string[],
      weekdaysMin: [] as string[],
      weekStart: 1,
    };
    const d = tdayjs('2026-03-07')
      .locale(fr)
      .startOf('week');
    expect(d.day()).toBe(1); // Monday
    expect(d.date()).toBe(2);
  });

  it('endOf week with weekStart=1 snaps to Sunday', () => {
    // March 7, 2026 is a Saturday.
    // Mon-start week: Mon Mar 2 → Sun Mar 8.
    const fr = {
      name: 'fr-test',
      months: [] as string[],
      monthsShort: [] as string[],
      weekdays: [] as string[],
      weekdaysShort: [] as string[],
      weekdaysMin: [] as string[],
      weekStart: 1,
    };
    const d = tdayjs('2026-03-07').locale(fr).endOf('week');
    expect(d.day()).toBe(0); // Sunday
    expect(d.date()).toBe(8);
    expect(d.hour()).toBe(23);
  });
});

describe('format', () => {
  const d = tdayjs('2026-03-07T09:05:03');

  it('YYYY-MM-DD', () => {
    expect(d.format('YYYY-MM-DD')).toBe('2026-03-07');
  });

  it('MM/DD/YYYY', () => {
    expect(d.format('MM/DD/YYYY')).toBe('03/07/2026');
  });

  it('HH:mm:ss', () => {
    expect(d.format('HH:mm:ss')).toBe('09:05:03');
  });

  it('escaped text', () => {
    expect(d.format('[Year:] YYYY')).toBe('Year: 2026');
  });

  it('month names MMM', () => {
    expect(d.format('MMM')).toBe('Mar');
  });

  it('month names MMMM', () => {
    expect(d.format('MMMM')).toBe('March');
  });

  it('12-hour hh:mm A', () => {
    expect(d.format('h:mm A')).toBe('9:05 AM');
  });

  it('invalid returns Invalid Date', () => {
    expect(tdayjs(null).format()).toBe('Invalid Date');
  });
});

describe('diff', () => {
  it('year diff', () => {
    const a = tdayjs('2026-01-01');
    const b = tdayjs('2025-01-01');
    expect(a.diff(b, 'year')).toBe(1);
  });

  it('month diff', () => {
    const a = tdayjs('2026-03-01');
    const b = tdayjs('2026-01-01');
    expect(a.diff(b, 'month')).toBe(2);
  });

  it('day diff', () => {
    const a = tdayjs('2026-03-14');
    const b = tdayjs('2026-03-07');
    expect(a.diff(b, 'day')).toBe(7);
  });

  it('default ms diff', () => {
    const a = tdayjs('2026-03-07T00:00:01');
    const b = tdayjs('2026-03-07T00:00:00');
    expect(a.diff(b)).toBe(1_000);
  });

  it('diff with float = true', () => {
    const a = tdayjs('2026-03-15');
    const b = tdayjs('2026-03-01');
    // Exactly 2 weeks = 0.5 months
    expect(a.diff(b, 'month', true)).toBeGreaterThan(0.4);
    expect(a.diff(b, 'month', true)).toBeLessThan(0.6);
  });

  it('negative diffs', () => {
    const past = tdayjs('2026-01-01');
    const future = tdayjs('2026-01-10');
    expect(past.diff(future, 'day')).toBe(-9);
  });
});

describe('comparison', () => {
  const past = tdayjs('2025-01-01');
  const now = tdayjs('2026-03-07');
  const future = tdayjs('2027-12-31');

  it('isBefore', () => {
    expect(now.isBefore(future)).toBe(true);
    expect(now.isBefore(past)).toBe(false);
  });

  it('isAfter', () => {
    expect(now.isAfter(past)).toBe(true);
    expect(now.isAfter(future)).toBe(false);
  });

  it('isSame by day', () => {
    const a = tdayjs('2026-03-07T10:00:00');
    const b = tdayjs('2026-03-07T22:00:00');
    expect(a.isSame(b, 'day')).toBe(true);
    expect(a.isSame(b, 'hour')).toBe(false);
  });
});

describe('conversion', () => {
  const d = tdayjs('2026-03-07T10:30:00');

  it('toDate() returns Date', () => {
    expect(d.toDate()).toBeInstanceOf(Date);
  });

  it('toISOString()', () => {
    expect(typeof d.toISOString()).toBe('string');
    expect(d.toISOString()).toContain('2026-03-07');
  });

  it('toJSON() returns string for valid', () => {
    expect(typeof d.toJSON()).toBe('string');
  });

  it('toJSON() returns null for invalid', () => {
    expect(tdayjs(null).toJSON()).toBeNull();
  });

  it('valueOf() returns ms', () => {
    expect(typeof d.valueOf()).toBe('number');
  });

  it('unix() returns seconds', () => {
    expect(d.unix()).toBe(Math.floor(d.valueOf() / 1000));
  });
});

describe('static methods', () => {
  it('isDayjs', () => {
    expect(tdayjs.isDayjs(tdayjs())).toBe(true);
    expect(tdayjs.isDayjs(new Date())).toBe(false);
  });

  it('locale getter', () => {
    expect(tdayjs.locale()).toBe('en');
  });
});

describe('invalid date propagation', () => {
  it('does not throw when manipulating invalid dates', () => {
    const d = tdayjs('garbage-string');
    expect(d.isValid()).toBe(false);

    // This should NOT throw an error, it should just return another invalid instance
    const mutated = d.add(1, 'day').startOf('month');
    expect(mutated.isValid()).toBe(false);

    // Formatting an invalid date should return 'Invalid Date'
    expect(mutated.format('YYYY-MM-DD')).toBe(
      'Invalid Date',
    );
  });
});

describe('instance locales', () => {
  it('allows instance-specific locale overrides', () => {
    const enDate = tdayjs('2026-03-07');

    // Mocking a simple locale registration for the test
    const frDate = enDate.locale('fr', {
      name: 'fr',
      months:
        'janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre'.split(
          '_',
        ),
    });

    // The original instance should remain English
    expect(enDate.locale()).toBe('en');

    // The new instance should be French
    expect(frDate.locale()).toBe('fr');
    expect(frDate.format('MMMM')).toBe('mars');
  });
});

describe('timezones and offsets', () => {
  it('parses UTC Z correctly', () => {
    const d = tdayjs('2026-03-07T10:30:00Z');
    // Assuming DEFAULT_TZ isn't UTC, make sure it handles the underlying offset
    expect(d.isValid()).toBe(true);
  });

  it('calculates utcOffset in minutes', () => {
    // We inject a specific Temporal instance to test the math deterministically
    const zdt = Temporal.ZonedDateTime.from(
      '2026-03-07T10:30:00+02:00[+02:00]',
    );
    const d = new TDayjs({ zdt });

    // 7,200,000,000,000 ns / 60,000,000,000 = 120
    expect(d.utcOffset()).toBe(120);
  });
});
