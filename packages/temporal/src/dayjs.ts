import {
  FORMAT_DEFAULT,
  INVALID_DATE,
} from './constants.js';
import { diffHelper } from './diff.js';
import { formatDate } from './format.js';
import {
  getGlobalLocale,
  getLocaleObj,
  type ILocale,
  registerLocale,
} from './locale.js';
import { parseInput } from './parse.js';
import { endOfHelper, startOfHelper } from './start-end.js';
import type {
  ConfigType,
  ManipulateType,
  OpUnitType,
  QUnitType,
  UnitType,
} from './types.js';
import {
  DURATION_KEY,
  type DurationKey,
  type NormalizedUnit,
  normalizeUnit,
} from './units.js';

interface InternalConfig {
  date?: ConfigType;
  zdt?: Temporal.ZonedDateTime | null;
  locale?: string;
  tz?: string;
}

function addToZdt(
  zdt: Temporal.ZonedDateTime,
  n: number,
  key: DurationKey,
): Temporal.ZonedDateTime {
  switch (key) {
    case 'years':
      return zdt.add({ years: n });
    case 'months':
      return zdt.add({ months: n });
    case 'weeks':
      return zdt.add({ weeks: n });
    case 'days':
      return zdt.add({ days: n });
    case 'hours':
      return zdt.add({ hours: n });
    case 'minutes':
      return zdt.add({ minutes: n });
    case 'seconds':
      return zdt.add({ seconds: n });
    case 'milliseconds':
      return zdt.add({ milliseconds: n });
  }
}

export const DEFAULT_TZ = Temporal.Now.timeZoneId();

export class TDayjs {
  readonly $zdt: Temporal.ZonedDateTime | null;
  readonly $L: string;
  readonly $tz: string;

  constructor(cfg: InternalConfig) {
    this.$L = cfg.locale ?? getGlobalLocale();
    this.$tz = cfg.tz ?? DEFAULT_TZ;
    this.$zdt =
      cfg.zdt !== undefined
        ? cfg.zdt
        : parseInput(cfg.date, this.$tz);
  }

  private _clone(
    zdt: Temporal.ZonedDateTime | null,
  ): TDayjs {
    return new TDayjs({
      zdt,
      locale: this.$L,
      tz: this.$tz,
    });
  }

  isValid(): this is this & {
    $zdt: Temporal.ZonedDateTime;
  } {
    return this.$zdt !== null;
  }

  clone(): TDayjs {
    return this._clone(this.$zdt);
  }

  // --- Getters / Setters ---

  year(): number;
  year(value: number): TDayjs;
  year(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.year ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(value - this.$zdt.year, 'year');
  }

  // Returns 0-indexed month (Jan=0) like dayjs
  month(): number;
  month(value: number): TDayjs;
  month(value?: number): number | TDayjs {
    if (value === undefined) {
      return (this.$zdt?.month ?? 1) - 1;
    }
    if (!this.$zdt) return this._clone(null);
    // value is 0-indexed; $zdt.month is 1-indexed
    return this.add(value - (this.$zdt.month - 1), 'month');
  }

  date(): number;
  date(value: number): TDayjs;
  date(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.day ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(value - this.$zdt.day, 'day');
  }

  // Returns 0=Sun...6=Sat like dayjs
  day(): number;
  day(value: number): TDayjs;
  day(value?: number): number | TDayjs {
    if (value === undefined) {
      return (this.$zdt?.dayOfWeek ?? 0) % 7;
    }
    if (!this.$zdt) return this._clone(null);
    const current = this.$zdt.dayOfWeek % 7;
    return this._clone(
      this.$zdt.add({ days: value - current }),
    );
  }

  hour(): number;
  hour(value: number): TDayjs;
  hour(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.hour ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(value - this.$zdt.hour, 'hour');
  }

  minute(): number;
  minute(value: number): TDayjs;
  minute(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.minute ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(value - this.$zdt.minute, 'minute');
  }

  second(): number;
  second(value: number): TDayjs;
  second(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.second ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(value - this.$zdt.second, 'second');
  }

  millisecond(): number;
  millisecond(value: number): TDayjs;
  millisecond(value?: number): number | TDayjs {
    if (value === undefined) {
      return this.$zdt?.millisecond ?? NaN;
    }
    if (!this.$zdt) return this._clone(null);
    return this.add(
      value - this.$zdt.millisecond,
      'millisecond',
    );
  }

  get(unit: UnitType): number {
    const u = normalizeUnit(unit);
    return this._getByUnit(u);
  }

  private _getByUnit(u: NormalizedUnit): number {
    switch (u) {
      case 'year':
        return this.year();
      case 'month':
        return this.month();
      case 'date':
        return this.date();
      case 'day':
        return this.day();
      case 'hour':
        return this.hour();
      case 'minute':
        return this.minute();
      case 'second':
        return this.second();
      case 'millisecond':
        return this.millisecond();
      case 'week':
        return this.day();
      case 'quarter':
        return Math.ceil((this.month() + 1) / 3);
    }
  }

  set(unit: UnitType, value: number): TDayjs {
    const u = normalizeUnit(unit);
    return this._setByUnit(u, value);
  }

  private _setByUnit(
    u: NormalizedUnit,
    value: number,
  ): TDayjs {
    switch (u) {
      case 'year':
        return this.year(value);
      case 'month':
        return this.month(value);
      case 'date':
        return this.date(value);
      case 'day':
        return this.day(value);
      case 'hour':
        return this.hour(value);
      case 'minute':
        return this.minute(value);
      case 'second':
        return this.second(value);
      case 'millisecond':
        return this.millisecond(value);
      default:
        return this.clone();
    }
  }

  // --- Manipulation ---

  add(value: number, unit?: ManipulateType): TDayjs {
    if (!this.$zdt) return this._clone(null);
    const n = Number(value);
    const u = normalizeUnit(unit ?? 'millisecond');
    if (u === 'quarter') {
      return this.add(n * 3, 'month');
    }
    const key = DURATION_KEY[u];
    if (!key) return this._clone(this.$zdt);
    return this._clone(addToZdt(this.$zdt, n, key));
  }

  subtract(value: number, unit?: ManipulateType): TDayjs {
    return this.add(-Number(value), unit);
  }

  startOf(unit: OpUnitType): TDayjs {
    if (!this.$zdt) return this._clone(null);
    const u = normalizeUnit(unit);
    return this._clone(
      startOfHelper(this.$zdt, u, getLocaleObj(this.$L)),
    );
  }

  endOf(unit: OpUnitType): TDayjs {
    if (!this.$zdt) return this._clone(null);
    const u = normalizeUnit(unit);
    return this._clone(
      endOfHelper(this.$zdt, u, getLocaleObj(this.$L)),
    );
  }

  // --- Comparison ---

  private _toZdt(d?: ConfigType): TDayjs {
    if (d instanceof TDayjs) return d;
    return new TDayjs({ date: d, tz: this.$tz });
  }

  isBefore(date?: ConfigType, unit?: OpUnitType): boolean {
    if (!this.$zdt) return false;
    const other = this._toZdt(date);
    if (!other.isValid()) return false;
    if (!unit) {
      return (
        Temporal.ZonedDateTime.compare(
          this.$zdt,
          other.$zdt,
        ) < 0
      );
    }
    return this.endOf(unit).valueOf() < other.valueOf();
  }

  isAfter(date?: ConfigType, unit?: OpUnitType): boolean {
    if (!this.$zdt) return false;
    const other = this._toZdt(date);
    if (!other.isValid()) return false;
    if (!unit) {
      return (
        Temporal.ZonedDateTime.compare(
          this.$zdt,
          other.$zdt,
        ) > 0
      );
    }
    return other.valueOf() < this.startOf(unit).valueOf();
  }

  isSame(date?: ConfigType, unit?: OpUnitType): boolean {
    if (!this.$zdt) return false;
    const other = this._toZdt(date);
    if (!other.isValid()) return false;
    if (!unit) {
      return (
        Temporal.ZonedDateTime.compare(
          this.$zdt,
          other.$zdt,
        ) === 0
      );
    }
    const start = this.startOf(unit).valueOf();
    const end = this.endOf(unit).valueOf();
    const v = other.valueOf();
    return start <= v && v <= end;
  }

  // --- Display ---

  format(template?: string): string {
    if (!this.$zdt) return INVALID_DATE;
    const loc = getLocaleObj(this.$L);
    return formatDate(
      this.$zdt,
      template ?? FORMAT_DEFAULT,
      loc,
    );
  }

  diff(
    date?: ConfigType,
    unit?: QUnitType | OpUnitType,
    float = false,
  ): number {
    if (!this.$zdt) return NaN;
    const other = this._toZdt(date ?? undefined);
    if (!other.$zdt) return NaN;
    const u = normalizeUnit(unit ?? 'millisecond');
    // dayjs: this.diff(other) = this - other
    // diffHelper(from, to) = from.until(to) = to - from
    // so pass (other, this) to get this - other
    return diffHelper(other.$zdt, this.$zdt, u, float);
  }

  valueOf(): number {
    return this.$zdt?.epochMilliseconds ?? NaN;
  }

  unix(): number {
    return Math.floor(this.valueOf() / 1_000);
  }

  daysInMonth(): number {
    return this.$zdt?.daysInMonth ?? NaN;
  }

  utcOffset(): number {
    if (!this.$zdt) return 0;
    return this.$zdt.offsetNanoseconds / 60_000_000_000;
  }

  // --- Conversion ---

  toDate(): Date {
    return new Date(this.valueOf());
  }

  toISOString(): string {
    if (!this.$zdt) return INVALID_DATE;
    return this.$zdt.toInstant().toString();
  }

  toJSON(): string | null {
    return this.isValid() ? this.toISOString() : null;
  }

  toString(): string {
    return this.isValid()
      ? this.toDate().toUTCString()
      : INVALID_DATE;
  }

  // --- Locale ---

  locale(): string;
  locale(
    preset: string | ILocale,
    object?: Partial<ILocale>,
  ): TDayjs;
  locale(
    preset?: string | ILocale,
    object?: Partial<ILocale>,
  ): string | TDayjs {
    if (preset === undefined) return this.$L;
    let name: string;
    if (typeof preset === 'string') {
      name = preset.toLowerCase();
      if (object) {
        registerLocale({ ...object, name } as ILocale);
      }
    } else {
      registerLocale(preset);
      name = preset.name;
    }
    return new TDayjs({
      zdt: this.$zdt,
      locale: name,
      tz: this.$tz,
    });
  }
}
