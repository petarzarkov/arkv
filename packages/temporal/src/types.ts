export interface TDayjsLike {
  readonly $zdt: Temporal.ZonedDateTime | null;
  readonly $L: string;
}

export type ConfigType =
  | string
  | number
  | Date
  | TDayjsLike
  | null
  | undefined;

export type UnitTypeShort =
  | 'd'
  | 'D'
  | 'M'
  | 'y'
  | 'h'
  | 'm'
  | 's'
  | 'ms';

export type UnitTypeLong =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'month'
  | 'year'
  | 'date';

export type UnitTypeLongPlural =
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'months'
  | 'years'
  | 'dates';

export type UnitType =
  | UnitTypeLong
  | UnitTypeLongPlural
  | UnitTypeShort;

export type OpUnitType = UnitType | 'week' | 'weeks' | 'w';

export type QUnitType =
  | UnitType
  | 'quarter'
  | 'quarters'
  | 'Q';

export type ManipulateType =
  | Exclude<OpUnitType, 'date' | 'dates'>
  | 'quarter'
  | 'quarters'
  | 'Q';
